import { execFile, spawn as spawnProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { createGitClient } from '../core/git.js'
import { ensureSidecar } from '../core/repository.js'
import { ExitCode, InvalidArgsError, NotInitializedError } from '../types/errors.js'
import type { Logger } from '../utils/logger.js'
import { sanitizeTargetPath } from '../utils/path.js'

interface TimelineCommandOptions {
  workTree: string
  gitDir: string
  scratchDir: string
  json: boolean
  raw: boolean
  logger: Logger
  path?: string
  env?: {
    stdoutIsTTY?: boolean
    commandExists?: (command: string) => Promise<boolean>
    spawn?: typeof spawnProcess
    platform?: NodeJS.Platform
  }
}

interface TimelineEntry {
  commit: string
  relativeTime: string
  authorDate: string
  message: string
  path: string
}

interface TimelineModeContext {
  json: boolean
  raw: boolean
  stdoutIsTTY: boolean
  hasFzf: boolean
}

export function decideTimelineMode(context: TimelineModeContext): 'json' | 'plain' | 'interactive' {
  if (context.json) {
    return 'json'
  }
  if (context.raw || !context.stdoutIsTTY) {
    return 'plain'
  }
  if (context.hasFzf) {
    return 'interactive'
  }
  return 'plain'
}

interface TimelineCommandResult {
  status: 'ok'
  code: ExitCode
  data: {
    mode: 'json' | 'plain' | 'interactive'
    entries: TimelineEntry[]
  }
}

function parseLog(output: string, fallbackPath?: string): TimelineEntry[] {
  if (!output.trim()) {
    return []
  }

  const lines = output.split('\n')
  const entries: TimelineEntry[] = []
  let current: Partial<TimelineEntry> | null = null
  let inPathSection = false

  const finalize = () => {
    if (
      current &&
      current.commit &&
      current.relativeTime &&
      current.authorDate &&
      current.message
    ) {
      const path = current.path ?? fallbackPath ?? ''
      entries.push({
        commit: current.commit,
        relativeTime: current.relativeTime,
        authorDate: current.authorDate,
        message: current.message,
        path,
      })
    }
    current = null
    inPathSection = false
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line) {
      if (current) {
        if (!inPathSection) {
          inPathSection = true
        } else {
          finalize()
        }
      } else {
        finalize()
      }
      continue
    }
    if (line.startsWith('commit ')) {
      finalize()
      current = { commit: line.slice(7).trim() }
      inPathSection = false
      continue
    }
    if (!current) {
      continue
    }
    if (line.startsWith('relative ')) {
      current.relativeTime = line.slice(9).trim()
      continue
    }
    if (line.startsWith('author ')) {
      current.authorDate = line.slice(7).trim()
      continue
    }
    if (line.startsWith('message ')) {
      current.message = line.slice(8)
      continue
    }
    if (!current.path) {
      current.path = line.trim()
    }
    inPathSection = true
  }

  finalize()

  return entries
}

