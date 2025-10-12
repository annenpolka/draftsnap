import { mkdtemp, rm, rename, symlink, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { createGitClient } from '../core/git.js'
import { ensureSidecar } from '../core/repository.js'
import { ExitCode, InvalidArgsError } from '../types/errors.js'
import { Logger } from '../utils/logger.js'

const execFileAsync = promisify(execFile)

interface PruneCommandOptions {
  workTree: string
  gitDir: string
  scratchDir: string
  json: boolean
  logger: Logger
  keep: number
}

interface PruneCommandResult {
  status: 'ok'
  code: ExitCode
  data: {
    kept: number
    removed: number
    removedCommits: string[]
  }
}

export async function pruneCommand(options: PruneCommandOptions): Promise<PruneCommandResult> {
  const { workTree, gitDir, scratchDir, json, logger, keep } = options

  if (!Number.isInteger(keep) || keep < 1) {
    throw new InvalidArgsError('--keep must be >= 1')
  }

  await ensureSidecar({ workTree, gitDir, scratchDir })
  const git = createGitClient({ workTree, gitDir })

  const revList = await git.exec(['rev-list', '--reverse', 'HEAD']).catch(() => ({ stdout: '' }))
  const commits = revList.stdout.split('\n').map(line => line.trim()).filter(Boolean)

  if (commits.length === 0) {
    return {
      status: 'ok',
      code: ExitCode.NO_CHANGES,
      data: { kept: 0, removed: 0, removedCommits: [] }
    }
  }

  if (commits.length <= keep) {
    if (!json) {
      logger.info('already within threshold')
    }
    return {
      status: 'ok',
      code: ExitCode.NO_CHANGES,
      data: { kept: commits.length, removed: 0, removedCommits: [] }
    }
  }

  const removeCount = commits.length - keep
  const removedCommits = commits.slice(0, removeCount)

  const tmpClone = await mkdtemp(join(tmpdir(), 'draftsnap-node-prune-'))
  const tempGitLink = join(workTree, '.git')

  try {
    await rm(tempGitLink, { recursive: true, force: true }).catch(() => null)
    await symlink(gitDir, tempGitLink)
    await execFileAsync('git', ['clone', '--quiet', '--depth', String(keep), '--no-checkout', '.', tmpClone], {
      cwd: workTree,
      env: { ...process.env }
    })

    await rm(gitDir, { recursive: true, force: true })
    await rename(join(tmpClone, '.git'), gitDir)

    const refreshedGit = createGitClient({ workTree, gitDir })
    await refreshedGit.exec(['reset', '--hard'])

    if (!json) {
      logger.info(`removed ${removeCount} commits, kept ${keep}`)
    }

    return {
      status: 'ok',
      code: ExitCode.OK,
      data: {
        kept: keep,
        removed: removeCount,
        removedCommits
      }
    }
  } finally {
    await unlink(tempGitLink).catch(() => {})
    await rm(tmpClone, { recursive: true, force: true })
  }
}
