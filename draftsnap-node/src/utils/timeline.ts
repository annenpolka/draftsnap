export interface TimelineEntryHighlight {
  type: 'add' | 'del' | 'context'
  text: string
}

export interface TimelineEntry {
  commit: string
  timestamp: string
  message: string
  additions: number
  deletions: number
  emoji?: string
  highlights: TimelineEntryHighlight[]
  section?: string
}

export interface TimelineSummary {
  commits: number
  totalAdditions: number
  totalDeletions: number
  net: number
}

export interface TimelineBarOptions {
  scale: number
  maxCommits: number
}

export interface TimelineBar {
  scale: number
  filled: number
}

export function computeTimelineBar(commits: number, options: TimelineBarOptions): TimelineBar {
  const scale = Math.max(1, options.scale)
  const maxCommits = Math.max(1, options.maxCommits)
  const ratio = Math.min(1, commits / maxCommits)
  const filled = Math.round(ratio * scale)
  return {
    scale,
    filled: Math.min(scale, Math.max(0, filled)),
  }
}
