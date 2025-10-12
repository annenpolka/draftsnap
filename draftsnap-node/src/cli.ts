import cac from 'cac'
import { ensureCommand } from './commands/ensure.js'
import { snapCommand } from './commands/snap.js'
import { logCommand } from './commands/log.js'
import { diffCommand } from './commands/diff.js'
import { statusCommand } from './commands/status.js'
import { restoreCommand } from './commands/restore.js'
import { pruneCommand } from './commands/prune.js'
import { createLogger } from './utils/logger.js'
import { DraftsnapError, ExitCode } from './types/errors.js'
import { readAllStdin } from './utils/stdin.js'

interface GlobalOptions {
  json?: boolean
  quiet?: boolean
  debug?: boolean
  scratchDir: string
  gitDir: string
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

function printJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data)}\n`)
}

export async function run(argv: string[]): Promise<void> {
  const cli = cac('draftsnap-node')
  cli.option('--scratch <dir>', 'scratch directory', { default: 'scratch' })
  cli.option('--git-dir <dir>', 'sidecar git directory', { default: '.git-scratch' })
  cli.option('--json', 'output JSON')
  cli.option('--quiet', 'suppress logs')
  cli.option('--debug', 'enable debug logs')

  cli.command('ensure', 'Initialize or verify the sidecar').action(async options => {
    await executeWithHandling(cli, options, async ctx => {
      const result = await ensureCommand(baseCommandOptions(ctx))
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
      await executeWithHandling(cli, options, async ctx => {
        const stdinRequested = options.stdin === true
        const stdinContent = stdinRequested ? await readAllStdin() : undefined
        const result = await snapCommand({
          ...baseCommandOptions(ctx),
          path: options.all ? undefined : path,
          message: options.message,
          all: toBoolean(options.all),
          space: options.space,
          stdinContent
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
      await executeWithHandling(cli, options, async ctx => {
        const result = await logCommand({
          ...baseCommandOptions(ctx),
          path,
          timeline: toBoolean(options.timeline),
          since: parseOptionalNumber(options.since)
        })
        if (ctx.json) {
          printJson(result)
        }
      })
    })

  cli
    .command('diff [path]', 'Compare recent snapshots or the working tree')
    .option('--current', 'Compare against working tree')
    .action(async (path, options) => {
      await executeWithHandling(cli, options, async ctx => {
        const result = await diffCommand({
          ...baseCommandOptions(ctx),
          path,
          current: toBoolean(options.current)
        })
        if (ctx.json) {
          printJson(result)
        }
      })
    })

  cli.command('status', 'Report initialization and lock status').action(async options => {
    await executeWithHandling(cli, options, async ctx => {
      const result = await statusCommand(baseCommandOptions(ctx))
      if (ctx.json) {
        printJson(result)
      }
    })
  })

  cli
    .command('restore <revision> <path>', 'Restore a file from a prior snapshot')
    .action(async (revision, path, options) => {
      await executeWithHandling(cli, options, async ctx => {
        const result = await restoreCommand({
          ...baseCommandOptions(ctx),
          revision,
          path
        })
        if (ctx.json) {
          printJson(result)
        }
      })
    })

  cli
    .command('prune', 'Trim old snapshots, keeping the latest N commits')
    .option('--keep <n>', 'Number of commits to keep', { default: '100' })
    .action(async options => {
      await executeWithHandling(cli, options, async ctx => {
        const keep = parseOptionalNumber(options.keep) ?? 100
        const result = await pruneCommand({
          ...baseCommandOptions(ctx),
          keep
        })
        if (ctx.json) {
          printJson(result)
        }
      })
    })

  cli.help()
  cli.version('0.1.0')
  cli.parse(argv, { run: false })
}

async function executeWithHandling(cli: ReturnType<typeof cac>, options: any, handler: (ctx: Context) => Promise<void>): Promise<void> {
  const parsed = cli.parsed!
  const globalArgs = parsed?.options ?? {}
  const scratchDir = typeof globalArgs.scratch === 'string' ? globalArgs.scratch : 'scratch'
  const gitDir = typeof globalArgs.gitDir === 'string' ? globalArgs.gitDir : '.git-scratch'
  const ctx: Context = {
    workTree: process.cwd(),
    gitDir,
    scratchDir,
    json: toBoolean(globalArgs.json),
    logger: createLogger({ json: toBoolean(globalArgs.json), quiet: toBoolean(globalArgs.quiet), debug: toBoolean(globalArgs.debug) }),
    quiet: toBoolean(globalArgs.quiet),
    debug: toBoolean(globalArgs.debug)
  }

  try {
    await handler(ctx)
  } catch (error) {
    if (error instanceof DraftsnapError) {
      if (ctx.json) {
        printJson({ status: error.code === ExitCode.NO_CHANGES ? 'ok' : 'error', code: error.code, message: error.message })
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

interface Context {
  workTree: string
  gitDir: string
  scratchDir: string
  json: boolean
  logger: ReturnType<typeof createLogger>
  quiet: boolean
  debug: boolean
}

function baseCommandOptions(ctx: Context) {
  return {
    workTree: ctx.workTree,
    gitDir: ctx.gitDir,
    scratchDir: ctx.scratchDir,
    json: ctx.json,
    logger: ctx.logger
  }
}
