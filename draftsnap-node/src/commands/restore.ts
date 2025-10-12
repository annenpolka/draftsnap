import { rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createGitClient } from '../core/git.js'
import { LockManager } from '../core/lock.js'
import { ensureSidecar } from '../core/repository.js'
import { ExitCode, InvalidArgsError } from '../types/errors.js'
import { Logger } from '../utils/logger.js'
import { sanitizeTargetPath } from '../utils/path.js'

interface RestoreCommandOptions {
  workTree: string
  gitDir: string
  scratchDir: string
  json: boolean
  logger: Logger
  revision: string
  path: string
}

interface RestoreCommandResult {
  status: 'ok'
  code: ExitCode
  data: {
    path: string
    bytes: number
    revision: string
    backup?: string | null
  }
}

export async function restoreCommand(options: RestoreCommandOptions): Promise<RestoreCommandResult> {
  const { workTree, gitDir, scratchDir, json, logger, revision, path } = options

  const sanitized = sanitizeTargetPath(path, workTree, scratchDir)
  if (!sanitized) {
    throw new InvalidArgsError('path must be within scratch directory')
  }

  await ensureSidecar({ workTree, gitDir, scratchDir })
  const git = createGitClient({ workTree, gitDir })
  const lock = new LockManager(gitDir)
  await lock.acquire()

  try {
    const blob = await git.exec(['show', `${revision}:${sanitized}`], { trim: false }).catch(() => {
      throw new InvalidArgsError(`unknown revision or path: ${revision}`)
    })

    const absPath = join(workTree, sanitized)
    let backup: string | null = null
    const existing = await stat(absPath).catch(() => null)
    if (existing) {
      const backupPath = `${absPath}.draftsnap.bak.${Date.now()}`
      await rename(absPath, backupPath)
      backup = backupPath
    }

    await writeFile(absPath, blob.stdout)
    const bytes = Buffer.byteLength(blob.stdout, 'utf8')

    if (!json) {
      logger.info(`restored ${sanitized} from ${revision}`)
      if (backup) {
        logger.info(`backup saved to ${backup}`)
      }
    }

    return {
      status: 'ok',
      code: ExitCode.OK,
      data: {
        path: sanitized,
        bytes,
        revision,
        backup
      }
    }
  } finally {
    lock.release()
  }
}
