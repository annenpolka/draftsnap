import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureCommand } from '../../../src/commands/ensure.js'
import { logCommand } from '../../../src/commands/log.js'
import { snapCommand } from '../../../src/commands/snap.js'
import { ExitCode } from '../../../src/types/errors.js'
import { createLogger } from '../../../src/utils/logger.js'

describe('log command', () => {
  let workTree: string
  let gitDir: string
  const scratchDir = 'scratch'

  beforeEach(async () => {
    workTree = await mkdtemp(join(tmpdir(), 'draftsnap-node-log-'))
    gitDir = join(workTree, '.git-scratch')
    const logger = createLogger({ json: true })
    await ensureCommand({ workTree, gitDir, scratchDir, json: true, logger })
  })

  afterEach(async () => {
    await rm(workTree, { recursive: true, force: true })
  })

  it('returns empty entries when no commits exist', async () => {
    const logger = createLogger({ json: true })
    const result = await logCommand({ workTree, gitDir, scratchDir, json: true, logger })
    expect(result.code).toBe(ExitCode.OK)
    expect(result.data.entries).toEqual([])
  })

  it('lists commits for given path', async () => {
    const logger = createLogger({ json: true })
    const target = join(workTree, scratchDir, 'doc.md')
    await writeFile(target, 'v1\n')
    await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/doc.md',
      message: 'purpose: add doc',
    })
    await appendFile(target, 'v2\n')
    await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/doc.md',
      message: 'purpose: update doc',
    })

    const result = await logCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/doc.md',
    })

    expect(result.data.entries.length).toBe(2)
    expect(result.data.entries[0].message).toBe('purpose: update doc')
    expect(result.data.entries[0].path).toBe('scratch/doc.md')
  })

  it('builds timeline summary for a document', async () => {
    const logger = createLogger({ json: true })
    const target = join(workTree, scratchDir, 'timeline.md')
    await writeFile(target, 'one\n')
    await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/timeline.md',
      message: 'purpose: add timeline',
    })
    await appendFile(target, 'two\n')
    await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/timeline.md',
      message: 'purpose: update timeline',
    })

    const result = await logCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/timeline.md',
      timeline: true,
    })

    expect(result.data.timeline).toBeDefined()
    expect(result.data.timeline?.entries.length).toBeGreaterThan(0)
    expect(result.data.timeline?.summary.totalAdditions).toBeGreaterThan(0)
  })
})
