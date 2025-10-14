import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGitClient, GitError } from '../../../../src/core/git.js'

const TMP_PREFIX = 'draftsnap-node-git-' as const

describe('createGitClient', () => {
  let workTree: string
  let gitDir: string

  beforeEach(async () => {
    workTree = await mkdtemp(join(tmpdir(), TMP_PREFIX))
    gitDir = join(workTree, '.git-scratch')
  })

  afterEach(async () => {
    await rm(workTree, { recursive: true, force: true })
  })

  it('initializes and reports clean status', async () => {
    const git = createGitClient({ workTree, gitDir })

    await git.exec(['init', '--quiet'])
    const { stdout } = await git.exec(['status', '--short', '--untracked-files=no'])

    expect(stdout).toBe('')
  })

  it('captures stdout from git commands', async () => {
    const git = createGitClient({ workTree, gitDir })
    await git.exec(['init', '--quiet'])

    await writeFile(join(workTree, 'README.md'), '# Hello\n')
    await git.exec(['add', '--', 'README.md'])
    const { stdout } = await git.exec(['diff', '--cached', '--name-only'])

    expect(stdout.trim()).toBe('README.md')
  })

  it('throws GitError with context on non-zero exit', async () => {
    const git = createGitClient({ workTree, gitDir })
    await git.exec(['init', '--quiet'])

    await expect(git.exec(['rev-parse', '--verify', 'nonexistent'])).rejects.toBeInstanceOf(
      GitError,
    )
  })
})
