import { execFile } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureCommand } from '../../../src/commands/ensure.js'
import { restoreCommand } from '../../../src/commands/restore.js'
import { snapCommand } from '../../../src/commands/snap.js'
import { ExitCode, InvalidArgsError } from '../../../src/types/errors.js'
import { createLogger } from '../../../src/utils/logger.js'

const execFileAsync = promisify(execFile)

describe('restore command', () => {
  let workTree: string
  let gitDir: string
  const scratchDir = 'scratch'

  beforeEach(async () => {
    workTree = await mkdtemp(join(tmpdir(), 'draftsnap-node-restore-'))
    gitDir = join(workTree, '.git-scratch')
    const logger = createLogger({ json: true })
    await ensureCommand({ workTree, gitDir, scratchDir, json: true, logger })
  })

  afterEach(async () => {
    await rm(workTree, { recursive: true, force: true })
  })

  it('restores file content from previous revision and creates backup', async () => {
    const logger = createLogger({ json: true })
    const filePath = join(workTree, scratchDir, 'note.md')
    await writeFile(filePath, 'v1\n')
    const first = await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/note.md',
      message: 'purpose: v1',
    })
    await appendFile(filePath, 'v2\n')
    await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/note.md',
      message: 'purpose: v2',
    })

    await writeFile(filePath, 'corrupted\n')

    if (!first.data.commit) {
      throw new Error('expected commit hash from initial snapshot')
    }

    const result = await restoreCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      revision: first.data.commit,
      path: 'scratch/note.md',
    })

    expect(result.code).toBe(ExitCode.OK)
    expect(result.data.backup).toBeTruthy()
    const contents = await readFile(filePath, 'utf8')
    expect(contents).toBe('v1\n')
  })

  it('throws when revision is unknown', async () => {
    const logger = createLogger({ json: true })
    await expect(async () => {
      await restoreCommand({
        workTree,
        gitDir,
        scratchDir,
        json: true,
        logger,
        revision: 'deadbeef',
        path: 'scratch/missing.md',
      })
    }).rejects.toBeInstanceOf(InvalidArgsError)
  })
})

describe('restore CLI interface', () => {
  let workTree: string
  let gitDir: string
  const scratchDir = 'scratch'
  const cliPath = join(process.cwd(), 'dist', 'index.js')

  beforeEach(async () => {
    // Use realpathSync to resolve symlinks (e.g., /tmp -> /private/tmp on macOS)
    const rawWorkTree = await mkdtemp(join(tmpdir(), 'draftsnap-node-restore-cli-'))
    workTree = realpathSync(rawWorkTree)
    gitDir = join(workTree, '.git-scratch')

    const logger = createLogger({ json: true })
    await ensureCommand({ workTree, gitDir, scratchDir, json: true, logger })
  })

  afterEach(async () => {
    await rm(workTree, { recursive: true, force: true })
  })

  it('accepts revision and path as positional arguments', async () => {
    const logger = createLogger({ json: true })
    const filePath = join(workTree, scratchDir, 'note.md')
    await writeFile(filePath, 'v1\n')
    const first = await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/note.md',
      message: 'purpose: v1',
    })
    await writeFile(filePath, 'v2\n')
    await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/note.md',
      message: 'purpose: v2',
    })

    if (!first.data.commit) {
      throw new Error('expected commit hash from initial snapshot')
    }

    // Test: `restore <rev> <path>` (traditional format)
    const { stdout } = await execFileAsync('node', [
      cliPath,
      'restore',
      first.data.commit,
      'scratch/note.md',
      '--json',
      '--git-dir',
      gitDir,
      '--scratch',
      scratchDir,
    ], { cwd: workTree })

    const parsed = JSON.parse(stdout.trim())
    expect(parsed.status).toBe('ok')
    expect(parsed.code).toBe(ExitCode.OK)
    expect(parsed.data.path).toBe('scratch/note.md')

    const contents = await readFile(filePath, 'utf8')
    expect(contents).toBe('v1\n')
  })

  it('accepts -- separator between revision and path', async () => {
    const logger = createLogger({ json: true })
    const filePath = join(workTree, scratchDir, 'note.md')
    await writeFile(filePath, 'v1\n')
    const first = await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/note.md',
      message: 'purpose: v1',
    })
    await writeFile(filePath, 'v2\n')
    await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/note.md',
      message: 'purpose: v2',
    })

    if (!first.data.commit) {
      throw new Error('expected commit hash from initial snapshot')
    }

    // Test: `restore <rev> -- <path>` (with -- separator, used by timeline)
    const { stdout } = await execFileAsync('node', [
      cliPath,
      'restore',
      first.data.commit,
      '--git-dir',
      gitDir,
      '--scratch',
      scratchDir,
      '--json',
      '--',
      'scratch/note.md',
    ], { cwd: workTree })

    const parsed = JSON.parse(stdout.trim())
    expect(parsed.status).toBe('ok')
    expect(parsed.code).toBe(ExitCode.OK)
    expect(parsed.data.path).toBe('scratch/note.md')

    const contents = await readFile(filePath, 'utf8')
    expect(contents).toBe('v1\n')
  })

  it('rejects when path is missing', async () => {
    // Test: `restore <rev>` without path should fail
    try {
      await execFileAsync('node', [
        cliPath,
        'restore',
        'abc123',
        '--json',
      ], { cwd: workTree })
      expect.fail('expected command to fail')
    } catch (error) {
      const err = error as { stdout: string; code: number }
      const parsed = JSON.parse(err.stdout.trim())
      expect(parsed.status).toBe('error')
      expect(parsed.code).toBe(ExitCode.INVALID_ARGS)
      expect(parsed.message).toBe('path is required')
    }
  })
})
