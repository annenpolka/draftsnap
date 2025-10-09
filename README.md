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

8. Review history with `log`:
   ```bash
   bin/draftsnap log --json
   ```
   Returns recent snapshots (newest first) with commit id, timestamp, message, and path. Omit `--json` for human-readable lines.

9. Compare snapshots with `diff` without remembering hashes:
   ```bash
   bin/draftsnap diff --json
   ```
   By default compares the latest snapshot against its predecessor. Use `--since N` to look N commits back, or `--current` to compare the working tree against the latest snapshot. Human mode prints the raw diff.

10. Prune old snapshots while keeping recent history:
   ```bash
   bin/draftsnap prune --keep 50 --archive archives
   ```
   Retains the newest 50 commits, optionally archiving older ones into `archives/` before rewriting the sidecar history.

11. Restore a snapshot safely:
   ```bash
   bin/draftsnap restore --json HEAD -- scratch/notes/example.md
   ```
   Places the tracked content back into the working tree and saves a `.draftsnap.bak.*` copy if the file already differed.

12. Check draftsnap's view of the world:
   ```bash
   bin/draftsnap status --json
   ```
   You'll see initialization status, lock状態(`locked`) と exclude ガードが JSON にまとまって返ってきます。
   ロック中に他コマンドを実行すると終了コード12と`{"message":"locked"}`で即時失敗します。

13. Inspect the sidecar repository without touching the main repo:
   ```bash
   git --git-dir=.git-scratch --work-tree=. status -sb
   ```
   `ensure` seeds `.git-scratch/info/exclude` so only `scratch/` contents appear here.

## Installation

### Download from GitHub Releases

1. Pick a version (replace `0.1.0` below as needed) and download the single-file binary:
   ```bash
   ver="0.1.0"
   base="https://github.com/annenpolka/draftsnap/releases/download/v${ver}"
   curl -sSLo /tmp/draftsnap "$base/draftsnap"
   curl -sSL "$base/draftsnap.sha256" | shasum -a 256 --check -
   install -D -m 0755 /tmp/draftsnap ~/.local/bin/draftsnap
   ```
2. Optionally keep older versions side-by-side (e.g., `~/.local/bin/draftsnap-0.3.0`) and flip a symlink for fast rollback.

### Use mise without a custom plugin

Add a portable binary source to `.mise.toml`:

```toml
[tools]
draftsnap = { source = "https://github.com/annenpolka/draftsnap/releases/download/v0.1.0/draftsnap" }
```

Then run:

```bash
mise install
mise use draftsnap@0.1.0
```

### Use the bundled mise plugin

An official plugin lives on the `mise-plugin` branch of this repository. Install it directly:

```bash
mise plugin add draftsnap https://github.com/annenpolka/draftsnap.git#mise-plugin
mise install draftsnap@0.1.0   # or @latest
mise use draftsnap@0.1.0
```

The plugin downloads the matching GitHub Release binary into mise’s tool cache.

## Development Flow

- Follow the Red-Green-Refactor (TDD) loop documented in `AGENTS.md` / `work-plan.md`.
- Extend `tests/` with failing Bats specs before touching `bin/draftsnap`.
- Use environment variables to override defaults when needed:
  - `DRAFTSNAP_SCR_DIR` (default `scratch`)
  - `DRAFTSNAP_GIT_DIR` (default `.git-scratch`)
  - `DRAFTSNAP_WORK_TREE` (default `.`)
- Run `./scripts/check.sh` before commits; it runs shellcheck (if available) and the full Bats suite.
- GitHub Actions (`.github/workflows/check.yml`) runs the same script on pushes and pull requests.
- `draftsnap help` / `draftsnap prompt` summarize CLI behaviour and agent expectations; pass `--json` for structured output.

## Resources

- Work plan and backlog: `work-plan.md`
- Bats bootstrap strategy: `docs/bats-strategy.md`
- Current feature overview and prompts: `project-summary.md`

## Release Process

Releases are cut from the `main` branch.

1. Ensure logs/tests are up to date (`./scripts/check.sh`).
2. Build the release binary (example) and checksum:
   ```bash
   rm -rf dist && mkdir dist
   cp bin/draftsnap dist/draftsnap
   shasum -a 256 dist/draftsnap > dist/draftsnap.sha256
   ```
3. Tag and push:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
4. Publish GitHub Release (preferably automated via `gh`):
   ```bash
   gh release create v0.1.0 dist/draftsnap dist/draftsnap.sha256 \
     --title "draftsnap v0.1.0" \
     --notes "Short notes about the release"
   ```
5. Clean up local `dist/` if desired (`rm -rf dist`).
