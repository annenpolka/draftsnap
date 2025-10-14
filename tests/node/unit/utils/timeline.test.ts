import { describe, expect, it } from 'vitest'
import { computeTimelineBar } from '../../../../src/utils/timeline.js'

describe('computeTimelineBar', () => {
  it('scales commit counts into a fixed-width bar', () => {
    expect(computeTimelineBar(5, { scale: 10, maxCommits: 10 })).toEqual({ scale: 10, filled: 5 })
    expect(computeTimelineBar(15, { scale: 10, maxCommits: 20 })).toEqual({ scale: 10, filled: 8 })
    expect(computeTimelineBar(0, { scale: 10, maxCommits: 20 })).toEqual({ scale: 10, filled: 0 })
  })
})
