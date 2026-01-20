import { describe, expect, it } from 'vitest'
import { createPatternMatcher } from '../../../../src/commands/watch.js'

describe('createPatternMatcher', () => {
  it('matches recursive markdown patterns', () => {
    const matches = createPatternMatcher('scratch/**/*.md')
    expect(matches('scratch/note.md')).toBe(true)
    expect(matches('scratch/notes/todo.md')).toBe(true)
    expect(matches('scratch/notes/todo.txt')).toBe(false)
    expect(matches('notes/todo.md')).toBe(false)
  })

  it('matches single-level patterns', () => {
    const matches = createPatternMatcher('scratch/*.md')
    expect(matches('scratch/root.md')).toBe(true)
    expect(matches('scratch/notes/todo.md')).toBe(false)
  })
})
