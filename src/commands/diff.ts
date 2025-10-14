import { createGitClient } from '../core/git.js'
import { ensureSidecar } from '../core/repository.js'
import { ExitCode, InvalidArgsError } from '../types/errors.js'
import type { Logger } from '../utils/logger.js'
import { sanitizeTargetPath } from '../utils/path.js'

interface DiffCommandOptions {
  workTree: string
  gitDir: string
  scratchDir: string
  json: boolean
  logger: Logger
  path?: string
  current?: boolean
  since?: number
}

interface DiffEntry {
  path: string
  added: number
  removed: number
}

type DiffBasis =
  | { type: 'none' }
  | { type: 'current'; new: string; old: string }
  | { type: 'latest_pair'; new: string; old: string | null }
  | { type: 'since'; since: number; new: string; old: string | null }

interface DiffCommandResult {
  status: 'ok'
  code: ExitCode
  data: {
    basis: DiffBasis
    entries: DiffEntry[]
    patch: string
  }
}

function parseNumstat(output: string): DiffEntry[] {
  if (!output.trim()) {
    return []
  }

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split('\t'))
    .filter((parts): parts is [string, string, string] => parts.length === 3)
    .map(([addedRaw, removedRaw, file]) => {
      const added = addedRaw === '-' ? 0 : Number.parseInt(addedRaw, 10)
      const removed = removedRaw === '-' ? 0 : Number.parseInt(removedRaw, 10)
      return {
        path: file,
        added: Number.isNaN(added) ? 0 : added,
        removed: Number.isNaN(removed) ? 0 : removed,
      }
    })
}

export async function diffCommand(options: DiffCommandOptions): Promise<DiffCommandResult> {
  const { workTree, gitDir, scratchDir, json, logger, path, current, since } = options

  await ensureSidecar({ workTree, gitDir, scratchDir })
  const git = createGitClient({ workTree, gitDir })

  let sanitizedPath: string | undefined
  if (path) {
    const candidate = sanitizeTargetPath(path, workTree, scratchDir)
    if (!candidate) {
      throw new InvalidArgsError('path must be within scratch directory')
    }
    sanitizedPath = candidate
  }

  const head = await git.exec(['rev-parse', '--verify', 'HEAD']).catch(() => null)
  if (!head) {
    return {
      status: 'ok',
      code: ExitCode.OK,
      data: {
        basis: { type: 'none' },
        entries: [],
        patch: '',
      },
    }
  }

  const pathArgs = sanitizedPath ? ['--', sanitizedPath] : []

  if (current) {
    const patchArgs = ['diff', 'HEAD', ...pathArgs]
    const numstatArgs = ['diff', '--numstat', 'HEAD', ...pathArgs]
    const patchResult = await git.exec(patchArgs)
    const numstatResult = await git.exec(numstatArgs)
    const entries = parseNumstat(numstatResult.stdout)

    if (!json) {
      if (patchResult.stdout) {
        logger.info(patchResult.stdout)
      } else if (entries.length > 0) {
        entries.forEach((entry) => {
          logger.info(`${entry.path} +${entry.added} -${entry.removed}`)
        })
      } else {
        logger.info('no differences')
      }
    }

    return {
      status: 'ok',
      code: ExitCode.OK,
      data: {
        basis: { type: 'current', new: 'working', old: head.stdout },
        entries,
        patch: patchResult.stdout,
      },
    }
  }

  if (since !== undefined && (!Number.isInteger(since) || since < 1)) {
    throw new InvalidArgsError('--since must be >= 1')
  }

  if (since === undefined) {
    const parent = await git.exec(['rev-parse', 'HEAD^']).catch(() => null)
    if (!parent) {
      if (!json) {
        logger.info('no previous commit to diff against')
      }
      return {
        status: 'ok',
        code: ExitCode.OK,
        data: {
          basis: { type: 'latest_pair', new: head.stdout, old: null },
          entries: [],
          patch: '',
        },
      }
    }

    const patchArgs = ['diff', parent.stdout, head.stdout, ...pathArgs]
    const numstatArgs = ['diff', '--numstat', parent.stdout, head.stdout, ...pathArgs]
    const patchResult = await git.exec(patchArgs)
    const numstatResult = await git.exec(numstatArgs)
    const entries = parseNumstat(numstatResult.stdout)

    if (!json) {
      if (patchResult.stdout) {
        logger.info(patchResult.stdout)
      } else if (entries.length > 0) {
        entries.forEach((entry) => {
          logger.info(`${entry.path} +${entry.added} -${entry.removed}`)
        })
      } else {
        logger.info('no differences')
      }
    }

    return {
      status: 'ok',
      code: ExitCode.OK,
      data: {
        basis: { type: 'latest_pair', new: head.stdout, old: parent.stdout },
        entries,
        patch: patchResult.stdout,
      },
    }
  }

  const offset = since
  const baseRef = await git.exec(['rev-parse', `HEAD~${offset}`]).catch(() => null)
  if (!baseRef) {
    return {
      status: 'ok',
      code: ExitCode.OK,
      data: {
        basis: { type: 'since', since: offset, new: head.stdout, old: null },
        entries: [],
        patch: '',
      },
    }
  }

  const patchArgs = ['diff', baseRef.stdout, head.stdout, ...pathArgs]
  const numstatArgs = ['diff', '--numstat', baseRef.stdout, head.stdout, ...pathArgs]
  const patchResult = await git.exec(patchArgs)
  const numstatResult = await git.exec(numstatArgs)
  const entries = parseNumstat(numstatResult.stdout)

  if (!json) {
    if (patchResult.stdout) {
      logger.info(patchResult.stdout)
    } else if (entries.length > 0) {
      entries.forEach((entry) => {
        logger.info(`${entry.path} +${entry.added} -${entry.removed}`)
      })
    } else {
      logger.info('no differences')
    }
  }

  return {
    status: 'ok',
    code: ExitCode.OK,
    data: {
      basis: { type: 'since', since: offset, new: head.stdout, old: baseRef.stdout },
      entries,
      patch: patchResult.stdout,
    },
  }
}
