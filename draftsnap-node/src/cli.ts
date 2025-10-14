import type { CAC } from 'cac'
import cac from 'cac'
import { diffCommand } from './commands/diff.js'
import { ensureCommand } from './commands/ensure.js'
import { logCommand } from './commands/log.js'
import { promptCommand } from './commands/prompt.js'
import { pruneCommand } from './commands/prune.js'
import { restoreCommand } from './commands/restore.js'
import { snapCommand } from './commands/snap.js'
import { statusCommand } from './commands/status.js'
import { timelineCommand } from './commands/timeline.js'
import { DraftsnapError, ExitCode } from './types/errors.js'
import { createLogger } from './utils/logger.js'
import { readAllStdin } from './utils/stdin.js'

const DEFAULT_HINT =
  'draftsnap: run `draftsnap --help` for commands or `draftsnap prompt` for agent guidance.'

interface Context {
  workTree: string
  gitDir: string
  scratchDir: string
  json: boolean
  quiet: boolean
  debug: boolean
  logger: ReturnType<typeof createLogger>
}

function toBoolean(value: unknown): boolean {
  return value === true
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return undefined
}

function buildContext(options: Record<string, unknown>): Context {
  const scratchDir = typeof options.scratch === 'string' ? options.scratch : 'scratch'
  const gitDir = typeof options.gitDir === 'string' ? options.gitDir : '.git-scratch'
  const json = toBoolean(options.json)
  const quiet = toBoolean(options.quiet)
  const debug = toBoolean(options.debug)

  return {
    workTree: process.cwd(),
    gitDir,
    scratchDir,
    json,
    quiet,
    debug,
    logger: createLogger({ json, quiet, debug }),
  }
}

function printJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data)}\n`)
}

function printDefaultHintJson(json: boolean): void {
  if (json) {
    printJson({ status: 'ok', code: ExitCode.OK, message: DEFAULT_HINT })
  } else {
    console.log(DEFAULT_HINT)
  }
  process.exitCode = ExitCode.OK
}

async function executeWithHandling(
  cli: CAC,
  commandOptions: Record<string, unknown>,
  handler: (ctx: Context) => Promise<void>,
): Promise<void> {
  const globalOptions = cli.options ?? {}
  const ctx = buildContext({ ...globalOptions, ...commandOptions })

  try {
    await handler(ctx)
  } catch (error) {
    if (error instanceof DraftsnapError) {
      if (ctx.json) {
        printJson({
          status: error.code === ExitCode.NO_CHANGES ? 'ok' : 'error',
          code: error.code,
          message: error.message,
        })
      } else {
        console.error(error.message)
      }
      process.exitCode = error.code
    } else {
      console.error(error)
      process.exitCode = 1
    }
  }
}

export async function run(argv: string[]): Promise<void> {
  const cli = cac('draftsnap')
  cli.option('--scratch <dir>', 'scratch directory', { default: 'scratch' })
  cli.option('--git-dir <dir>', 'sidecar git directory', { default: '.git-scratch' })
  cli.option('--json', 'output JSON')
  cli.option('--quiet', 'suppress logs')
  cli.option('--debug', 'enable debug logs')

  cli.command('ensure', 'Initialize or verify the sidecar').action(async (options) => {
    await executeWithHandling(cli, options, async (ctx) => {
      const result = await ensureCommand(ctx)
      if (ctx.json) {
        printJson(result)
      }
    })
  })

  cli
    .command('snap [path]', 'Capture a snapshot from a file or stdin')
    .option('-m, --message <message>', 'Commit message')
    .option('--all', 'Snapshot all pending changes')
    .option('--stdin', 'Read content from stdin')
    .option('--space <name>', 'Optional space prefix')
    .action(async (path, options) => {
      await executeWithHandling(cli, options, async (ctx) => {
        const stdinRequested = toBoolean(options.stdin)
        const stdinContent = stdinRequested ? await readAllStdin() : undefined
        const result = await snapCommand({
          ...ctx,
          path: options.all ? undefined : path,
          message: options.message,
          all: toBoolean(options.all),
          space: options.space,
          stdinContent,
        })
        if (ctx.json) {
          printJson(result)
        }
      })
    })

  cli
    .command('log [path]', 'List snapshots with metadata')
    .option('--timeline', 'Show timeline summary for a document')
    .option('--since <n>', 'Number of commits to include')
    .action(async (path, options) => {
      await executeWithHandling(cli, options, async (ctx) => {
        const result = await logCommand({
          ...ctx,
          path,
          timeline: toBoolean(options.timeline),
          since: parseOptionalNumber(options.since),
        })
        if (ctx.json) {
          printJson(result)
        }
      })
    })

  cli
    .command('timeline [path]', 'Browse snapshot history interactively')
    .option('--raw', 'Force plain-text fallback mode')
    .option('--json', 'Output JSON (also available as global option)')
    .action(async (path, options) => {
      await executeWithHandling(cli, options, async (ctx) => {
        const json = ctx.json || toBoolean(options.json)
        const result = await timelineCommand({
          ...ctx,
          json,
          path,
          raw: toBoolean(options.raw),
        })
        if (json) {
          printJson(result)
        }
      })
    })

  cli
    .command('diff [path]', 'Compare recent snapshots or the working tree')
    .option('--current', 'Compare against working tree')
    .option('--since <n>', 'Number of commits to include')
    .action(async (path, options) => {
      await executeWithHandling(cli, options, async (ctx) => {
        const result = await diffCommand({
          ...ctx,
          path,
          current: toBoolean(options.current),
          since: parseOptionalNumber(options.since),
        })
        if (ctx.json) {
          printJson(result)
        }
      })
    })

  cli.command('status', 'Report initialization and lock status').action(async (options) => {
    await executeWithHandling(cli, options, async (ctx) => {
      const result = await statusCommand(ctx)
      if (ctx.json) {
        printJson(result)
      }
    })
  })

  cli
    .command('restore <revision> <path>', 'Restore a file from a prior snapshot')
    .action(async (revision, path, options) => {
      await executeWithHandling(cli, options, async (ctx) => {
        const result = await restoreCommand({
          ...ctx,
          revision,
          path,
        })
        if (ctx.json) {
          printJson(result)
        }
      })
    })

  cli
    .command('prune', 'Trim old snapshots, keeping the latest N commits')
    .option('--keep <n>', 'Number of commits to keep', { default: '100' })
    .action(async (options) => {
      await executeWithHandling(cli, options, async (ctx) => {
        const keep = parseOptionalNumber(options.keep) ?? 100
        const result = await pruneCommand({
          ...ctx,
          keep,
        })
        if (ctx.json) {
          printJson(result)
        }
      })
    })

  cli
    .command('prompt', 'Display guidance for using draftsnap safely')
    .option('--json', 'Output guidance as JSON')
    .action(async (options) => {
      const json = toBoolean(options.json)
      const output = promptCommand(json)
      if (json) {
        printJson(output)
      } else {
        console.log(output)
      }
      process.exitCode = ExitCode.OK
    })

  cli.help()
  cli.version('0.1.0')

  if (argv.length === 0) {
    printDefaultHintJson(false)
    return
  }

  const parsed = cli.parse(['', '', ...argv])

  if (
    !cli.matchedCommandName &&
    parsed.args.length === 0 &&
    !parsed.options.help &&
    !parsed.options.version
  ) {
    printDefaultHintJson(Boolean(parsed.options.json))
  }
}
