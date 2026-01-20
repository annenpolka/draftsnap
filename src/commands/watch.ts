import { isAbsolute, relative } from 'node:path'
import chokidar, { type ChokidarOptions, type FSWatcher } from 'chokidar'
import { createGitClient } from '../core/git.js'
import { ensureSidecar } from '../core/repository.js'
import { WatchPidLock } from '../core/watch-lock.js'
import { DraftsnapError, ExitCode, InvalidArgsError } from '../types/errors.js'
import { createLogger, type Logger } from '../utils/logger.js'
import { sanitizeTargetPath } from '../utils/path.js'
import { snapCommand } from './snap.js'
import { parseGitStatus } from './status.js'

export type WatchAction = 'update' | 'delete'

interface DebounceScheduler {
  schedule(path: string, action: WatchAction): void
  cancel(path: string): void
  cancelAll(): void
}

export function createDebounceScheduler(
  debounceMs: number,
  onFire: (path: string, action: WatchAction) => void,
): DebounceScheduler {
  const timers = new Map<string, { timer: NodeJS.Timeout; action: WatchAction }>()

  const schedule = (path: string, action: WatchAction) => {
    const existing = timers.get(path)
    if (existing) {
      clearTimeout(existing.timer)
    }
    const timer = setTimeout(() => {
      timers.delete(path)
      onFire(path, action)
    }, debounceMs)
    timers.set(path, { timer, action })
  }

  const cancel = (path: string) => {
    const existing = timers.get(path)
    if (!existing) {
      return
    }
    clearTimeout(existing.timer)
    timers.delete(path)
  }

  const cancelAll = () => {
    timers.forEach((entry) => {
      clearTimeout(entry.timer)
    })
    timers.clear()
  }

  return { schedule, cancel, cancelAll }
}

interface WatchCommandEnv {
  createWatcher?: (
    pattern: string | string[],
    options: ChokidarOptions,
  ) => Pick<FSWatcher, 'on' | 'close'>
  onReady?: () => void
}

interface WatchCommandOptions {
  workTree: string
  gitDir: string
  scratchDir: string
  json: boolean
  quiet?: boolean
  debug?: boolean
  logger: Logger
  pattern?: string
  debounceMs?: number
  includeDelete?: boolean
  initialSnap?: boolean
  verbose?: boolean
  signal?: AbortSignal
  env?: WatchCommandEnv
}

interface WatchCommandResult {
  status: 'ok'
  code: ExitCode
  data: {
    snapsCount: number
    pattern: string
    debounce: number
  }
}

const DEFAULT_PATTERN = 'scratch/**/*.md'
const DEFAULT_DEBOUNCE = 500

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/')
}

const REGEX_ESCAPE = /[.+^${}()|[\]\\]/g

function escapeRegex(value: string): string {
  return value.replace(REGEX_ESCAPE, '\\$&')
}

function globToRegex(pattern: string): RegExp {
  const normalized = normalizePath(pattern)
  let regex = ''
  let index = 0

  while (index < normalized.length) {
    const char = normalized[index]
    if (char === '*') {
      let starCount = 1
      while (normalized[index + starCount] === '*') {
        starCount += 1
      }
      if (starCount > 1) {
        index += starCount
        if (normalized[index] === '/') {
          regex += '(?:.*\\/)?'
          index += 1
        } else {
          regex += '.*'
        }
        continue
      }
      regex += '[^/]*'
      index += 1
      continue
    }
    if (char === '?') {
      regex += '[^/]'
      index += 1
      continue
    }
    regex += escapeRegex(char)
    index += 1
  }

  return new RegExp(`^${regex}$`)
}

export function createPatternMatcher(pattern: string): (candidate: string) => boolean {
  const matcher = globToRegex(pattern)
  return (candidate) => matcher.test(normalizePath(candidate))
}

