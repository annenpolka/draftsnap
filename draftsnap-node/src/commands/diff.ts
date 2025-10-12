import { createGitClient } from '../core/git.js'
import { ensureSidecar } from '../core/repository.js'
import { ExitCode } from '../types/errors.js'
import type { Logger } from '../utils/logger.js'

interface DiffCommandOptions {
  workTree: string
  gitDir: string
  scratchDir: string
  json: boolean
  logger: Logger
  path?: string
  current?: boolean
}

interface DiffCommandResult {
  status: 'ok'
  code: ExitCode
  data: {
    patch: string
    base: string | null
    target: string
  }
}

export async function diffCommand(options: DiffCommandOptions): Promise<DiffCommandResult> {
  const { workTree, gitDir, scratchDir, json, logger, path, current } = options

  await ensureSidecar({ workTree, gitDir, scratchDir })
  const git = createGitClient({ workTree, gitDir })

  const head = await git.exec(['rev-parse', '--verify', 'HEAD']).catch(() => null)
  if (!head) {
    return {
      status: 'ok',
      code: ExitCode.OK,
      data: {
        patch: '',
        base: null,
        target: 'HEAD',
      },
    }
  }

  let patch = ''
  let base: string | null = null
  const target = current ? 'working-tree' : head.stdout

  if (current) {
    const args = ['diff']
    if (path) {
      args.push('--', path)
    }
    const result = await git.exec(args)
    patch = result.stdout
  } else {
    const parent = await git.exec(['rev-parse', 'HEAD^']).catch(() => null)
    if (!parent) {
      if (!json) {
        logger.info('no previous commit to diff against')
      }
      return {
        status: 'ok',
        code: ExitCode.OK,
        data: {
          patch: '',
          base: null,
          target: head.stdout,
        },
      }
    }
    base = parent.stdout
    const args = ['diff', `${parent.stdout}`, head.stdout]
    if (path) {
      args.push('--', path)
    }
    const result = await git.exec(args)
    patch = result.stdout
  }

  if (!json && patch) {
    logger.info(patch)
  } else if (!json) {
    logger.info('no differences')
  }

  return {
    status: 'ok',
    code: ExitCode.OK,
    data: {
      patch,
      base,
      target,
    },
  }
}
