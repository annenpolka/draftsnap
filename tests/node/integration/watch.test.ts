import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureCommand } from '../../../src/commands/ensure.js'
import { watchCommand } from '../../../src/commands/watch.js'
import { createGitClient } from '../../../src/core/git.js'
import { createLogger } from '../../../src/utils/logger.js'

async function waitForCommit(
  workTree: string,
  gitDir: string,
  message: string,
  attempts = 20,
  delayMs = 25,
): Promise<void> {
  const git = createGitClient({ workTree, gitDir })
  for (let i = 0; i < attempts; i += 1) {
    const log = await git.exec(['log', '-1', '--pretty=%s']).catch(() => null)
    if (log?.stdout === message) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  throw new Error(`timed out waiting for commit: ${message}`)
}

describe('watch command', () => {
  let workTree: string
  let gitDir: string
  const scratchDir = 'scratch'
  let abortController: AbortController | undefined
  let watchPromise: Promise<unknown> | undefined

  beforeEach(async () => {
    workTree = await mkdtemp(join(tmpdir(), 'draftsnap-node-watch-'))
    gitDir = join(workTree, '.git-scratch')
    const logger = createLogger({ json: true })
    await ensureCommand({ workTree, gitDir, scratchDir, json: true, logger })
  })

  afterEach(async () => {
    if (abortController) {
      abortController.abort('SIGINT')
    }
    if (watchPromise) {
      await watchPromise
    }
    await rm(workTree, { recursive: true, force: true })
  })

  it('snapshots a file when it changes', async () => {
    const logger = createLogger({ json: true })
    let readyResolve: (() => void) | undefined
    const readyPromise = new Promise<void>((resolve) => {
      readyResolve = resolve
    })

    abortController = new AbortController()
    watchPromise = watchCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      pattern: 'scratch/**/*.md',
      debounceMs: 20,
      includeDelete: false,
      initialSnap: false,
      signal: abortController.signal,
      env: {
        onReady: () => readyResolve?.(),
      },
    })

    await readyPromise

    const target = join(workTree, scratchDir, 'notes.md')
    await writeFile(target, 'hello\n')

    await waitForCommit(workTree, gitDir, 'auto: notes.md')

    abortController.abort('SIGINT')
    await watchPromise

    const git = createGitClient({ workTree, gitDir })
    const log = await git.exec(['log', '-1', '--pretty=%s'])
    expect(log.stdout).toBe('auto: notes.md')
  })
})
