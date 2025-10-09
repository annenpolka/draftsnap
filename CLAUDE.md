# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`draftsnap` is a CLI tool for managing temporary Markdown drafts using a sidecar Git repository. It operates completely separate from the main repository, storing snapshots in `.git-scratch/` while tracking files under `scratch/`. The tool is designed to be used by both humans and coding agents, with consistent JSON output and idempotent operations.

## Core Architecture

- **Single-file Bash script**: `bin/draftsnap` contains all functionality (~700 lines)
- **Sidecar repository pattern**: Uses separate `.git-scratch/` directory, never touches main repo
- **Safe by design**: No remote, automatic lock-based exclusion, `.git/info/exclude` instead of `.gitignore`
- **JSON-first API**: All commands support `--json` for machine-readable output with consistent schema `{"status","code","data","warnings"}`
- **Exit codes**: `0=OK`, `10=NO_CHANGES`, `11=NOT_INITIALIZED`, `12=LOCKED`, `13=PRECONDITION_FAILED`, `14=INVALID_ARGS`

## Key Design Principles

1. **Idempotent operations**: All commands can be run multiple times safely
2. **Lock-based concurrency**: Uses `mkdir` for atomic locking (`.git-scratch/.draftsnap.lock`)
3. **Separation of concerns**: STDOUT for machine output, STDERR for human logs
4. **No remote pushes**: Hardcoded to prevent accidental leaks
5. **Agent-friendly**: Designed to be used by coding agents via `draftsnap prompt` instructions

## Development Commands

### Test Execution
```bash
# Bootstrap Bats test runner (first time only)
./scripts/bootstrap-bats.sh

# Run full test suite (always run before commits)
./vendor/bats-core/bin/bats tests

# Run specific test file
./vendor/bats-core/bin/bats tests/snap.bats

# Run with timing
time ./vendor/bats-core/bin/bats tests
```

### Quality Checks
```bash
# Run shellcheck and full test suite
./scripts/check.sh

# Manual shellcheck (if installed)
shellcheck bin/draftsnap
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

- **Framework**: Bats (vendored in `vendor/bats-core/`)
- **Test organization**: One file per command in `tests/*.bats`
- **Setup pattern**: Each test creates temporary Git repo with `setup()` hook
- **Coverage requirements**:
  - Both JSON and human output modes
  - Success and failure paths
  - Edge cases (no changes, locked, uninitialized)
  - Idempotency verification

## Code Style

- Bash 4+ with `set -euo pipefail`
- Two-space indentation
- Helper functions: `git_side()`, `json_escape()`, `acquire_lock()`, `ensure_exclude_line()`
- Consistent error handling: `fail()` for fatal errors, `log()` for informational output
- Lock management: `acquire_lock()` with trap-based `release_lock()`

## Environment Variables

- `DRAFTSNAP_SCR_DIR`: Target directory (default: `scratch`)
- `DRAFTSNAP_GIT_DIR`: Sidecar repo location (default: `.git-scratch`)
- `DRAFTSNAP_WORK_TREE`: Work tree path (default: `.`)

## Release Process

1. Verify tests pass: `./scripts/check.sh`
2. Build release artifact:
   ```bash
   rm -rf dist && mkdir dist
   cp bin/draftsnap dist/draftsnap
   shasum -a 256 dist/draftsnap > dist/draftsnap.sha256
   ```
3. Tag version: `git tag v0.1.X`
4. Push tag: `git push origin v0.1.X`
5. Create GitHub release:
   ```bash
   gh release create v0.1.X dist/draftsnap dist/draftsnap.sha256 \
     --title "draftsnap v0.1.X" \
     --notes "Release notes"
   ```

## Agent Integration

Coding agents should call `draftsnap prompt` to receive usage instructions. The tool is designed for optional use—agents should use it when it reduces friction, not as a fixed role assignment.

Basic agent workflow:
1. Session start: `draftsnap ensure --json` (once)
2. After creating/editing drafts: `draftsnap snap <path> -m "purpose: summary" --json`
3. Periodic cleanup: `draftsnap prune --keep 200 --json` (sparingly)
4. Parse only STDOUT JSON, treat exit code 10 as "success with no changes"

## Important Files

- `bin/draftsnap`: Single-file CLI implementation
- `tests/*.bats`: Bats test suites organized by command
- `AGENTS.md`: Repository guidelines and coding conventions
- `work-plan.md`: Feature backlog and TDD task checklist
- `project-summary.md`: Original design conversations and rationale
- `scripts/bootstrap-bats.sh`: Bats runner setup
- `scripts/check.sh`: Pre-commit quality gate

## Notes

- Never modify `.gitignore`—use `.git/info/exclude` instead
- Lock acquisition failures (code 12) should be retried by callers
- The sidecar repo never has a remote—prevent accidental pushes
- All operations respect the lock file for concurrent safety
- `NO_CHANGES` (code 10) is a success state, not an error
