import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveMainGitDir } from '../../../../src/utils/gitdir.js'

const exec = promisify(execFile)

describe('resolveMainGitDir', () => {
  let base: string

  beforeEach(async () => {
    const raw = await mkdtemp(join(tmpdir(), 'draftsnap-gitdir-'))
    base = await realpath(raw)
  })

  afterEach(async () => {
    await rm(base, { recursive: true, force: true })
  })

  it('finds .git directory at the given path', async () => {
    await exec('git', ['init', '--quiet', base])
    const result = await resolveMainGitDir(base)
    expect(result).toBe(join(base, '.git'))
  })

  it('finds .git in a parent directory when called from subdirectory', async () => {
    await exec('git', ['init', '--quiet', base])
    const sub = join(base, 'sub', 'deep')
    await mkdir(sub, { recursive: true })
    const result = await resolveMainGitDir(sub)
    expect(result).toBe(join(base, '.git'))
  })

  it('returns null when no .git exists anywhere above', async () => {
    const isolated = join(base, 'no-git')
    await mkdir(isolated)
    const result = await resolveMainGitDir(isolated)
    expect(result).toBeNull()
  })

  it('resolves .git file (worktree/submodule) with gitdir reference', async () => {
    await exec('git', ['init', '--quiet', base])
    await writeFile(join(base, 'dummy.txt'), 'init')
    await exec('git', ['-C', base, 'add', '.'])
    await exec('git', ['-C', base, 'commit', '-m', 'init', '--quiet'])

    const worktreeDir = join(base, 'wt')
    await exec('git', ['-C', base, 'worktree', 'add', '--quiet', '-b', 'wt-branch', worktreeDir])

    const result = await resolveMainGitDir(worktreeDir)
    expect(result).not.toBeNull()
    expect(result).toContain('.git/worktrees/')
  })

  it('prefers closest .git when nested repos exist', async () => {
    await exec('git', ['init', '--quiet', base])
    const child = join(base, 'child')
    await mkdir(child)
    await exec('git', ['init', '--quiet', child])

    const result = await resolveMainGitDir(child)
    expect(result).toBe(join(child, '.git'))
  })

  it('returns absolute path', async () => {
    await exec('git', ['init', '--quiet', base])
    const result = await resolveMainGitDir(base)
    expect(result).not.toBeNull()
    expect(isAbsolute(result as string)).toBe(true)
  })

  it('returns null for non-existent directory', async () => {
    const nonExistent = join(base, 'does-not-exist')
    const result = await resolveMainGitDir(nonExistent)
    expect(result).toBeNull()
  })
})
