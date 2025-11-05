import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureCommand } from '../../../src/commands/ensure.js'
import { statusCommand } from '../../../src/commands/status.js'
import { LockManager } from '../../../src/core/lock.js'
import { createLogger } from '../../../src/utils/logger.js'

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
    await mkdir(join(workTree, '.git'))
    await ensureCommand({ workTree, gitDir, scratchDir, json: true, logger })

    const result = await statusCommand({ workTree, gitDir, scratchDir, json: true, logger })

    expect(result.data.initialized).toBe(true)
    expect(result.data.locked).toBe(false)
    expect(result.data.exclude.main.gitDir).toBe(true)
    expect(result.data.exclude.main.scrDir).toBe(true)
    expect(result.data.exclude.sidecar.wildcard).toBe(true)
    expect(result.data.exclude.sidecar.scrDir).toBe(true)
    expect(result.data.exclude.sidecar.scrGlob).toBe(true)
  })

  it('reports lock status when lock directory exists', async () => {
    const logger = createLogger({ json: true })
    await mkdir(join(workTree, '.git'))
    await ensureCommand({ workTree, gitDir, scratchDir, json: true, logger })

    const lock = new LockManager(gitDir)
    await lock.acquire({ timeoutMs: 200 })

    const result = await statusCommand({ workTree, gitDir, scratchDir, json: true, logger })
    expect(result.data.locked).toBe(true)
    expect(result.data.exclude.main.gitDir).toBe(true)

    lock.release()
  })

  it('handles git worktree layouts with gitdir file', async () => {
    const logger = createLogger({ json: true })
    const mainGitDir = join(workTree, 'main.git')
    await rm(join(workTree, '.git'), { recursive: true, force: true })
    await writeFile(join(workTree, '.git'), `gitdir: ${mainGitDir}\n`)

    await ensureCommand({ workTree, gitDir, scratchDir, json: true, logger })
    const result = await statusCommand({ workTree, gitDir, scratchDir, json: true, logger })

    expect(result.data.initialized).toBe(true)
    expect(result.data.exclude.main.gitDir).toBe(true)
    expect(result.data.exclude.main.scrDir).toBe(true)
  })
})
