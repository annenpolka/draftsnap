import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureCommand } from '../../../src/commands/ensure.js'
import { snapCommand } from '../../../src/commands/snap.js'
import { timelineCommand } from '../../../src/commands/timeline.js'
import { createLogger } from '../../../src/utils/logger.js'

describe('timelineCommand interactive mode', () => {
  let workTree: string
  let gitDir: string
  const scratchDir = 'scratch'

  beforeEach(async () => {
    workTree = await mkdtemp(join(tmpdir(), 'draftsnap-node-timeline-interactive-'))
    gitDir = join(workTree, '.git-scratch')
    const logger = createLogger({ json: true })
    await ensureCommand({ workTree, gitDir, scratchDir, json: true, logger })
  })

  afterEach(async () => {
    await rm(workTree, { recursive: true, force: true })
  })

  it('launches fzf with formatted entries and waits for completion', async () => {
    const target = join(workTree, scratchDir, 'notes.md')
    await writeFile(target, 'first\n')
    const logger = createLogger({ json: true })
    await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/notes.md',
      message: 'purpose: initial',
    })
    await appendFile(target, 'second\n')
    await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/notes.md',
      message: 'purpose: update',
    })

    const writeCalls: string[] = []
    const stdin = {
      write: vi.fn((chunk: string) => {
        writeCalls.push(chunk)
        return true
      }),
      end: vi.fn(() => {}),
    }

    const spawn = vi.fn(() => ({
      stdin,
      stdout: null,
      stderr: null,
      on(event: string, handler: (code: number) => void) {
        if (event === 'close') {
          setImmediate(() => handler(0))
        }
        return this
      },
    }))

    const result = await timelineCommand({
      workTree,
      gitDir,
      scratchDir,
      json: false,
      raw: false,
      logger: createLogger(
        { json: false },
        {
          info: (_message: string) => {},
          warn: (_message: string) => {},
          error: (_message: string) => {},
          debug: (_message: string) => {},
        },
      ),
      env: {
        stdoutIsTTY: true,
        commandExists: async () => true,
        spawn,
        platform: 'darwin',
      },
    })

    expect(result.data.mode).toBe('interactive')
    expect(spawn).toHaveBeenCalledTimes(1)
    const firstCall = spawn.mock.calls[0]
    expect(firstCall).toBeDefined()
    const [command, args, options] = firstCall as [string, string[], Record<string, unknown>]
    expect(command).toBe('fzf')
    expect(Array.isArray(args)).toBe(true)
    expect(args).toContain('--with-nth=5')
    const enterBind = args.find((arg) => arg.startsWith('--bind=enter:'))
    expect(enterBind).toMatch(/\| delta \|/)
    const restoreBind = args.find((arg) => arg.startsWith('--bind=ctrl-r:'))
    expect(restoreBind).toMatch(/draftsnap restore/)
    const quitBind = args.find((arg) => arg === '--bind=esc:abort')
    expect(quitBind).toBeDefined()
    expect(options).toMatchObject({ stdio: ['pipe', 'inherit', 'inherit'] })
    expect(stdin.write).toHaveBeenCalled()
    const combined = writeCalls.join('')
    expect(combined).toMatch(/purpose: update/)
    expect(combined).toMatch(/│/)
  })

  it('uses ctrl shortcuts on non-mac platforms', async () => {
    const logger = createLogger({ json: true })
    const target = join(workTree, scratchDir, 'notes.md')
    await writeFile(target, 'one\n')
    await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/notes.md',
      message: 'purpose: base',
    })

    const stdin = {
      write: vi.fn(() => true),
      end: vi.fn(() => {}),
    }
    const spawn = vi.fn(() => ({
      stdin,
      stdout: null,
      stderr: null,
      on(event: string, handler: (code: number) => void) {
        if (event === 'close') {
          setImmediate(() => handler(0))
        }
        return this
      },
    }))

    await timelineCommand({
      workTree,
      gitDir,
      scratchDir,
      json: false,
      raw: false,
      logger: createLogger(
        { json: false },
        {
          info: () => {},
          warn: () => {},
          error: () => {},
          debug: () => {},
        },
      ),
      env: {
        stdoutIsTTY: true,
        commandExists: async () => true,
        spawn,
        platform: 'linux',
      },
    })

    const args = spawn.mock.calls[0]?.[1] as string[]
    expect(args).toContain('--with-nth=5')
    expect(args.some((arg) => arg.startsWith('--bind=ctrl-r:'))).toBe(true)
    expect(args).toContain('--bind=esc:abort')
  })
})
