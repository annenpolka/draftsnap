import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WatchPidLock } from '../../../../src/core/watch-lock.js'
import { LockError } from '../../../../src/types/errors.js'

const TMP_PREFIX = 'draftsnap-node-watch-lock-' as const

describe('WatchPidLock', () => {
  let gitDir: string

  beforeEach(async () => {
    gitDir = await mkdtemp(join(tmpdir(), TMP_PREFIX))
  })

  afterEach(async () => {
    await rm(gitDir, { recursive: true, force: true })
  })

  it('creates and releases the PID file', async () => {
    const lock = new WatchPidLock(gitDir)
    await lock.acquire()
    expect(existsSync(join(gitDir, '.draftsnap-watch.pid'))).toBe(true)

    lock.release()
    expect(existsSync(join(gitDir, '.draftsnap-watch.pid'))).toBe(false)
  })

  it('throws when another watch lock exists', async () => {
    const lockA = new WatchPidLock(gitDir)
    await lockA.acquire()

    const lockB = new WatchPidLock(gitDir)
    await expect(lockB.acquire()).rejects.toBeInstanceOf(LockError)

    lockA.release()
  })
})
