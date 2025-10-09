# draftsnap

Temporary Markdown snapshots backed by a sidecar Git repo.

## Quick Start

1. Bootstrap the bundled Bats test runner (once per checkout):
   ```bash
   ./scripts/bootstrap-bats.sh
   ```
2. Run the current test suite (TDD entry point):
   ```bash
   ./vendor/bats-core/bin/bats tests
   ```
3. Try the `ensure` command in the repo root to create the sidecar:
   ```bash
   bin/draftsnap ensure --json
   ```
   This creates `.git-scratch/` and `scratch/`, and prints a JSON payload such as:
   ```json
   {"status":"ok","code":0,"data":{"initialized":true,"git_dir":".git-scratch","scr_dir":"scratch"}}
   ```
4. Reset the playground anytime:
   ```bash
   rm -rf .git-scratch scratch
   ```

5. Check draftsnap's view of the world:
   ```bash
   bin/draftsnap status --json
   ```
   You'll see initialization status plus exclude guards reflected in the JSON payload.

6. Inspect the sidecar repository without touching the main repo:
   ```bash
   git --git-dir=.git-scratch --work-tree=. status -sb
   ```
   `ensure` seeds `.git-scratch/info/exclude` so only `scratch/` contents appear here.

## Development Flow

- Follow the Red-Green-Refactor (TDD) loop documented in `AGENTS.md` / `work-plan.md`.
- Extend `tests/` with failing Bats specs before touching `bin/draftsnap`.
- Use environment variables to override defaults when needed:
  - `DRAFTSNAP_SCR_DIR` (default `scratch`)
  - `DRAFTSNAP_GIT_DIR` (default `.git-scratch`)
  - `DRAFTSNAP_WORK_TREE` (default `.`)

## Resources

- Work plan and backlog: `work-plan.md`
- Bats bootstrap strategy: `docs/bats-strategy.md`
- Current feature overview and prompts: `project-summary.md`
