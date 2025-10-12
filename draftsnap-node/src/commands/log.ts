import { createGitClient } from '../core/git.js'
import { ensureSidecar } from '../core/repository.js'
import { ExitCode, InvalidArgsError } from '../types/errors.js'
import type { Logger } from '../utils/logger.js'
import { sanitizeTargetPath } from '../utils/path.js'
import { computeTimelineBar, type TimelineEntry } from '../utils/timeline.js'

interface LogCommandOptions {
  workTree: string
  gitDir: string
  scratchDir: string
  json: boolean
  logger: Logger
  path?: string
  timeline?: boolean
  since?: number
}

interface LogEntry {
  commit: string
  timestamp: string
  message: string
  path?: string
}

interface LogCommandResult {
  status: 'ok'
  code: ExitCode
  data: {
    entries: LogEntry[]
    timeline?: {
      summary: {
        commits: number
        totalAdditions: number
        totalDeletions: number
        net: number
      }
      bars: {
        scale: number
        filled: number
      }
      entries: TimelineEntry[]
      path: string
    }
  }
}

function parsePrettyLog(output: string): LogEntry[] {
  if (!output.trim()) {
    return []
  }
  const lines = output.split('\n')
  const entries: LogEntry[] = []
  let current: LogEntry | undefined
  for (const line of lines) {
    if (!line.trim()) {
      continue
    }
    const [commit, timestamp, message] = line.split('\u001f')
    if (commit && timestamp) {
      current = { commit, timestamp, message }
      entries.push(current)
    }
  }
  return entries
}

function parseNumstat(
  output: string,
  targetPath: string,
): {
  entries: TimelineEntry[]
  summary: { commits: number; totalAdditions: number; totalDeletions: number; net: number }
} {
  if (!output.trim()) {
    return {
      entries: [],
      summary: { commits: 0, totalAdditions: 0, totalDeletions: 0, net: 0 },
    }
  }

  const lines = output.split('\n')
  const entries: TimelineEntry[] = []
  let totalAdditions = 0
  let totalDeletions = 0
  let currentCommit: TimelineEntry | undefined

  for (const line of lines) {
    if (!line.trim()) {
      continue
    }
    if (line.startsWith('commit ')) {
      const [, commit] = line.split(' ')
      currentCommit = {
        commit,
        timestamp: '',
        message: '',
        additions: 0,
        deletions: 0,
        highlights: [],
      }
      entries.push(currentCommit)
      continue
    }
    if (line.startsWith('date ')) {
      if (currentCommit) {
        currentCommit.timestamp = line.slice(5)
      }
      continue
    }
    if (line.startsWith('message ')) {
      if (currentCommit) {
        currentCommit.message = line.slice(8)
      }
      continue
    }
    const numstatMatch = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/)
    if (numstatMatch && currentCommit) {
      const [, addStr, delStr, file] = numstatMatch
      if (file !== targetPath) {
        continue
      }
      const additions = addStr === '-' ? 0 : Number(addStr)
      const deletions = delStr === '-' ? 0 : Number(delStr)
      currentCommit.additions += additions
      currentCommit.deletions += deletions
      totalAdditions += additions
      totalDeletions += deletions
      if (additions > 0) {
        currentCommit.highlights.push({ type: 'add', text: `+${additions} lines` })
      }
      if (deletions > 0) {
        currentCommit.highlights.push({ type: 'del', text: `-${deletions} lines` })
      }
    }
  }

  const filtered = entries
    .filter((entry) => entry.additions > 0 || entry.deletions > 0 || entry.message)
    .map((entry) => ({
      ...entry,
      highlights: entry.highlights.slice(0, 2),
    }))

  return {
    entries: filtered,
    summary: {
      commits: filtered.length,
      totalAdditions,
      totalDeletions,
      net: totalAdditions - totalDeletions,
    },
  }
}

export async function logCommand(options: LogCommandOptions): Promise<LogCommandResult> {
  const { workTree, gitDir, scratchDir, json, logger, path, timeline, since } = options

  await ensureSidecar({ workTree, gitDir, scratchDir })
  const git = createGitClient({ workTree, gitDir })

  const head = await git.exec(['rev-parse', '--verify', 'HEAD']).catch(() => null)
  if (!head) {
    return {
      status: 'ok',
      code: ExitCode.OK,
      data: { entries: [] },
    }
  }

  if (timeline) {
    if (!path) {
      throw new InvalidArgsError('timeline mode requires -- <path>')
    }
    const sanitizedPath = sanitizeTargetPath(path, workTree, scratchDir)
    if (!sanitizedPath) {
      throw new InvalidArgsError('path must be within scratch directory')
    }
    const args = [
      'log',
      '--follow',
      '--date=iso-strict',
      `--pretty=commit %H\ndate %ad\nmessage %s`,
      '--numstat',
    ]
    if (since && since > 0) {
      args.push(`-${since}`)
    }
    args.push('--', sanitizedPath)
    const { stdout } = await git.exec(args)
    const parsed = parseNumstat(stdout, sanitizedPath)
    if (!json) {
      if (parsed.entries.length === 0) {
        logger.info(`no timeline entries for ${sanitizedPath}`)
      } else {
        logger.info(`timeline for ${sanitizedPath}`)
        parsed.entries.forEach((entry) => {
          logger.info(`${entry.timestamp} ${entry.message} +${entry.additions}/-${entry.deletions}`)
        })
      }
    }
    const bars = computeTimelineBar(parsed.entries.length, {
      scale: 10,
      maxCommits: Math.max(1, parsed.entries.length),
    })
    return {
      status: 'ok',
      code: ExitCode.OK,
      data: {
        entries: [],
        timeline: {
          summary: parsed.summary,
          bars,
          entries: parsed.entries,
          path: sanitizedPath,
        },
      },
    }
  }

  const format = '%H\u001f%ad\u001f%s'
  const args = ['log', '--date=iso-strict', `--pretty=${format}`]
  if (since && since > 0) {
    args.push(`-${since}`)
  }
  if (path) {
    args.push('--', path)
  }
  const { stdout } = await git.exec(args)
  const entries = parsePrettyLog(stdout)

  if (!json) {
    if (entries.length === 0) {
      logger.info('no log entries')
    } else {
      entries.forEach((entry) => {
        logger.info(`${entry.commit.slice(0, 7)} ${entry.timestamp} ${entry.message}`)
      })
    }
  }

  return {
    status: 'ok',
    code: ExitCode.OK,
    data: { entries },
  }
}
