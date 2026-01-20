import { ExitCode } from '../types/errors.js'

export const PROMPT_TEXT = `You may use a CLI tool named "draftsnap" to manage temporary drafts (e.g., Markdown notes, outlines, experiments) in a sidecar Git repository. This tool provides a safety net when working with scratch files, allowing you to restore previous versions if needed.

Basic workflow:
1) Once per session, run \`draftsnap ensure --json\`. It idempotently prepares a local sidecar repo, creates the scratch directory, and sets \`.git/info/exclude\`. Proceed only if it returns JSON with code 0.

2) When working with files in the configured scratch directory (default: \`scratch/\`), snapshot changes with:
   \`draftsnap snap <path> -m "<short reason>" --json\`
   \`draftsnap snap --all -m "<short reason>" --json\` to commit every modified scratch file together.
   Treat exit code 0 as committed. Treat exit code 10 as "no changes" (still a success).

   Optional: run \`draftsnap watch\` to auto-snapshot on file changes (stop with Ctrl+C).

3) Parse only STDOUT as JSON (\`--json\`). Never parse STDERR; it is human-oriented logs.

4) To review or roll back, you may call:
   - \`draftsnap log --json [-- <path>]\` to list history,
   - \`draftsnap diff [REV] --json [-- <path>]\` to inspect changes,
   - \`draftsnap restore <revision> <path> --json\` to restore content into the working tree.

5) For periodic cleanup, you may run \`draftsnap prune --keep 200 --json\` (or \`--days N\`). Use it sparingly.

6) Do not modify \`.gitignore\`; drafts are excluded locally via \`.git/info/exclude\`. The tool never pushes to any remote.

7) If \`draftsnap\` is unavailable, continue your task without it; do not block.

When to snapshot (default behavior):
- After creating a new file in scratch/
- After making substantial changes (structural changes, >10 lines modified, or significant content changes)
- Before potentially destructive operations (e.g., large refactors, deletions)
- When the user says "try this", "experiment with", or similar exploratory language

Don't snapshot for:
- Minor formatting changes (whitespace, indentation only)
- Small typo fixes (<5 character changes)
- When the user explicitly says "don't snap" or "no need to snap"

User can adjust frequency:
- "snap every edit" → snapshot after every change, regardless of size
- "snap less" or "only snap when I say" → only snapshot when explicitly requested
- "snap more often" → be more aggressive with automatic snapshots

Message convention for \`-m\`:
Use a terse "purpose: summary" style, e.g., \`purpose: tighten outline\`, \`purpose: add authentication section\`, so commits are searchable.

Return handling:
- Success with commit: \`{"status":"ok","code":0,...}\`
- Success with no changes: \`{"status":"ok","code":10,...}\`
- Precondition or lock errors are non-fatal to your overall task; you may retry later.

Examples:
- Start: \`draftsnap ensure --json\`
- After writing \`scratch/idea.md\`: \`draftsnap snap scratch/idea.md -m "purpose: initial draft" --json\`
- After major edit to \`scratch/design.md\`: \`draftsnap snap scratch/design.md -m "purpose: add security considerations" --json\`
- After touching multiple files: \`draftsnap snap --all -m "purpose: checkpoint session work" --json\`
- Before a risky refactor: \`draftsnap snap scratch/code.md -m "purpose: pre-refactor checkpoint" --json\`

This tool provides safety when experimenting with AI-generated content. Use it proactively to enable fearless iteration.`

export function promptCommand(
  json: boolean,
): { status: 'ok'; code: ExitCode; message: string } | string {
  if (json) {
    return { status: 'ok', code: ExitCode.OK, message: PROMPT_TEXT }
  }
  return PROMPT_TEXT
}
