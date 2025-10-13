import { afterEach, describe, expect, it, vi } from 'vitest'
import { run } from '../../src/cli.js'

const DEFAULT_HINT =
  'draftsnap: run `draftsnap --help` for commands or `draftsnap prompt` for agent guidance.'

describe('CLI default behaviour', () => {
  const originalExitCode = process.exitCode

  afterEach(() => {
    process.exitCode = originalExitCode ?? 0
    vi.restoreAllMocks()
  })

  it('prints guidance when no command is provided', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await run([])

    expect(logSpy).toHaveBeenCalledWith(DEFAULT_HINT)
    expect(process.exitCode ?? 0).toBe(0)
  })

  it('prints guidance in JSON when only --json is provided', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await run(['--json'])

    expect(writeSpy).toHaveBeenCalled()
    const output = writeSpy.mock.calls[0]?.[0]
    expect(typeof output).toBe('string')
    const parsed = JSON.parse((output as string).trim())
    expect(parsed).toEqual({ status: 'ok', code: 0, message: DEFAULT_HINT })
    expect(process.exitCode ?? 0).toBe(0)
  })
})
