import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureSidecar } from '../../../../src/core/repository.js'

const SCR_DIR = 'scratch'

describe('ensureSidecar', () => {
  let workTree: string
  let gitDir: string

  beforeEach(async () => {
    workTree = await mkdtemp(join(tmpdir(), 'draftsnap-node-repo-'))
    gitDir = join(workTree, '.git-scratch')
  })

  afterEach(async () => {
    await rm(workTree, { recursive: true, force: true })
  })

  it('initializes sidecar repo and scratch directory', async () => {
    const result = await ensureSidecar({ workTree, gitDir, scratchDir: SCR_DIR })

    expect(result.initialized).toBe(true)
    expect(result.files).toEqual([])
  })

  it('is idempotent and lists existing files', async () => {
    await ensureSidecar({ workTree, gitDir, scratchDir: SCR_DIR })
    const notePath = join(workTree, SCR_DIR, 'note.md')
    await writeFile(notePath, 'hello')

    const result = await ensureSidecar({ workTree, gitDir, scratchDir: SCR_DIR })

    expect(result.initialized).toBe(false)
    expect(result.files).toEqual(['scratch/note.md'])
  })

  it('ensures exclude entries for scratch and git dir', async () => {
    await ensureSidecar({ workTree, gitDir, scratchDir: SCR_DIR })

    const excludePath = join(workTree, '.git', 'info', 'exclude')
    const contents = await readFile(excludePath, 'utf8')

    expect(contents).toEqual(expect.stringContaining('scratch/'))
    expect(contents).toEqual(expect.stringContaining('.git-scratch/'))
  })
})
