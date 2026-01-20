import { existsSync, rmSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { LockError } from '../types/errors.js'
import { isErrno } from '../utils/fs.js'

const WATCH_PID_FILENAME = '.draftsnap-watch.pid'

export class WatchPidLock {
  private readonly pidPath: string
  private held = false
  private cleanupRegistered = false

  constructor(gitDir: string) {
    this.pidPath = join(gitDir, WATCH_PID_FILENAME)
  }

  async acquire(): Promise<void> {
    if (this.held) {
      return
    }

    await mkdir(dirname(this.pidPath), { recursive: true })

    try {
      await writeFile(this.pidPath, `${process.pid}\n`, { flag: 'wx' })
      this.held = true
      this.registerCleanup()
    } catch (error) {
      if (isErrno(error, 'EEXIST')) {
        throw new LockError('another watch process is running')
      }
      throw error
    }
  }

  release(): void {
    if (!this.held) {
      return
    }

    try {
      if (existsSync(this.pidPath)) {
        rmSync(this.pidPath, { force: true })
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
    process.once('exit', () => {
      this.release()
    })
    this.cleanupRegistered = true
  }
}