function extractWatchRoot(pattern: string): string {
  const normalized = normalizePath(pattern)
  const segments = normalized.split('/')
  const root: string[] = []

  for (const segment of segments) {
    if (segment.includes('*') || segment.includes('?')) {
      break
    }
    root.push(segment)
  }

  return root.length > 0 ? root.join('/') : normalized
}

function resolvePattern(pattern: string, workTree: string): string {
  const normalized = normalizePath(pattern)
  if (normalized.split('/').some((segment) => segment === '..')) {
    throw new InvalidArgsError('pattern must not traverse outside the working tree')
  }
  if (isAbsolute(normalized)) {
    const rel = normalizePath(relative(workTree, normalized))
    if (!rel || rel.startsWith('..')) {
      throw new InvalidArgsError('pattern must be within the working tree')
    }
    return rel
  }
  return normalized
}

function emitJsonLine(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`)
}

export async function watchCommand(options: WatchCommandOptions): Promise<WatchCommandResult> {
  const {
    workTree,
    gitDir,
    scratchDir,
    json,
    quiet,
    logger,
    pattern,
    debounceMs,
    includeDelete,
    initialSnap,
    verbose,
    signal,
    env,
  } = options

  const resolvedPattern = resolvePattern(pattern ?? DEFAULT_PATTERN, workTree)
  if (!resolvedPattern || resolvedPattern.trim().length === 0) {
    throw new InvalidArgsError('pattern is required')
  }
  if (resolvedPattern !== scratchDir && !resolvedPattern.startsWith(`${scratchDir}/`)) {
    throw new InvalidArgsError('pattern must target the scratch directory')
  }

  const debounce = debounceMs ?? DEFAULT_DEBOUNCE
  if (!Number.isFinite(debounce) || debounce < 0) {
    throw new InvalidArgsError('--debounce must be >= 0')
  }

  const matchesPattern = createPatternMatcher(resolvedPattern)
  const watchRoot = extractWatchRoot(resolvedPattern)
  const watchLogger = verbose ? createLogger({ json, quiet, debug: true }) : logger
  const watchLock = new WatchPidLock(gitDir)
  await watchLock.acquire()

  try {
    await ensureSidecar({ workTree, gitDir, scratchDir })
  } catch (error) {
    watchLock.release()
    throw error
  }

  const createWatcher =
    env?.createWatcher ??
    ((watchPattern, watchOptions) => {
      return chokidar.watch(watchPattern, watchOptions)
    })

  let snapCount = 0
  let stopping = false
  const scheduler = createDebounceScheduler(debounce, (path, action) => {
    enqueueSnap(path, action)
  })

  let resolveStop: (result: WatchCommandResult) => void = () => undefined
  const stopPromise = new Promise<WatchCommandResult>((resolve) => {
    resolveStop = resolve
  })

  const snapQueue = { current: Promise.resolve() }

  const enqueueSnap = (path: string, action: WatchAction) => {
    snapQueue.current = snapQueue.current
      .then(() => runSnap(path, action))
      .catch((error) => {
        handleRuntimeError(error)
      })
  }

  const handleRuntimeError = (error: unknown) => {
    if (error instanceof DraftsnapError) {
      if (error.code === ExitCode.NO_CHANGES) {
        return
      }
      if (json) {
        emitJsonLine({ status: 'error', code: error.code, message: error.message })
      } else {
        watchLogger.error(error.message)
      }
      return
    }

    const message = error instanceof Error ? error.message : String(error)
    if (json) {
      emitJsonLine({ status: 'error', code: 1, message })
    } else {
      watchLogger.error(message)
    }
  }

  const runSnap = async (path: string, action: WatchAction) => {
    const relativePath = path.startsWith(`${scratchDir}/`)
      ? path.slice(`${scratchDir}/`.length)
      : path
    const result = await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger: watchLogger,
      path,
      message: `auto: ${relativePath}`,
      allowMissing: action === 'delete',
      lockSignals: false,
    })

    if (result.code === ExitCode.NO_CHANGES) {
      return
    }

    snapCount += 1

    if (json) {
      emitJsonLine({
        event: 'snap',
        data: {
          commit: result.data.commit,
          path: result.data.path,
          bytes: result.data.bytes,
        },
      })
    } else {
      watchLogger.info(`snap stored ${result.data.path} at ${result.data.commit}`)
    }
  }

  const queueInitialDeletions = async () => {
    if (initialSnap === false || !includeDelete) {
      return
    }

    const git = createGitClient({ workTree, gitDir })
    const { stdout } = await git.exec(['status', '--porcelain'])
    const parsed = parseGitStatus(stdout)

    parsed.deleted
      .map((entry) => normalizePath(entry))
      .forEach((entry) => {
        const sanitized = sanitizeTargetPath(entry, workTree, scratchDir)
        if (!sanitized || !matchesPattern(sanitized)) {
          return
        }
        scheduler.schedule(sanitized, 'delete')
      })
  }

  const stop = async (reason: string) => {
    if (stopping) {
      return
    }
    stopping = true
    scheduler.cancelAll()
    detachSignals()
    await Promise.resolve(watcher.close()).catch(() => undefined)
    await snapQueue.current
    watchLock.release()

    if (json) {
      emitJsonLine({ event: 'stopped', data: { reason, snaps_count: snapCount } })
    } else {
      watchLogger.info(`watch stopped (${snapCount} snaps)`)
    }

    resolveStop({
      status: 'ok',
      code: ExitCode.OK,
      data: {
        snapsCount: snapCount,
        pattern: resolvedPattern,
        debounce,
      },
    })
  }

  const handleEvent = (eventPath: string, action: WatchAction) => {
    if (stopping) {
      return
    }
    const normalized = normalizePath(eventPath)
    let sanitized = sanitizeTargetPath(normalized, workTree, scratchDir)
    if (!sanitized && !isAbsolute(normalized)) {
      const prefixed = normalizePath(`${scratchDir}/${normalized}`)
      sanitized = sanitizeTargetPath(prefixed, workTree, scratchDir)
    }
    if (!sanitized) {
      watchLogger.debug(`ignored non-scratch path: ${normalized}`)
      return
    }

    if (!matchesPattern(sanitized)) {
      return
    }

    if (action === 'delete' && !includeDelete) {
      scheduler.cancel(sanitized)
      return
    }

    scheduler.schedule(sanitized, action)
  }

  let watcher: Pick<FSWatcher, 'on' | 'close'>
  try {
    watcher = createWatcher(watchRoot, {
      cwd: workTree,
      ignoreInitial: initialSnap === false,
    })
  } catch (error) {
    watchLock.release()
    throw error
  }

  watcher.on('add', (path) => handleEvent(path, 'update'))
  watcher.on('change', (path) => handleEvent(path, 'update'))
  watcher.on('unlink', (path) => handleEvent(path, 'delete'))
  watcher.on('error', (error) => handleRuntimeError(error))
  watcher.on('ready', () => {
    void queueInitialDeletions().catch((error) => {
      handleRuntimeError(error)
    })
    env?.onReady?.()
  })

  if (json) {
    emitJsonLine({ event: 'started', data: { pattern: resolvedPattern, debounce } })
  } else {
    watchLogger.info(`watching ${resolvedPattern} (debounce ${debounce}ms)`)
  }

  const handleSigint = () => {
    void stop('SIGINT')
  }
  const handleSigterm = () => {
    void stop('SIGTERM')
  }

  const detachSignals = () => {
    process.off('SIGINT', handleSigint)
    process.off('SIGTERM', handleSigterm)
    if (signal) {
      signal.removeEventListener('abort', handleAbort)
    }
  }

  const handleAbort = () => {
    const reason = typeof signal?.reason === 'string' ? signal.reason : 'ABORT'
    void stop(reason)
  }

  process.once('SIGINT', handleSigint)
  process.once('SIGTERM', handleSigterm)
  if (signal) {
    if (signal.aborted) {
      handleAbort()
    } else {
      signal.addEventListener('abort', handleAbort)
    }
  }

  return stopPromise
}
