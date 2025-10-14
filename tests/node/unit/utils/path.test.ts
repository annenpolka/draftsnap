import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sanitizeTargetPath } from '../../../../src/utils/path.js'

const SCR_DIR = 'scratch'

describe('sanitizeTargetPath', () => {
  let workTree: string

  beforeEach(async () => {
    workTree = await mkdtemp(join(tmpdir(), 'draftsnap-node-path-'))
  })

  afterEach(async () => {
    await rm(workTree, { recursive: true, force: true })
  })

  it('accepts a relative path inside scratch', () => {
    const result = sanitizeTargetPath('scratch/notes/todo.md', workTree, SCR_DIR)
    expect(result).toBe('scratch/notes/todo.md')
  })

  it('rejects traversal outside scratch', () => {
    const result = sanitizeTargetPath('scratch/../secret.txt', workTree, SCR_DIR)
    expect(result).toBeNull()
  })

  it('rejects absolute paths outside scratch', () => {
    const result = sanitizeTargetPath('/etc/passwd', workTree, SCR_DIR)
    expect(result).toBeNull()
  })

  it('normalizes absolute paths inside scratch', () => {
    const candidate = join(workTree, 'scratch', 'draft.md')
    const result = sanitizeTargetPath(candidate, workTree, SCR_DIR)
    expect(result).toBe('scratch/draft.md')
  })

  it('rejects scratch root itself', () => {
    const result = sanitizeTargetPath('scratch', workTree, SCR_DIR)
    expect(result).toBeNull()
  })
})
