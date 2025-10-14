import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureCommand } from '../../../src/commands/ensure.js'
import { restoreCommand } from '../../../src/commands/restore.js'
import { snapCommand } from '../../../src/commands/snap.js'
import { ExitCode, InvalidArgsError } from '../../../src/types/errors.js'
import { createLogger } from '../../../src/utils/logger.js'

describe('restore command', () => {
  let workTree: string
  let gitDir: string
  const scratchDir = 'scratch'

  beforeEach(async () => {
    workTree = await mkdtemp(join(tmpdir(), 'draftsnap-node-restore-'))
    gitDir = join(workTree, '.git-scratch')
    const logger = createLogger({ json: true })
    await ensureCommand({ workTree, gitDir, scratchDir, json: true, logger })
  })

  afterEach(async () => {
    await rm(workTree, { recursive: true, force: true })
  })

  it('restores file content from previous revision and creates backup', async () => {
    const logger = createLogger({ json: true })
    const filePath = join(workTree, scratchDir, 'note.md')
    await writeFile(filePath, 'v1\n')
    const first = await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/note.md',
      message: 'purpose: v1',
    })
    await appendFile(filePath, 'v2\n')
    await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/note.md',
      message: 'purpose: v2',
    })

    await writeFile(filePath, 'corrupted\n')

    if (!first.data.commit) {
      throw new Error('expected commit hash from initial snapshot')
    }

    const result = await restoreCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      revision: first.data.commit,
      path: 'scratch/note.md',
    })

    expect(result.code).toBe(ExitCode.OK)
    expect(result.data.backup).toBeTruthy()
    const contents = await readFile(filePath, 'utf8')
    expect(contents).toBe('v1\n')
  })

  it('throws when revision is unknown', async () => {
    const logger = createLogger({ json: true })
    await expect(async () => {
      await restoreCommand({
        workTree,
        gitDir,
        scratchDir,
        json: true,
        logger,
        revision: 'deadbeef',
        path: 'scratch/missing.md',
      })
    }).rejects.toBeInstanceOf(InvalidArgsError)
  })
})
