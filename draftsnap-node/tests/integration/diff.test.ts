import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, writeFile, appendFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ensureCommand } from '../../src/commands/ensure.js'
import { snapCommand } from '../../src/commands/snap.js'
import { diffCommand } from '../../src/commands/diff.js'
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

  it('returns diff between latest commits', async () => {
    const logger = createLogger({ json: true })
    const target = join(workTree, scratchDir, 'diff.md')
    await writeFile(target, 'one\n')
    await snapCommand({ workTree, gitDir, scratchDir, json: true, logger, path: 'scratch/diff.md', message: 'purpose: add diff' })
    await appendFile(target, 'two\n')
    await snapCommand({ workTree, gitDir, scratchDir, json: true, logger, path: 'scratch/diff.md', message: 'purpose: update diff' })

    const result = await diffCommand({ workTree, gitDir, scratchDir, json: true, logger, path: 'scratch/diff.md' })

    expect(result.data.patch).toContain('+two')
    expect(result.data.base).not.toBeNull()
  })

  it('shows working tree diff when current flag used', async () => {
    const logger = createLogger({ json: true })
    const target = join(workTree, scratchDir, 'draft.md')
    await writeFile(target, 'alpha\n')
    await snapCommand({ workTree, gitDir, scratchDir, json: true, logger, path: 'scratch/draft.md', message: 'purpose: add draft' })
    await appendFile(target, 'beta\n')

    const result = await diffCommand({ workTree, gitDir, scratchDir, json: true, logger, path: 'scratch/draft.md', current: true })

    expect(result.data.patch).toContain('+beta')
    expect(result.data.base).toBeNull()
  })
})
