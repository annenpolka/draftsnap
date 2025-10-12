import { ensureSidecar } from '../core/repository.js'
import { ExitCode } from '../types/errors.js'
import { Logger } from '../utils/logger.js'

interface EnsureCommandOptions {
  workTree: string
  gitDir: string
  scratchDir: string
  json: boolean
  logger: Logger
}

interface EnsureCommandResult {
  status: 'ok'
  code: ExitCode
  data: {
    initialized: boolean
    gitDir: string
    scratchDir: string
    files: string[]
  }
}

export async function ensureCommand(options: EnsureCommandOptions): Promise<EnsureCommandResult> {
  const { workTree, gitDir, scratchDir, json, logger } = options
  const result = await ensureSidecar({ workTree, gitDir, scratchDir })

  if (!json) {
    if (result.initialized) {
      logger.info(`initialized sidecar at ${gitDir}`)
    } else {
      logger.info('sidecar already initialized')
    }
    if (result.files.length > 0) {
      logger.info(`tracked files:\n${result.files.join('\n')}`)
    }
  }

  return {
    status: 'ok',
    code: ExitCode.OK,
    data: {
      initialized: result.initialized,
      gitDir: result.gitDir,
      scratchDir: result.scratchDir,
      files: result.files
    }
  }
}
