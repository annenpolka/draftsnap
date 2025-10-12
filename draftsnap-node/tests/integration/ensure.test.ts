import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureCommand } from '../../src/commands/ensure.js'
import { ExitCode } from '../../src/types/errors.js'
import { createLogger } from '../../src/utils/logger.js'

describe('ensure command', () => {
  let workTree: string
  let gitDir: string
  let scratchDir: string

  beforeEach(async () => {
    workTree = await mkdtemp(join(tmpdir(), 'draftsnap-node-ensure-'))
    gitDir = join(workTree, '.git-scratch')
    scratchDir = 'scratch'
  })

  afterEach(async () => {
    await rm(workTree, { recursive: true, force: true })
  })

  it('initializes sidecar and returns metadata', async () => {
    const logger = createLogger({ json: true })
    const result = await ensureCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
    })

    expect(result.code).toBe(ExitCode.OK)
    expect(result.data.initialized).toBe(true)
    expect(result.data.files).toEqual([])
  })

  it('returns existing scratch files on subsequent runs', async () => {
    const logger = createLogger({ json: true })
    await ensureCommand({ workTree, gitDir, scratchDir, json: true, logger })
    await writeFile(join(workTree, scratchDir, 'ideas.md'), 'hello')

    const result = await ensureCommand({ workTree, gitDir, scratchDir, json: true, logger })

    expect(result.data.initialized).toBe(false)
    expect(result.data.files).toEqual(['scratch/ideas.md'])
  })
})
