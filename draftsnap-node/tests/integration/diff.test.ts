import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { diffCommand } from '../../src/commands/diff.js'
import { ensureCommand } from '../../src/commands/ensure.js'
import { snapCommand } from '../../src/commands/snap.js'
import { createGitClient } from '../../src/core/git.js'
import { createLogger } from '../../src/utils/logger.js'

const scratchDir = 'scratch'

describe('diff command', () => {
  let workTree: string
  let gitDir: string

  beforeEach(async () => {
    workTree = await mkdtemp(join(tmpdir(), 'draftsnap-node-diff-'))
    gitDir = join(workTree, '.git-scratch')
    const logger = createLogger({ json: true })
    await ensureCommand({ workTree, gitDir, scratchDir, json: true, logger })
  })

  afterEach(async () => {
    await rm(workTree, { recursive: true, force: true })
  })

  it('returns per-file stats between latest commits', async () => {
    const logger = createLogger({ json: true })
    const target = join(workTree, scratchDir, 'diff.md')
    await writeFile(target, 'one\n')
    await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/diff.md',
      message: 'purpose: add diff',
    })
    await appendFile(target, 'two\n')
    await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/diff.md',
      message: 'purpose: update diff',
    })

    const git = createGitClient({ workTree, gitDir })
    const latest = await git.exec(['rev-parse', 'HEAD'])
    const previous = await git.exec(['rev-parse', 'HEAD~1'])

    const result = await diffCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/diff.md',
    })

    expect(result.status).toBe('ok')
    expect(result.data.patch).toContain('+two')
    expect(result.data.entries).toEqual([
      {
        path: 'scratch/diff.md',
        added: 1,
        removed: 0,
      },
    ])
    expect(result.data.basis).toEqual({
      type: 'latest_pair',
      new: latest.stdout,
      old: previous.stdout,
    })
  })

  it('shows working tree diff when current flag used', async () => {
    const logger = createLogger({ json: true })
    const target = join(workTree, scratchDir, 'draft.md')
    await writeFile(target, 'alpha\n')
    await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/draft.md',
      message: 'purpose: add draft',
    })
    await appendFile(target, 'beta\n')

    const git = createGitClient({ workTree, gitDir })
    const base = await git.exec(['rev-parse', 'HEAD'])

    const result = await diffCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/draft.md',
      current: true,
    })

    expect(result.status).toBe('ok')
    expect(result.data.patch).toContain('+beta')
    expect(result.data.entries).toEqual([
      {
        path: 'scratch/draft.md',
        added: 1,
        removed: 0,
      },
    ])
    expect(result.data.basis).toEqual({
      type: 'current',
      new: 'working',
      old: base.stdout,
    })
  })

  it('supports since option to compare against older history', async () => {
    const logger = createLogger({ json: true })
    const target = join(workTree, scratchDir, 'history.md')
    await writeFile(target, 'one\n')
    await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/history.md',
      message: 'purpose: add one',
    })
    await appendFile(target, 'two\n')
    await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/history.md',
      message: 'purpose: add two',
    })
    await appendFile(target, 'three\n')
    await snapCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/history.md',
      message: 'purpose: add three',
    })

    const git = createGitClient({ workTree, gitDir })
    const head = await git.exec(['rev-parse', 'HEAD'])
    const base = await git.exec(['rev-parse', 'HEAD~2'])

    const result = await diffCommand({
      workTree,
      gitDir,
      scratchDir,
      json: true,
      logger,
      path: 'scratch/history.md',
      since: 2,
    })

    expect(result.status).toBe('ok')
    expect(result.data.entries).toEqual([
      {
        path: 'scratch/history.md',
        added: 2,
        removed: 0,
      },
    ])
    expect(result.data.basis).toEqual({
      type: 'since',
      since: 2,
      new: head.stdout,
      old: base.stdout,
    })
  })
})
