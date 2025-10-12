import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { ExitCode } from '../types/errors.js'
import type { Logger } from '../utils/logger.js'

interface StatusCommandOptions {
  workTree: string
  gitDir: string
  scratchDir: string
  json: boolean
  logger: Logger
}

interface StatusCommandResult {
  status: 'ok'
  code: ExitCode
  data: {
    initialized: boolean
    locked: boolean
    gitDir: string
    scratchDir: string
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return false
    }
    throw error
  }
}

export async function statusCommand(options: StatusCommandOptions): Promise<StatusCommandResult> {
  const { gitDir, scratchDir, json, logger } = options
  const headExists = await exists(join(gitDir, 'HEAD'))
  const lockExists = await exists(join(gitDir, '.draftsnap.lock'))

  if (!json) {
    logger.info(`git dir: ${gitDir}`)
    logger.info(`scratch dir: ${scratchDir}`)
    logger.info(headExists ? 'initialized: yes' : 'initialized: no')
    logger.info(lockExists ? 'locked: yes' : 'locked: no')
  }

  return {
    status: 'ok',
    code: ExitCode.OK,
    data: {
      initialized: headExists,
      locked: lockExists,
      gitDir,
      scratchDir,
    },
  }
}
