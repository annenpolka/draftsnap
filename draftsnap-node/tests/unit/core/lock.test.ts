import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LockManager } from '../../../src/core/lock.js'
import { LockError } from '../../../src/types/errors.js'

const TMP_PREFIX = 'draftsnap-node-lock-' as const

describe('LockManager', () => {
  let gitDir: string

  beforeEach(async () => {
    gitDir = await mkdtemp(join(tmpdir(), TMP_PREFIX))
  })

  afterEach(async () => {
    await rm(gitDir, { recursive: true, force: true })
  })

  it('creates a lock directory and releases it', async () => {
    const lock = new LockManager(gitDir)
    await lock.acquire({ timeoutMs: 200 })
    expect(existsSync(join(gitDir, '.draftsnap.lock'))).toBe(true)

    lock.release()
    expect(existsSync(join(gitDir, '.draftsnap.lock'))).toBe(false)
  })

  it('throws LockError when already held elsewhere', async () => {
    const lockA = new LockManager(gitDir)
    await lockA.acquire({ timeoutMs: 200, retryMs: 20 })

    const lockB = new LockManager(gitDir)
    await expect(lockB.acquire({ timeoutMs: 100, retryMs: 20 })).rejects.toBeInstanceOf(LockError)

    lockA.release()
  })

  it('is idempotent when releasing multiple times', async () => {
    const lock = new LockManager(gitDir)
    await lock.acquire()
    lock.release()
    expect(() => lock.release()).not.toThrow()
  })
})
