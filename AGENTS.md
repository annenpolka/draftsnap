# Repository Guidelines

## Project Structure & Module Organization
- `bin/draftsnap`: primary Bash CLI handling ensure, snap, log, diff, status, and locking.
- `scripts/bootstrap-bats.sh`: helper to fetch vendored Bats runner into `vendor/`.
- `tests/*.bats`: Bats test suites grouped by command (`ensure`, `snap`, `log`, `diff`).
- `scratch/`: sidecar workspace tracked by draftsnap; keep agent notes under `scratch/logs/` and remove when not needed.
- `docs/` and `work-plan.md`: design notes and backlog; consult before adding new features.

## Build, Test, and Development Commands
- `./scripts/bootstrap-bats.sh`: install/update vendored Bats runner.
- `./vendor/bats-core/bin/bats tests`: execute entire test suite; run before every commit.
- `bin/draftsnap ensure --json`: initialize sidecar repo (safe to run repeatedly).
- `bin/draftsnap log --json` and `bin/draftsnap diff --json`: inspect recent snapshots and differences while coding.

## Coding Style & Naming Conventions
- Bash 4+; enforce `set -euo pipefail` and prefer helper functions (`json_escape`, `git_side`).
- Indent with two spaces; wrap long pipelines; use `local` for function scope.
- Command names follow `draftsnap <noun>`; new subcommands should accept `--json`, `--quiet`, `--dry-run` for consistency.
- Snapshots live under `scratch/<space>/`; default space is implied when absent.

## Testing Guidelines
- Framework: [Bats](https://github.com/bats-core/bats-core) via vendored runner.
- Place new specs in `tests/<command>.bats`, mirroring CLI usage from Red-Green cycles.
- Tests should cover JSON and human output modes and clean up temporary locks (`rm -rf .git-scratch/.draftsnap.lock`).
- Always run `./vendor/bats-core/bin/bats tests` prior to pushing; keep runtime under ~10s by scoping fixtures.

## Commit & Pull Request Guidelines
- Commit messages use short imperative prefixes (`feat:`, `fix:`, `test:`, `chore:`) as seen in history.
- One logical change per commit; include updated tests/docs.
- PRs should summarize behaviour, list commands run (`bats tests`), and link relevant backlog items in `work-plan.md`.
- Capture agent activity with `draftsnap snap --space logs` so reviewers can replay your context.

## Agent-Specific Tips
- Acquire the draftsnap lock (`acquire_lock`) before mutating tracked files; avoid manual writes inside `.git-scratch/`.
- Prefer `json_escape`, `git_side`, and existing helpers rather than reimplementing plumbing.
- When extending CLI, add Red tests first, update README quick-start, and log the decision in `scratch/logs/`.
