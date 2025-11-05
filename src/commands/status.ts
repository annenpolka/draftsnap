import { readFile, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { ExitCode } from '../types/errors.js'
import { isErrno } from '../utils/fs.js'
import { resolveMainGitDir } from '../utils/gitdir.js'
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
    exclude: {
      main: {
        gitDir: boolean
        scrDir: boolean
      }
      sidecar: {
        wildcard: boolean
        scrDir: boolean
        scrGlob: boolean
      }
    }
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
  const { workTree, gitDir, scratchDir, json, logger } = options
  const headExists = await exists(join(gitDir, 'HEAD'))
  const lockExists = await exists(join(gitDir, '.draftsnap.lock'))

  async function readExcludeLines(path: string): Promise<Set<string>> {
    try {
      const content = await readFile(path, 'utf8')
      return new Set(
        content
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      )
    } catch (error) {
      if (isErrno(error, 'ENOENT') || isErrno(error, 'ENOTDIR')) {
        return new Set()
      }
      throw error
    }
  }

  const mainGitDir = await resolveMainGitDir(workTree)
  const mainExclude = mainGitDir
    ? await readExcludeLines(join(mainGitDir, 'info', 'exclude'))
    : new Set<string>()
  const gitDirRelative = relative(workTree, gitDir) || gitDir
  const mainGitDirEntry = mainExclude.has(
    `${gitDirRelative}${gitDirRelative.endsWith('/') ? '' : '/'}`,
  )
  const mainScrDir = mainExclude.has(`${scratchDir}/`)

  const sideExcludePath = join(gitDir, 'info', 'exclude')
  const sideExclude = await readExcludeLines(sideExcludePath)
  const sideWildcard = sideExclude.has('*')
  const sideScrDir = sideExclude.has(`!${scratchDir}/`)
  const sideScrGlob = sideExclude.has(`!${scratchDir}/**`)

  if (!json) {
    logger.info(`git dir: ${gitDir}`)
    logger.info(`scratch dir: ${scratchDir}`)
    logger.info(headExists ? 'initialized: yes' : 'initialized: no')
    logger.info(lockExists ? 'locked: yes' : 'locked: no')
    logger.info(
      `main exclude - git_dir: ${mainGitDirEntry ? 'true' : 'false'}, scr_dir: ${mainScrDir ? 'true' : 'false'}`,
    )
    logger.info(
      `sidecar exclude - wildcard: ${sideWildcard ? 'true' : 'false'}, scr_dir: ${sideScrDir ? 'true' : 'false'}, scr_glob: ${sideScrGlob ? 'true' : 'false'}`,
    )
  }

  return {
    status: 'ok',
    code: ExitCode.OK,
    data: {
      initialized: headExists,
      locked: lockExists,
      gitDir,
      scratchDir,
      exclude: {
        main: {
          gitDir: mainGitDirEntry,
          scrDir: mainScrDir,
        },
        sidecar: {
          wildcard: sideWildcard,
          scrDir: sideScrDir,
          scrGlob: sideScrGlob,
        },
      },
    },
  }
}
