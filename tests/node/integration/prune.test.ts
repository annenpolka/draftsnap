import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureCommand } from '../../../src/commands/ensure.js'
import { logCommand } from '../../../src/commands/log.js'
import { pruneCommand } from '../../../src/commands/prune.js'
import { snapCommand } from '../../../src/commands/snap.js'
import { ExitCode } from '../../../src/types/errors.js'
import { createLogger } from '../../../src/utils/logger.js'

describe('prune command', () => {
  let workTree: string
  let gitDir: string
  const scratchDir = 'scratch'

  beforeEach(async () => {
    workTree = await mkdtemp(join(tmpdir(), 'draftsnap-node-prune-'))
    gitDir = join(workTree, '.git-scratch')
    const logger = createLogger({ json: true })
    await ensureCommand({ workTree, gitDir, scratchDir, json: true, logger })
  })

  afterEach(async () => {
    await rm(workTree, { recursive: true, force: true })
  })

  async function snapshot(message: string, file: string) {
    const logger = createLogger({ json: true })
    await writeFile(join(workTree, scratchDir, file), `${message}\n`, { flag: 'a' })
    await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: `scratch/${file}`,
      message,
    })
  }

  it('keeps only the newest commits when above threshold', async () => {
    await snapshot('purpose: one', 'history.md')
    await appendFile(join(workTree, scratchDir, 'history.md'), 'two\n')
    await snapshot('purpose: two', 'history.md')
    await appendFile(join(workTree, scratchDir, 'history.md'), 'three\n')
    await snapshot('purpose: three', 'history.md')

    const logger = createLogger({ json: true })
    const result = await pruneCommand({ workTree, gitDir, scratchDir, json: true, logger, keep: 2 })

    expect(result.code).toBe(ExitCode.OK)
    expect(result.data.kept).toBe(2)
    expect(result.data.removed).toBe(1)

    const log = await logCommand({ workTree, gitDir, scratchDir, json: true, logger })
    expect(log.data.entries.length).toBeGreaterThan(0)
  }, 10000)

  it('no-ops when commits within threshold', async () => {
    await snapshot('purpose: only', 'solo.md')
    const logger = createLogger({ json: true })
    const result = await pruneCommand({ workTree, gitDir, scratchDir, json: true, logger, keep: 5 })
    expect(result.code).toBe(ExitCode.NO_CHANGES)
  })
})
