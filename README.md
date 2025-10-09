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

5. Capture a snapshot (create or edit a file under `scratch/` first):
   ```bash
   echo "first draft" > scratch/notes.md
   bin/draftsnap snap scratch/notes.md -m "init note" --json
   ```
   The JSON includes the commit hash, path, and stored byte size.

6. Stream content straight from stdin when you don't want an intermediate file:
   ```bash
   printf "adhoc" | bin/draftsnap snap - -m "stdin note" --json
   ```
   A timestamped `scratch/stream-*.md` file is created and committed automatically.

7. Group related drafts with `--space` (adds under `scratch/<space>/` and tags the commit message):
   ```bash
   echo "feature outline" > scratch/specs/feature.md
   bin/draftsnap snap feature.md --space specs -m "outline" --json
   ```
   The commit subject will include `[space:specs]` for easier filtering.

8. Check draftsnap's view of the world:
   ```bash
   bin/draftsnap status --json
   ```
   You'll see initialization status, lock状態(`locked`) と exclude ガードが JSON にまとまって返ってきます。

9. Inspect the sidecar repository without touching the main repo:
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
