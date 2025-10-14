# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`draftsnap` is a CLI tool for managing temporary Markdown drafts using a sidecar Git repository. It operates completely separate from the main repository, storing snapshots in `.git-scratch/` while tracking files under `scratch/`. The tool is designed to be used by both humans and coding agents, with consistent JSON output and idempotent operations.

## Core Architecture

- **TypeScript CLI (ESM)**: `src/` hosts the primary implementation bundled via `tsup` into `dist/index.js` and exposed as the `draftsnap` binary.
- **Sidecar repository pattern**: Uses separate `.git-scratch/` directory, never touches the main repo.
- **Safe by design**: No remote, automatic lock-based exclusion, `.git/info/exclude` instead of `.gitignore`.
- **JSON-first API**: All commands support `--json` for machine-readable output with consistent schema `{"status","code","data","warnings"}`.
- **Exit codes**: `0=OK`, `10=NO_CHANGES`, `11=NOT_INITIALIZED`, `12=LOCKED`, `13=PRECONDITION_FAILED`, `14=INVALID_ARGS`.
- **Legacy**: `bin/draftsnap` (Bash) remains for historical reference but should not receive new features.

## Key Design Principles

1. **Idempotent operations**: All commands can be run multiple times safely
2. **Lock-based concurrency**: Uses `mkdir` for atomic locking (`.git-scratch/.draftsnap.lock`)
3. **Separation of concerns**: STDOUT for machine output, STDERR for human logs
4. **No remote pushes**: Hardcoded to prevent accidental leaks
5. **Agent-friendly**: Designed to be used by coding agents via `draftsnap prompt` instructions

## Development Commands

### Quality Gates
```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test --run
pnpm run build
```

### Local Testing Workflow
```bash
# Initialize sidecar in current directory
bin/draftsnap ensure --json

# Create and snapshot a test file
echo "test content" > scratch/test.md
bin/draftsnap snap scratch/test.md -m "test: initial" --json

# View history
bin/draftsnap log --json

# Clean up playground
rm -rf .git-scratch scratch
```

## Command Architecture

### Critical Commands
- `ensure`: Idempotent initialization, creates `.git-scratch/`, `scratch/`, sets up `.git/info/exclude`
- `snap <path|->`: Core snapshot command, accepts stdin via `-`, returns code 10 if no changes
- `prompt`: Returns English prompt for coding agents explaining tool usage (not role assignment)

### Helper Commands
- `log`, `diff`, `restore`: History inspection and recovery
- `prune --keep N|--days D`: Cleanup with optional `--archive` for safety
- `protect on|off|status`: Manages `.git/info/exclude` entries
- `status`: Reports initialization state, lock state, and exclude guard status

## Testing Guidelines

- **Framework**: [Vitest](https://vitest.dev/) (integration + unit coverage in `tests/node/`)
- **Setup pattern**: Each test spins up a temporary Git repo; see helpers under `tests/node/setup/`
- **Coverage requirements**:
  - JSON and human output modes
  - Success and failure paths
  - Edge cases (no changes, locked, uninitialized)
  - Idempotency verification

## Code Style

- TypeScript (ESM) targeting Node 18+; formatted and linted via Biome (`pnpm lint`)
- Prefer small modules (`src/commands`, `src/core`, `src/utils`) with explicit exports
- Use descriptive error types (see `src/types/errors.ts`) and structured logging helpers
- Legacy Bash code remains read-only; avoid introducing new Bash functionality

## Environment Variables

- `DRAFTSNAP_SCR_DIR`: Target directory (default: `scratch`)
- `DRAFTSNAP_GIT_DIR`: Sidecar repo location (default: `.git-scratch`)
- `DRAFTSNAP_WORK_TREE`: Work tree path (default: `.`)

## Release Process

1. Verify quality gates locally:
   ```bash
   pnpm install --frozen-lockfile
   pnpm lint && pnpm typecheck
   pnpm test --run
   pnpm run build
   ```
2. Smoke test the bundled CLI (optional):
   ```bash
   node dist/index.js status --json
   ```
3. Publish package: `pnpm publish --access public`
4. Tag release: `git tag draftsnap-node-vX.Y.Z && git push origin draftsnap-node-vX.Y.Z`
5. Create GitHub release summarizing changes (link to changelog entry).

## Agent Integration

Coding agents should call `draftsnap prompt` to receive usage instructions. The tool is designed for optional use—agents should use it when it reduces friction, not as a fixed role assignment.

Basic agent workflow:
1. Session start: `draftsnap ensure --json` (once)
2. After creating/editing drafts: `draftsnap snap <path> -m "purpose: summary" --json`
3. Periodic cleanup: `draftsnap prune --keep 200 --json` (sparingly)
4. Parse only STDOUT JSON, treat exit code 10 as "success with no changes"

## Important Files

- `src/`: TypeScript sources (commands, core, utilities)
- `dist/`: Bundled artifacts produced via `pnpm run build`
- `tests/node/`: Vitest suites for integration and unit coverage
- `AGENTS.md`: Repository guidelines and coding conventions
- `work-plan.md`: Feature backlog and TDD task checklist
- `project-summary.md`: Original design conversations and rationale
- `bin/draftsnap`: Legacy Bash CLI (reference only)

## Notes

- Never modify `.gitignore`—use `.git/info/exclude` instead
- Lock acquisition failures (code 12) should be retried by callers
- The sidecar repo never has a remote—prevent accidental pushes
- All operations respect the lock file for concurrent safety
- `NO_CHANGES` (code 10) is a success state, not an error
