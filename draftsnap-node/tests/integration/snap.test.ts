import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureCommand } from '../../src/commands/ensure.js'
import { snapCommand } from '../../src/commands/snap.js'
import { createGitClient } from '../../src/core/git.js'
import { ExitCode, InvalidArgsError } from '../../src/types/errors.js'
import { createLogger } from '../../src/utils/logger.js'

describe('snap command', () => {
  let workTree: string
  let gitDir: string
  let scratchDir: string

  beforeEach(async () => {
    workTree = await mkdtemp(join(tmpdir(), 'draftsnap-node-snap-'))
    gitDir = join(workTree, '.git-scratch')
    scratchDir = 'scratch'
    const logger = createLogger({ json: true })
    await ensureCommand({ workTree, gitDir, scratchDir, json: true, logger })
  })

  afterEach(async () => {
    await rm(workTree, { recursive: true, force: true })
  })

  it('commits a single file under scratch', async () => {
    const logger = createLogger({ json: true })
    const target = join(workTree, scratchDir, 'note.md')
    await writeFile(target, 'hello world\n')

    const result = await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/note.md',
      message: 'purpose: add note',
    })

    expect(result.code).toBe(ExitCode.OK)
    expect(result.data.path).toBe('scratch/note.md')
    expect(result.data.bytes).toBe(12)

    const git = createGitClient({ workTree, gitDir })
    const log = await git.exec(['log', '-1', '--pretty=%s'])
    expect(log.stdout).toBe('purpose: add note')
  })

  it('returns exit code 10 when nothing changed', async () => {
    const logger = createLogger({ json: true })
    const target = join(workTree, scratchDir, 'empty.md')
    await writeFile(target, '')
    await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/empty.md',
      message: 'purpose: seed',
    })

    const result = await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/empty.md',
      message: 'purpose: no-op',
    })

    expect(result.code).toBe(ExitCode.NO_CHANGES)
    expect(result.data.commit).toBeNull()
  })

  it('commits all pending files with --all', async () => {
    const logger = createLogger({ json: true })
    await writeFile(join(workTree, scratchDir, 'a.md'), 'A\n')
    await writeFile(join(workTree, scratchDir, 'b.md'), 'B\n')

    const result = await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      all: true,
      message: 'purpose: batch',
    })

    expect(result.code).toBe(ExitCode.OK)
    expect(result.data.paths.sort()).toEqual(['scratch/a.md', 'scratch/b.md'])
    expect(result.data.files_count).toBe(2)
  })

  it('captures file paths under a space when provided', async () => {
    const logger = createLogger({ json: true })
    const result = await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'notes/today.md',
      space: 'logs',
    })

    expect(result.code).toBe(ExitCode.OK)
    expect(result.data.path).toBe('scratch/logs/notes/today.md')

    const git = createGitClient({ workTree, gitDir })
    const log = await git.exec(['log', '-1', '--pretty=%s'])
    expect(log.stdout).toBe('[space:logs] snap: scratch/logs/notes/today.md')
  })

  it('rejects --all combined with space option', async () => {
    const logger = createLogger({ json: true })

    await expect(
      snapCommand({
        workTree,
        gitDir,
        scratchDir,
        json: true,
        logger,
        all: true,
        space: 'logs',
      }),
    ).rejects.toThrowError(InvalidArgsError)
  })
})
