import { existsSync, rmSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { LockError } from '../types/errors.js'

export interface AcquireOptions {
  timeoutMs?: number
  retryMs?: number
}

export interface LockManagerOptions {
  handleSignals?: boolean
}

const DEFAULT_TIMEOUT = 5_000
const DEFAULT_RETRY = 100

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class LockManager {
  private readonly lockDir: string
  private readonly handleSignals: boolean
  private held = false
  private cleanupRegistered = false

  constructor(gitDir: string, options: LockManagerOptions = {}) {
    this.lockDir = join(gitDir, '.draftsnap.lock')
    this.handleSignals = options.handleSignals ?? true
  }

  async acquire(options: AcquireOptions = {}): Promise<void> {
    if (this.held) {
      return
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT
    const retryMs = options.retryMs ?? DEFAULT_RETRY
    const deadline = Date.now() + timeoutMs
    const parentDir = dirname(this.lockDir)

    await mkdir(parentDir, { recursive: true })

    while (true) {
      try {
        await mkdir(this.lockDir, { recursive: false })
        this.held = true
        this.registerCleanup()
        return
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          (error as NodeJS.ErrnoException).code === 'EEXIST'
        ) {
          if (Date.now() >= deadline) {
            throw new LockError()
          }

          await wait(retryMs)
          continue
        }

        throw error
      }
    }
  }

  release(): void {
    if (!this.held) {
      return
    }

    try {
      if (existsSync(this.lockDir)) {
        rmSync(this.lockDir, { recursive: true, force: true })
      }
    } finally {
      this.held = false
      this.cleanupRegistered = false
    }
  }

  private registerCleanup(): void {
    if (this.cleanupRegistered) {
      return
    }
    if (this.handleSignals) {
      const cleanup = () => {
        this.release()
      }
      process.once('exit', cleanup)
      process.once('SIGINT', () => {
        cleanup()
        process.exit(130)
      })
      process.once('SIGTERM', () => {
        cleanup()
        process.exit(143)
      })
    }
    this.cleanupRegistered = true
  }
}
