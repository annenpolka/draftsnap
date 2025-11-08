import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureCommand } from '../../../src/commands/ensure.js'
import { snapCommand } from '../../../src/commands/snap.js'
import { statusCommand } from '../../../src/commands/status.js'
import { LockManager } from '../../../src/core/lock.js'
import { createLogger } from '../../../src/utils/logger.js'

describe('status command', () => {
  let workTree: string
  let gitDir: string
  const scratchDir = 'scratch'

  beforeEach(async () => {
    workTree = await mkdtemp(join(tmpdir(), 'draftsnap-node-status-'))
    gitDir = join(workTree, '.git-scratch')
  })

  afterEach(async () => {
    await rm(workTree, { recursive: true, force: true })
  })

  it('reports initialized and unlocked state', async () => {
    const logger = createLogger({ json: true })
    await mkdir(join(workTree, '.git'))
    await ensureCommand({ workTree, gitDir, scratchDir, json: true, logger })

    const result = await statusCommand({ workTree, gitDir, scratchDir, json: true, logger })

    expect(result.data.initialized).toBe(true)
    expect(result.data.locked).toBe(false)
    expect(result.data.exclude.main.gitDir).toBe(true)
    expect(result.data.exclude.main.scrDir).toBe(true)
    expect(result.data.exclude.sidecar.wildcard).toBe(true)
    expect(result.data.exclude.sidecar.scrDir).toBe(true)
    expect(result.data.exclude.sidecar.scrGlob).toBe(true)
  })

  it('reports lock status when lock directory exists', async () => {
    const logger = createLogger({ json: true })
    await mkdir(join(workTree, '.git'))
    await ensureCommand({ workTree, gitDir, scratchDir, json: true, logger })

    const lock = new LockManager(gitDir)
    await lock.acquire({ timeoutMs: 200 })

    const result = await statusCommand({ workTree, gitDir, scratchDir, json: true, logger })
    expect(result.data.locked).toBe(true)
    expect(result.data.exclude.main.gitDir).toBe(true)

    lock.release()
  })

  it('handles git worktree layouts with gitdir file', async () => {
    const logger = createLogger({ json: true })
    const mainGitDir = join(workTree, 'main.git')
    await rm(join(workTree, '.git'), { recursive: true, force: true })
    await writeFile(join(workTree, '.git'), `gitdir: ${mainGitDir}\n`)

    await ensureCommand({ workTree, gitDir, scratchDir, json: true, logger })
    const result = await statusCommand({ workTree, gitDir, scratchDir, json: true, logger })

    expect(result.data.initialized).toBe(true)
    expect(result.data.exclude.main.gitDir).toBe(true)
    expect(result.data.exclude.main.scrDir).toBe(true)
  })

  describe('working tree status', () => {
    it('reports no uncommitted changes when clean', async () => {
      const logger = createLogger({ json: true })
      await mkdir(join(workTree, '.git'))
      await ensureCommand({ workTree, gitDir, scratchDir, json: true, logger })

      const result = await statusCommand({ workTree, gitDir, scratchDir, json: true, logger })

      expect(result.data.workingTree.hasUncommittedChanges).toBe(false)
      expect(result.data.workingTree.modified).toEqual([])
      expect(result.data.workingTree.added).toEqual([])
      expect(result.data.workingTree.deleted).toEqual([])
    })

    it('reports modified files', async () => {
      const logger = createLogger({ json: true })
      await mkdir(join(workTree, '.git'))
      await ensureCommand({ workTree, gitDir, scratchDir, json: true, logger })

      // Create and commit initial file
      const file = join(workTree, scratchDir, 'test.md')
      await writeFile(file, 'initial content\n')
      await snapCommand({
        workTree,
        gitDir,
        scratchDir,
        json: true,
        logger,
        path: 'scratch/test.md',
        message: 'initial',
        all: false,
      })

      // Modify the file
      await writeFile(file, 'modified content\n')

      const result = await statusCommand({ workTree, gitDir, scratchDir, json: true, logger })

      expect(result.data.workingTree.hasUncommittedChanges).toBe(true)
      expect(result.data.workingTree.modified).toEqual(['scratch/test.md'])
      expect(result.data.workingTree.added).toEqual([])
      expect(result.data.workingTree.deleted).toEqual([])
    })

    it('reports added files', async () => {
      const logger = createLogger({ json: true })
      await mkdir(join(workTree, '.git'))
      await ensureCommand({ workTree, gitDir, scratchDir, json: true, logger })

      // Create an initial commit to establish a baseline
      const initialFile = join(workTree, scratchDir, 'existing.md')
      await writeFile(initialFile, 'existing\n')
      await snapCommand({
        workTree,
        gitDir,
        scratchDir,
        json: true,
        logger,
        path: 'scratch/existing.md',
        message: 'initial',
        all: false,
      })

      // Now add a new file
      const file = join(workTree, scratchDir, 'new.md')
      await writeFile(file, 'new file\n')

      const result = await statusCommand({ workTree, gitDir, scratchDir, json: true, logger })

      expect(result.data.workingTree.hasUncommittedChanges).toBe(true)
      expect(result.data.workingTree.modified).toEqual([])
      expect(result.data.workingTree.added).toEqual(['scratch/new.md'])
      expect(result.data.workingTree.deleted).toEqual([])
    })

    it('reports deleted files', async () => {
      const logger = createLogger({ json: true })
      await mkdir(join(workTree, '.git'))
      await ensureCommand({ workTree, gitDir, scratchDir, json: true, logger })

      // Create and commit initial file
      const file = join(workTree, scratchDir, 'delete-me.md')
      await writeFile(file, 'to be deleted\n')
      await snapCommand({
        workTree,
        gitDir,
        scratchDir,
        json: true,
        logger,
        path: 'scratch/delete-me.md',
        message: 'initial',
        all: false,
      })

      // Delete the file
      await rm(file)

      const result = await statusCommand({ workTree, gitDir, scratchDir, json: true, logger })

      expect(result.data.workingTree.hasUncommittedChanges).toBe(true)
      expect(result.data.workingTree.modified).toEqual([])
      expect(result.data.workingTree.added).toEqual([])
      expect(result.data.workingTree.deleted).toEqual(['scratch/delete-me.md'])
    })

    it('reports multiple file types together', async () => {
      const logger = createLogger({ json: true })
      await mkdir(join(workTree, '.git'))
      await ensureCommand({ workTree, gitDir, scratchDir, json: true, logger })

      // Create and commit existing file
      await writeFile(join(workTree, scratchDir, 'existing.md'), 'existing\n')
      await snapCommand({
        workTree,
        gitDir,
        scratchDir,
        json: true,
        logger,
        path: 'scratch/existing.md',
        message: 'initial',
        all: false,
      })

      // Modify existing file
      await writeFile(join(workTree, scratchDir, 'existing.md'), 'modified\n')

      // Add new file
      await writeFile(join(workTree, scratchDir, 'new.md'), 'new\n')

      // Create and delete another file
      await writeFile(join(workTree, scratchDir, 'to-delete.md'), 'delete\n')
      await snapCommand({
        workTree,
        gitDir,
        scratchDir,
        json: true,
        logger,
        path: 'scratch/to-delete.md',
        message: 'add to delete',
        all: false,
      })
      await rm(join(workTree, scratchDir, 'to-delete.md'))

      const result = await statusCommand({ workTree, gitDir, scratchDir, json: true, logger })

      expect(result.data.workingTree.hasUncommittedChanges).toBe(true)
      expect(result.data.workingTree.modified).toContain('scratch/existing.md')
      expect(result.data.workingTree.added).toContain('scratch/new.md')
      expect(result.data.workingTree.deleted).toContain('scratch/to-delete.md')
    })

    it('handles uninitialized repository gracefully', async () => {
      const logger = createLogger({ json: true })

      const result = await statusCommand({ workTree, gitDir, scratchDir, json: true, logger })

      expect(result.data.initialized).toBe(false)
      expect(result.data.workingTree.hasUncommittedChanges).toBe(false)
      expect(result.data.workingTree.modified).toEqual([])
      expect(result.data.workingTree.added).toEqual([])
      expect(result.data.workingTree.deleted).toEqual([])
    })
  })
})
