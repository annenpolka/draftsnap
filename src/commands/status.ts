import { readFile, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { createGitClient } from '../core/git.js'
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
    workingTree: {
      hasUncommittedChanges: boolean
      modified: string[]
      added: string[]
      deleted: string[]
    }
  }
}

interface ParsedGitStatus {
  hasChanges: boolean
  modified: string[]
  added: string[]
  deleted: string[]
}

/**
 * Parse git status --porcelain output and categorize changes.
 *
 * Format: XY filepath
 * - X = staged status (first char)
 * - Y = unstaged status (second char)
 * - ?? = untracked file
 *
 * Status codes:
 * - M = modified
 * - A = added
 * - D = deleted
 * - R = renamed
 * - C = copied
 */
export function parseGitStatus(output: string): ParsedGitStatus {
  const lines = output.split('\n').filter(Boolean)
  const modified = new Set<string>()
  const added = new Set<string>()
  const deleted = new Set<string>()

  for (const line of lines) {
    if (line.length < 3) continue

    const statusCode = line.slice(0, 2)
    const filePath = line.slice(3).trim()

    // Skip directory entries (trailing slash indicates empty directory)
    // Git reports untracked empty directories with trailing slash
    if (filePath.endsWith('/')) {
      continue
    }

    // Handle renamed files: "R  old.md -> new.md" or "R  new.md"
    // Extract just the target filename
    const actualFilePath = filePath.includes(' -> ') ? filePath.split(' -> ')[1].trim() : filePath

    // Check staged status (first character)
    const staged = statusCode[0]
    // Check unstaged status (second character)
    const unstaged = statusCode[1]

    // Untracked files (shown as ??)
    if (statusCode === '??') {
      added.add(actualFilePath)
      continue
    }

    // Modified: M in either position
    if (staged === 'M' || unstaged === 'M') {
      modified.add(actualFilePath)
    }

    // Added: A in staged position or C (copied)
    if (staged === 'A' || staged === 'C') {
      added.add(actualFilePath)
    }

    // Deleted: D in either position
    if (staged === 'D' || unstaged === 'D') {
      deleted.add(actualFilePath)
    }

    // Renamed: R in staged position (treat as modified)
    if (staged === 'R') {
      modified.add(actualFilePath)
    }
  }

  return {
    modified: Array.from(modified).sort(),
    added: Array.from(added).sort(),
    deleted: Array.from(deleted).sort(),
    hasChanges: modified.size + added.size + deleted.size > 0,
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

  // Get working tree status
  let workingTreeStatus = {
    hasUncommittedChanges: false,
    modified: [] as string[],
    added: [] as string[],
    deleted: [] as string[],
  }

  if (headExists) {
    try {
      const git = createGitClient({ workTree, gitDir })
      // Get status for all files
      const { stdout } = await git.exec(['status', '--porcelain'])
      const parsed = parseGitStatus(stdout)

      // Filter to only include files within scratchDir
      const scratchPrefix = `${scratchDir}/`
      workingTreeStatus = {
        hasUncommittedChanges: parsed.hasChanges,
        modified: parsed.modified.filter((file) => file.startsWith(scratchPrefix)),
        added: parsed.added.filter((file) => file.startsWith(scratchPrefix)),
        deleted: parsed.deleted.filter((file) => file.startsWith(scratchPrefix)),
      }

      // Recalculate hasChanges based on filtered results
      workingTreeStatus.hasUncommittedChanges =
        workingTreeStatus.modified.length > 0 ||
        workingTreeStatus.added.length > 0 ||
        workingTreeStatus.deleted.length > 0
    } catch (error) {
      // git status failed - keep default values
      // Log the error but don't fail the entire status command
      if (!json) {
        logger.warn(`failed to get working tree status: ${error}`)
      }
    }
  }

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
    if (workingTreeStatus.hasUncommittedChanges) {
      logger.info('uncommitted changes: yes')
      logger.info(`  modified: ${workingTreeStatus.modified.length}`)
      logger.info(`  added: ${workingTreeStatus.added.length}`)
      logger.info(`  deleted: ${workingTreeStatus.deleted.length}`)
    } else {
      logger.info('uncommitted changes: no')
    }
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
      workingTree: workingTreeStatus,
    },
  }
}
