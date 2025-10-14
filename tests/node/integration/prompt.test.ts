import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { PROMPT_TEXT } from '../../../src/commands/prompt.js'

const execFileAsync = promisify(execFile)

const DIST_CLI = join(__dirname, '../../../dist/index.js')

describe('prompt command', () => {
  it('prints guidance text', async () => {
    const { stdout, stderr } = await execFileAsync('node', [DIST_CLI, 'prompt'], {
      encoding: 'utf8',
    })

    expect(stderr).toBe('')
    expect(stdout.trim()).toBe(PROMPT_TEXT)
  })

  it('prints JSON guidance when --json is provided', async () => {
    const { stdout, stderr } = await execFileAsync('node', [DIST_CLI, 'prompt', '--json'], {
      encoding: 'utf8',
    })

    expect(stderr).toBe('')
    const parsed = JSON.parse(stdout)
    expect(parsed).toEqual({ status: 'ok', code: 0, message: PROMPT_TEXT })
  })
})