export async function timelineCommand(options: TimelineCommandOptions): Promise<TimelineCommandResult> {
  const { workTree, gitDir, scratchDir, json, raw, logger, path, env } = options

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

  const stdoutIsTTY = env?.stdoutIsTTY ?? Boolean(process.stdout?.isTTY)
  const platform = env?.platform ?? process.platform
  let hasFzf = false
  if (!json && !raw && stdoutIsTTY) {
    const exists = env?.commandExists ?? commandExists
    hasFzf = await exists('fzf')
  }
  const mode = decideTimelineMode({ json, raw, stdoutIsTTY, hasFzf })

  const head = await git.exec(['rev-parse', '--verify', 'HEAD']).catch(() => null)
  if (!head) {
    if (mode === 'json') {
      return {
        status: 'ok',
        code: ExitCode.OK,
        data: { mode: 'json', entries: [] },
      }
    }
    throw new NotInitializedError()
  }

  const args = [
    'log',
    '--date=iso-strict',
    '--pretty=format:commit %H%nrelative %ar%nauthor %aI%nmessage %s',
    '--name-only',
  ]
  if (sanitizedPath) {
    args.push('--', sanitizedPath)
  }

  const { stdout } = await git.exec(args)
  const entries = parseLog(stdout, sanitizedPath)

  if (mode === 'plain') {
    entries.forEach((entry) => {
      logger.info(`${entry.relativeTime} │ ${entry.path} │ ${entry.message}`)
    })
    return {
      status: 'ok',
      code: ExitCode.OK,
      data: { mode: 'plain', entries },
    }
  }

  if (mode === 'json') {
    return {
      status: 'ok',
      code: ExitCode.OK,
      data: { mode: 'json', entries },
    }
  }

  const spawnFn = env?.spawn ?? spawnProcess
  const exists = env?.commandExists ?? commandExists
  const code = await runInteractiveTimeline({
    entries,
    gitDir,
    workTree,
    spawn: spawnFn,
    commandExists: exists,
    platform,
  })

  return {
    status: 'ok',
    code,
    data: { mode: 'interactive', entries },
  }
}

const execFileAsync = promisify(execFile)

async function commandExists(command: string): Promise<boolean> {
  const checker = process.platform === 'win32' ? 'where' : 'which'
  try {
    await execFileAsync(checker, [command])
    return true
  } catch {
    return false
  }
}

interface InteractiveParams {
  entries: TimelineEntry[]
  gitDir: string
  workTree: string
  spawn: typeof spawnProcess
  commandExists: (command: string) => Promise<boolean>
  platform: NodeJS.Platform
}

function shellQuote(value: string): string {
  const escaped = value.replace(/(["\\$`])/g, '\\$1')
  return `"${escaped}"`
}

async function runInteractiveTimeline(params: InteractiveParams): Promise<ExitCode> {
  const { entries, gitDir, workTree, spawn, commandExists, platform } = params
  if (entries.length === 0) {
    return ExitCode.OK
  }

  const delimiter = String.fromCharCode(31)
  const previewBase = `git --git-dir=${shellQuote(gitDir)} --work-tree=${shellQuote(workTree)} show {1}`
  const useDelta = await commandExists('delta')
  const previewCommand = useDelta ? `${previewBase} | delta` : previewBase
  const pager = process.env.PAGER ?? 'less -R'
  const diffPipeline = useDelta ? `${previewBase} | delta` : previewBase
  const diffCommand = `sh -c ${shellQuote(`${diffPipeline} | ${pager}`)}`
  const restoreCommand =
    "sh -c " +
    shellQuote(
      'read -r -p "Restore {3}? [y/N] " ans < /dev/tty && [ "$ans" = y ] && draftsnap restore {1} -- "{3}"',
    )

  const modifier = 'ctrl'
  const modifierLabel = 'Ctrl'

  const args = [
    '--ansi',
    '--no-sort',
    `--delimiter=${delimiter}`,
    '--with-nth=5',
    `--header=${'Enter: view diff | Ctrl-R: restore | Esc: quit'}`,
    `--preview=${previewCommand}`,
    '--preview-window=right:60%:wrap',
    `--bind=enter:execute(${diffCommand})`,
    `--bind=${modifier}-r:execute(${restoreCommand})+abort`,
    '--bind=esc:abort',
  ]

  const child = spawn('fzf', args, { stdio: ['pipe', 'inherit', 'inherit'] })
  entries.forEach((entry) => {
    const display = `${entry.relativeTime} │ ${entry.path} │ ${entry.message}`
    child.stdin.write(
      `${entry.commit}${delimiter}${entry.relativeTime}${delimiter}${entry.path}${delimiter}${entry.message}${delimiter}${display}\n`,
    )
  })
  child.stdin.end()

  const exitCode = await new Promise<number>((resolve) => {
    child.on('close', (code) => {
      if (typeof code === 'number') {
        resolve(code)
      } else {
        resolve(0)
      }
    })
  })

  return ExitCode.OK
}
