import { describe, expect, it } from 'vitest'
import { decideTimelineMode } from '../../../src/commands/timeline.js'

describe('decideTimelineMode', () => {
  it('returns json when json flag is set', () => {
    expect(
      decideTimelineMode({
        json: true,
        raw: false,
        stdoutIsTTY: true,
        hasFzf: true,
      }),
    ).toBe('json')
  })

  it('returns plain when raw flag is set', () => {
    expect(
      decideTimelineMode({
        json: false,
        raw: true,
        stdoutIsTTY: true,
        hasFzf: true,
      }),
    ).toBe('plain')
  })

  it('returns interactive when TTY and fzf are available', () => {
    expect(
      decideTimelineMode({
        json: false,
        raw: false,
        stdoutIsTTY: true,
        hasFzf: true,
      }),
    ).toBe('interactive')
  })

  it('returns plain when stdout is not a TTY', () => {
    expect(
      decideTimelineMode({
        json: false,
        raw: false,
        stdoutIsTTY: false,
        hasFzf: true,
      }),
    ).toBe('plain')
  })

  it('returns plain when fzf is unavailable', () => {
    expect(
      decideTimelineMode({
        json: false,
        raw: false,
        stdoutIsTTY: true,
        hasFzf: false,
      }),
    ).toBe('plain')
  })
})
