import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ensureCommand } from '../../src/commands/ensure.js'
import { statusCommand } from '../../src/commands/status.js'
import { createLogger } from '../../src/utils/logger.js'
import { LockManager } from '../../src/core/lock.js'

describe('status command', () => {
  let workTree: string
  let gitDir: string
  const scratchDir = 'scratch'

  beforeEach(async () => {
    workTree = await mkdtemp(join(tmpdir(), 'draftsnap-node-status-'))
    gitDir = join(workTree, '.git-scratch')
  })

  afterEach(async () => {
    await rm(workTree, { recursive: true, force: true })
  })

  it('reports initialized and unlocked state', async () => {
    const logger = createLogger({ json: true })
    await ensureCommand({ workTree, gitDir, scratchDir, json: true, logger })

    const result = await statusCommand({ workTree, gitDir, scratchDir, json: true, logger })

    expect(result.data.initialized).toBe(true)
    expect(result.data.locked).toBe(false)
  })

  it('reports lock status when lock directory exists', async () => {
    const logger = createLogger({ json: true })
    await ensureCommand({ workTree, gitDir, scratchDir, json: true, logger })

    const lock = new LockManager(gitDir)
    await lock.acquire({ timeoutMs: 200 })

    const result = await statusCommand({ workTree, gitDir, scratchDir, json: true, logger })
    expect(result.data.locked).toBe(true)

    lock.release()
  })
})
