import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createGitClient } from '../core/git.js'
import { LockManager } from '../core/lock.js'
import { ensureSidecar } from '../core/repository.js'
import { ExitCode, InvalidArgsError } from '../types/errors.js'
import type { Logger } from '../utils/logger.js'
import { sanitizeTargetPath } from '../utils/path.js'

interface SnapCommandOptions {
  workTree: string
  gitDir: string
  scratchDir: string
  json: boolean
  logger: Logger
  path?: string
  message?: string
  space?: string
  all?: boolean
  stdinContent?: string
}

interface SnapCommandResult {
  status: 'ok'
  code: ExitCode
  data: {
    commit: string | null
    path: string | null
    paths: string[]
    files_count: number
    bytes: number
  }
}

async function ensureFileExists(
  _targetPath: string,
  absPath: string,
  stdinContent?: string,
): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true })
  if (stdinContent !== undefined) {
    await writeFile(absPath, stdinContent)
    return
  }
  try {
    await stat(absPath)
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      await writeFile(absPath, '')
      return
    }
    throw error
  }
}

export async function snapCommand(options: SnapCommandOptions): Promise<SnapCommandResult> {
  const { workTree, gitDir, scratchDir, json, logger, message, path, all, stdinContent } = options

  const lock = new LockManager(gitDir)
  await lock.acquire()

  try {
    await ensureSidecar({ workTree, gitDir, scratchDir })
    const git = createGitClient({ workTree, gitDir })

    let stagedPaths: string[] = []
    let targetPath: string | null = null

    if (all) {
      await git.exec(['add', '-f', scratchDir])
      const diff = await git.exec(['diff', '--cached', '--name-only'])
      stagedPaths = diff.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      if (stagedPaths.length === 0) {
        if (!json) {
          logger.info(`no pending changes under ${scratchDir}`)
        }
        return {
          status: 'ok',
          code: ExitCode.NO_CHANGES,
          data: { commit: null, path: null, paths: [], files_count: 0, bytes: 0 },
        }
      }
    } else {
      if (!path) {
        throw new InvalidArgsError('snap requires a target path')
      }
      const sanitized = sanitizeTargetPath(path, workTree, scratchDir)
      if (!sanitized) {
        throw new InvalidArgsError('path must be within scratch directory')
      }
      targetPath = sanitized
      const absTarget = join(workTree, sanitized)
      await ensureFileExists(sanitized, absTarget, stdinContent)
      await git.exec(['add', '--', sanitized])
      const diff = await git.exec(['diff', '--cached', '--name-only'])
      stagedPaths = diff.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      stagedPaths = stagedPaths.filter((entry) => entry === sanitized)
      if (stagedPaths.length === 0) {
        if (!json) {
          logger.info(`no changes for ${sanitized}`)
        }
        return {
          status: 'ok',
          code: ExitCode.NO_CHANGES,
          data: { commit: null, path: sanitized, paths: [], files_count: 0, bytes: 0 },
        }
      }
    }

    let totalBytes = 0
    for (const staged of stagedPaths) {
      const size = await stat(join(workTree, staged))
      totalBytes += size.size
    }

    const commitMessage = message ?? (all ? 'snap: all' : `snap: ${targetPath}`)
    await git.exec(['commit', '--quiet', '-m', commitMessage])
    const commit = await git.exec(['rev-parse', 'HEAD'])

    if (!json) {
      if (all) {
        logger.info(`snap stored ${stagedPaths.length} files at ${commit.stdout}`)
      } else {
        logger.info(`snap stored ${targetPath} at ${commit.stdout}`)
      }
    }

    return {
      status: 'ok',
      code: ExitCode.OK,
      data: {
        commit: commit.stdout,
        path: targetPath,
        paths: stagedPaths,
        files_count: stagedPaths.length,
        bytes: totalBytes,
      },
    }
  } finally {
    lock.release()
  }
}
