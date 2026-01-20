import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDebounceScheduler, type WatchAction } from '../../../../src/commands/watch.js'

describe('createDebounceScheduler', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces repeated events for the same path', () => {
    vi.useFakeTimers()
    const calls: Array<{ path: string; action: WatchAction }> = []
    const scheduler = createDebounceScheduler(100, (path, action) => {
      calls.push({ path, action })
    })

    scheduler.schedule('scratch/note.md', 'update')
    scheduler.schedule('scratch/note.md', 'delete')

    vi.advanceTimersByTime(99)
    expect(calls).toEqual([])

    vi.advanceTimersByTime(1)
    expect(calls).toEqual([{ path: 'scratch/note.md', action: 'delete' }])
  })

  it('keeps timers independent per path', () => {
    vi.useFakeTimers()
    const calls: Array<{ path: string; action: WatchAction }> = []
    const scheduler = createDebounceScheduler(50, (path, action) => {
      calls.push({ path, action })
    })

    scheduler.schedule('scratch/a.md', 'update')
    scheduler.schedule('scratch/b.md', 'update')

    vi.advanceTimersByTime(50)

    expect(calls).toHaveLength(2)
    expect(calls).toEqual(
      expect.arrayContaining([
        { path: 'scratch/a.md', action: 'update' },
        { path: 'scratch/b.md', action: 'update' },
      ]),
    )
  })

  it('cancels pending timers', () => {
    vi.useFakeTimers()
    const calls: Array<{ path: string; action: WatchAction }> = []
    const scheduler = createDebounceScheduler(80, (path, action) => {
      calls.push({ path, action })
    })

    scheduler.schedule('scratch/skip.md', 'update')
    scheduler.cancel('scratch/skip.md')

    vi.advanceTimersByTime(80)
    expect(calls).toEqual([])
  })
})
