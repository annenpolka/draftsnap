import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { run } from '../../../src/cli.js'
import { ensureCommand } from '../../../src/commands/ensure.js'
import { snapCommand } from '../../../src/commands/snap.js'
import * as timelineModule from '../../../src/commands/timeline.js'
import { timelineCommand } from '../../../src/commands/timeline.js'
import { ExitCode } from '../../../src/types/errors.js'
import { createLogger } from '../../../src/utils/logger.js'

// Test list:
// - JSON output includes recent snapshots ordered newest-first.
// - Filtering by path limits entries to the matching scratch document.
// - When no commits exist, the command returns an empty list with ExitCode.OK.
// - When the sidecar is not initialized, the command returns ExitCode.NOT_INITIALIZED.
// - Raw mode renders pipe-friendly text without ANSI when fzf is unavailable.

describe('timeline command', () => {
  let workTree: string
  let gitDir: string
  const scratchDir = 'scratch'

  beforeEach(async () => {
    workTree = await mkdtemp(join(tmpdir(), 'draftsnap-node-timeline-'))
    gitDir = join(workTree, '.git-scratch')
    const logger = createLogger({ json: true })
    await ensureCommand({ workTree, gitDir, scratchDir, json: true, logger })
  })

  afterEach(async () => {
    await rm(workTree, { recursive: true, force: true })
  })

  it('returns JSON entries for recent snapshots', async () => {
    const logger = createLogger({ json: true })
    const target = join(workTree, scratchDir, 'notes.md')
    await writeFile(target, 'first\n')
    await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/notes.md',
      message: 'purpose: first draft',
    })

    await appendFile(target, 'second\n')
    await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/notes.md',
      message: 'purpose: second draft',
    })

    const result = await timelineCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      raw: false,
      logger,
    })

    expect(result.code).toBe(ExitCode.OK)
    expect(result.data.mode).toBe('json')
    expect(result.data.entries.length).toBeGreaterThanOrEqual(2)
    const [latest] = result.data.entries
    expect(latest.message).toBe('purpose: second draft')
    expect(latest.path).toBe('scratch/notes.md')
    expect(latest.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(typeof latest.relativeTime).toBe('string')
    expect(typeof latest.authorDate).toBe('string')
  }, 10000)

  it('returns empty list when no commits exist', async () => {
    const logger = createLogger({ json: true })
    const result = await timelineCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      raw: false,
      logger,
    })

    expect(result.code).toBe(ExitCode.OK)
    expect(result.data.entries).toEqual([])
    expect(result.data.mode).toBe('json')
  })

  it('filters entries by path', async () => {
    const logger = createLogger({ json: true })
    const firstTarget = join(workTree, scratchDir, 'notes.md')
    const secondTarget = join(workTree, scratchDir, 'other.md')

    await writeFile(firstTarget, 'one\n')
    await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/notes.md',
      message: 'purpose: add notes',
    })

    await writeFile(secondTarget, 'diff\n')
    await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/other.md',
      message: 'purpose: add other',
    })

    const result = await timelineCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      raw: false,
      logger,
      path: 'scratch/notes.md',
    })

    expect(result.code).toBe(ExitCode.OK)
    expect(result.data.entries.length).toBe(1)
    expect(result.data.entries[0]?.path).toBe('scratch/notes.md')
    expect(result.data.entries[0]?.message).toBe('purpose: add notes')
  }, 10000)

  it('produces plain-text output in raw mode', async () => {
    const infoMessages: string[] = []
    const sink = {
      info: (message: string) => infoMessages.push(message),
      warn: (_message: string) => {},
      error: (_message: string) => {},
      debug: (_message: string) => {},
    }
    const logger = createLogger({ json: false }, sink)
    const target = join(workTree, scratchDir, 'notes.md')
    await writeFile(target, 'plain\n')
    await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger: createLogger({ json: true }),
      path: 'scratch/notes.md',
      message: 'purpose: plain mode',
    })

    const result = await timelineCommand({
      workTree,
      gitDir,
      scratchDir,
      json: false,
      raw: true,
      logger,
    })

    expect(result.code).toBe(ExitCode.OK)
    expect(result.data.mode).toBe('plain')
    expect(result.data.entries.length).toBe(1)
    expect(infoMessages.length).toBeGreaterThan(0)
    expect(infoMessages[0]).toContain('purpose: plain mode')
  })

  it('rejects paths outside the scratch directory', async () => {
    const logger = createLogger({ json: true })
    await expect(
      timelineCommand({
        workTree,
        gitDir,
        scratchDir,
        json: true,
        raw: false,
        logger,
        path: 'README.md',
      }),
    ).rejects.toMatchObject({ code: ExitCode.INVALID_ARGS })
  })

  it('throws when sidecar has no commits in interactive mode', async () => {
    const logger = createLogger(
      { json: false },
      {
        info: (_message: string) => {},
        warn: (_message: string) => {},
        error: (_message: string) => {},
        debug: (_message: string) => {},
      },
    )

    await expect(
      timelineCommand({
        workTree,
        gitDir,
        scratchDir,
        json: false,
        raw: false,
        logger,
      }),
    ).rejects.toMatchObject({ code: ExitCode.NOT_INITIALIZED })
  })

  it('is accessible via CLI with --json', async () => {
    const logger = createLogger({ json: true })
    const target = join(workTree, scratchDir, 'cli.md')
    await writeFile(target, 'cli\n')
    await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/cli.md',
      message: 'purpose: cli timeline',
    })

    const originalCwd = process.cwd()
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const commandSpy = vi.spyOn(timelineModule, 'timelineCommand')
    try {
      process.chdir(workTree)
      await run(['timeline', '--json'])

      expect(commandSpy).toHaveBeenCalled()
      const firstCall = commandSpy.mock.calls[0]?.[0]
      expect(firstCall?.json).toBe(true)
      const commandResult = await commandSpy.mock.results[0]?.value
      expect(commandResult?.data.mode).toBe('json')
      expect(stdoutSpy.mock.calls.length, 'stdout call count').toBeGreaterThan(0)
      const payload = stdoutSpy.mock.calls[0]?.[0]
      expect(typeof payload).toBe('string')
      const parsed = JSON.parse((payload as string).trim())
      expect(parsed.status).toBe('ok')
      expect(parsed.data.mode).toBe('json')
      expect(parsed.data.entries.length).toBeGreaterThan(0)
    } finally {
      process.chdir(originalCwd)
      stdoutSpy.mockRestore()
      commandSpy.mockRestore()
    }
  })
})
