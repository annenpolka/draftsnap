import { describe, expect, it } from 'vitest'

// parseGitStatus will be implemented in src/commands/status.ts
// For now, we import it from a hypothetical export
// This will fail until we implement and export it
import { parseGitStatus } from '../../../src/commands/status.js'

describe('parseGitStatus', () => {
  it('parses empty output', () => {
    const result = parseGitStatus('')
    expect(result.hasChanges).toBe(false)
    expect(result.modified).toEqual([])
    expect(result.added).toEqual([])
    expect(result.deleted).toEqual([])
  })

  it('parses modified unstaged files', () => {
    const output = ' M scratch/file1.md'
    const result = parseGitStatus(output)
    expect(result.hasChanges).toBe(true)
    expect(result.modified).toEqual(['scratch/file1.md'])
    expect(result.added).toEqual([])
    expect(result.deleted).toEqual([])
  })

  it('parses modified staged files', () => {
    const output = 'M  scratch/file2.md'
    const result = parseGitStatus(output)
    expect(result.hasChanges).toBe(true)
    expect(result.modified).toEqual(['scratch/file2.md'])
  })

  it('parses added staged files', () => {
    const output = 'A  scratch/new.md'
    const result = parseGitStatus(output)
    expect(result.hasChanges).toBe(true)
    expect(result.added).toEqual(['scratch/new.md'])
    expect(result.modified).toEqual([])
  })

  it('parses untracked files as added', () => {
    const output = '?? scratch/untracked.md'
    const result = parseGitStatus(output)
    expect(result.hasChanges).toBe(true)
    expect(result.added).toEqual(['scratch/untracked.md'])
  })

  it('parses deleted staged files', () => {
    const output = 'D  scratch/removed.md'
    const result = parseGitStatus(output)
    expect(result.hasChanges).toBe(true)
    expect(result.deleted).toEqual(['scratch/removed.md'])
  })

  it('parses deleted unstaged files', () => {
    const output = ' D scratch/deleted.md'
    const result = parseGitStatus(output)
    expect(result.hasChanges).toBe(true)
    expect(result.deleted).toEqual(['scratch/deleted.md'])
  })

  it('parses multiple files of different types', () => {
    const output = ` M scratch/modified.md
A  scratch/added.md
D  scratch/deleted.md
?? scratch/untracked.md`
    const result = parseGitStatus(output)
    expect(result.hasChanges).toBe(true)
    expect(result.modified).toEqual(['scratch/modified.md'])
    expect(result.added).toEqual(['scratch/added.md', 'scratch/untracked.md'])
    expect(result.deleted).toEqual(['scratch/deleted.md'])
  })

  it('deduplicates files appearing in multiple categories', () => {
    // MM means modified in both staged and unstaged
    const output = 'MM scratch/file.md'
    const result = parseGitStatus(output)
    expect(result.hasChanges).toBe(true)
    // Should only appear once in modified
    expect(result.modified).toEqual(['scratch/file.md'])
  })

  it('sorts file paths alphabetically', () => {
    const output = ` M scratch/z.md
 M scratch/a.md
 M scratch/m.md`
    const result = parseGitStatus(output)
    expect(result.modified).toEqual(['scratch/a.md', 'scratch/m.md', 'scratch/z.md'])
  })

  it('handles files with spaces in names', () => {
    const output = ' M scratch/file with spaces.md'
    const result = parseGitStatus(output)
    expect(result.modified).toEqual(['scratch/file with spaces.md'])
  })

  it('ignores empty lines', () => {
    const output = ` M scratch/file1.md

 M scratch/file2.md
`
    const result = parseGitStatus(output)
    expect(result.modified).toEqual(['scratch/file1.md', 'scratch/file2.md'])
  })

  it('handles mixed staged and unstaged changes', () => {
    const output = `M  scratch/staged.md
 M scratch/unstaged.md
MM scratch/both.md`
    const result = parseGitStatus(output)
    expect(result.hasChanges).toBe(true)
    expect(result.modified).toEqual(['scratch/both.md', 'scratch/staged.md', 'scratch/unstaged.md'])
  })

  it('handles renamed files (shown as AD)', () => {
    // Renamed files may appear as both Added and Deleted in short format
    // or with R status code. We'll treat R as modified.
    const output = 'R  scratch/old.md -> scratch/new.md'
    const result = parseGitStatus(output)
    // Git porcelain v1 shows rename as "R  new.md" with old name in separate field
    // For simplicity, we'll treat R as modified
    expect(result.hasChanges).toBe(true)
  })

  it('handles copied files (shown as C)', () => {
    const output = 'C  scratch/copy.md'
    const result = parseGitStatus(output)
    expect(result.hasChanges).toBe(true)
    // Copied files are treated as added
    expect(result.added).toEqual(['scratch/copy.md'])
  })
})
