# draftsnap

[![CI](https://github.com/annenpolka/draftsnap/actions/workflows/check.yml/badge.svg)](https://github.com/annenpolka/draftsnap/actions/workflows/check.yml)
[![Latest Release](https://img.shields.io/github/v/release/annenpolka/draftsnap)](https://github.com/annenpolka/draftsnap/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Sidecar Git snapshots for temporary drafts—safe, local, never pushed.**

When working with AI coding assistants, you often generate temporary Markdown notes, outlines, and drafts that you want to version but not commit to your main repository. `draftsnap` solves this by maintaining a separate sidecar Git repository (`.git-scratch/`) that tracks only your scratch files under `scratch/`, keeping your main repo clean while giving you full version control over your temporary work.

## Features

- **Complete isolation** — Uses a separate `.git-scratch/` repository that never interferes with your main repo
- **Safe by design** — No remote repository, automatic `.git/info/exclude` configuration, never accidentally pushed
- **JSON-first API** — Every command supports `--json` output with consistent schema for easy automation
- **Agent-friendly** — Built for coding assistants with clear exit codes, idempotent operations, and `draftsnap prompt` for usage instructions
- **Streaming support** — Pipe content directly via stdin without creating intermediate files
- **Space-based organization** — Group related drafts with `--space` for better searchability

## Quick Start with AI Agents

**For users**: Copy and paste this into your AI assistant:

```
Run `draftsnap prompt` to learn how to use draftsnap in this repository.
```

## Installation

### Download from GitHub Releases

1. Pick a version (replace `0.1.1` below as needed) and download the single-file binary:
   ```bash
   ver="0.1.3"
   base="https://github.com/annenpolka/draftsnap/releases/download/v${ver}"
   curl -sSLo /tmp/draftsnap "$base/draftsnap"
   curl -sSLo /tmp/draftsnap.sha256 "$base/draftsnap.sha256"
   (cd /tmp && sed 's#dist/##' draftsnap.sha256 | shasum -a 256 --check -)
   mkdir -p ~/.local/bin
   install -m 0755 /tmp/draftsnap ~/.local/bin/draftsnap
   ```

2. Ensure `~/.local/bin` is in your PATH:
   ```bash
   export PATH="$HOME/.local/bin:$PATH"
   ```

### Build from Source

```bash
git clone https://github.com/annenpolka/draftsnap.git
cd draftsnap
./scripts/bootstrap-bats.sh  # Install test runner
./vendor/bats-core/bin/bats tests  # Verify installation
cp bin/draftsnap ~/.local/bin/draftsnap
```

## Quick Start

1. **Initialize** the sidecar repository in your project:
   ```bash
   draftsnap ensure
   ```

2. **Create and snapshot** a draft:
   ```bash
   echo "# Project Ideas" > scratch/notes.md
   draftsnap snap scratch/notes.md -m "initial brainstorm"
   ```

3. **View history**:
   ```bash
   draftsnap log
   ```

4. **Check differences**:
   ```bash
   draftsnap diff
   ```

That's it! Your drafts are now versioned in `.git-scratch/` without touching your main repository.

## Usage Examples

### Basic Snapshot Workflow

```bash
# Initialize once per project
draftsnap ensure

# Create and snapshot a file
echo "first draft" > scratch/notes.md
draftsnap snap scratch/notes.md -m "init note"

# Edit and snapshot again
echo "revised draft" >> scratch/notes.md
draftsnap snap scratch/notes.md -m "add revision"

# View history
draftsnap log -- scratch/notes.md
```

### Streaming from stdin

Stream content directly without creating intermediate files:

```bash
# AI assistant output piped directly
echo "adhoc note" | draftsnap snap - -m "quick idea"

# Creates timestamped file: scratch/stream-YYYYMMDDHHMMSS.md
```

### Space-based Organization

Group related drafts with spaces for better organization:

```bash
# Create draft in a specific space
echo "feature outline" > scratch/specs/feature.md
draftsnap snap feature.md --space specs -m "outline"

# Commit message includes [space:specs] for filtering
draftsnap log --json | grep "space:specs"
```

### Reviewing and Restoring

```bash
# View recent changes
draftsnap diff

# Compare against specific revision
draftsnap diff HEAD~2 -- scratch/notes.md

# Restore previous version
draftsnap restore HEAD~1 -- scratch/notes.md
```

### Agent Integration

Coding agents can use `draftsnap prompt` to get usage instructions:

```bash
# Get agent-friendly prompt
draftsnap prompt

# JSON format for programmatic use
draftsnap prompt --format=json
```

Agents should:
1. Run `draftsnap ensure --json` once per session
2. Snapshot with `draftsnap snap <path> -m "<reason>" --json` after creating/editing drafts
3. Parse only stdout JSON, treat exit code 10 as "no changes" (success)

## Commands Reference

### Core Commands

#### `ensure`
Initialize or verify the sidecar repository (idempotent).

```bash
draftsnap ensure [--json]
```

Creates `.git-scratch/`, `scratch/`, and configures `.git/info/exclude`. Safe to run multiple times.

**Exit codes**: `0` (success)

---

#### `snap <path|-> [options]`
Capture a snapshot from a file or stdin.

```bash
draftsnap snap <path> -m "message" [--space <name>] [--json]
draftsnap snap - -m "message" [--space <name>] [--json]  # stdin mode
```

**Options**:
- `-m, --message <msg>` — Commit message (recommended format: `purpose: summary`)
- `--space <name>` — Group under `scratch/<name>/` and tag commit with `[space:name]`
- `<path>` — File path (relative to `scratch/` if not absolute)
- `-` — Read from stdin, creates `scratch/stream-YYYYMMDDHHMMSS.md`

**Exit codes**: `0` (committed), `10` (no changes)

**Examples**:
```bash
draftsnap snap scratch/notes.md -m "purpose: add intro"
draftsnap snap ideas.md --space drafts -m "purpose: brainstorm"
echo "quick note" | draftsnap snap - -m "purpose: capture idea"
```

---

#### `log [-- <path>]`
List snapshot history with metadata.

```bash
draftsnap log [--json] [-- <path>]
```

**Arguments**:
- `-- <path>` — Filter history by specific file path

**Exit codes**: `0` (success)

**Examples**:
```bash
draftsnap log                              # All snapshots
draftsnap log -- scratch/notes.md          # Specific file
draftsnap log --json | jq '.data.entries'  # Parse with jq
```

---

#### `diff [options] [-- <path>]`
Compare snapshots or working tree changes.

```bash
draftsnap diff [--since <N>] [--current] [--json] [-- <path>]
```

**Options**:
- `--since <N>` — Compare HEAD with N commits back (default: 1)
- `--current` — Compare working tree with HEAD
- `-- <path>` — Limit diff to specific path

**Exit codes**: `0` (success)

**Examples**:
```bash
draftsnap diff                        # Latest two commits
draftsnap diff --since 3              # HEAD vs HEAD~3
draftsnap diff --current              # Working tree vs HEAD
draftsnap diff -- scratch/notes.md    # Specific file only
```

---

#### `restore <REV> -- <path>`
Restore a file from a prior snapshot to the working tree.

```bash
draftsnap restore <REV> -- <path> [--json]
```

**Arguments**:
- `<REV>` — Git revision (e.g., `HEAD`, `HEAD~2`, commit hash)
- `<path>` — File path to restore

Creates `.draftsnap.bak.YYYYMMDDHHMMSS` backup if file exists and differs.

**Exit codes**: `0` (success), `14` (invalid revision or path)

**Examples**:
```bash
draftsnap restore HEAD~1 -- scratch/notes.md
draftsnap restore a1b2c3d -- scratch/ideas.md
```

---

### Maintenance Commands

#### `prune --keep <N> [--archive <DIR>]`
Remove old snapshots while keeping recent history.

```bash
draftsnap prune --keep <N> [--archive <DIR>] [--json]
```

**Options**:
- `--keep <N>` — Number of recent commits to keep (required, must be ≥ 1)
- `--archive <DIR>` — Archive removed commits as `.tar` files before pruning

**Exit codes**: `0` (pruned), `10` (nothing to prune)

**Examples**:
```bash
draftsnap prune --keep 50                      # Keep 50 recent commits
draftsnap prune --keep 100 --archive archives  # Archive before pruning
```

---

#### `status`
Report initialization state, lock status, and exclude configuration.

```bash
draftsnap status [--json]
```

**Exit codes**: `0` (success)

**Output** (JSON mode):
```json
{
  "status": "ok",
  "code": 0,
  "data": {
    "initialized": true,
    "git_dir": ".git-scratch",
    "scr_dir": "scratch",
    "locked": false,
    "exclude": {
      "main": {"git_dir": true, "scr_dir": true},
      "sidecar": {"wildcard": true, "scr_dir": true, "scr_glob": true}
    }
  }
}
```

---

### Helper Commands

#### `prompt [--format <format>]`
Output agent-oriented usage instructions.

```bash
draftsnap prompt [--format <txt|json>] [--json]
```

**Options**:
- `--format <txt|json>` — Output format (default: `txt`)

**Exit codes**: `0` (success)

**Examples**:
```bash
draftsnap prompt                    # Human-readable instructions
draftsnap prompt --format=json      # Machine-readable format
```

---

#### `help [--format <format>]`
Show command summary and exit codes.

```bash
draftsnap help [--format <txt|json>] [--json]
```

**Options**:
- `--format <txt|json>` — Output format (default: `txt`)

**Exit codes**: `0` (success)

---

### Global Flags

All commands accept these global flags:

- `--json` — Emit structured JSON on stdout (schema: `{"status","code","data","warnings?"}`)

**Note**: `--dry-run`, `--quiet`, `--debug` are reserved for future use.

---

### Exit Codes

| Code | Meaning | Description |
|------|---------|-------------|
| `0` | Success | Operation completed successfully |
| `10` | No changes | Operation succeeded but made no modifications |
| `11` | Not initialized | Sidecar repository not found |
| `12` | Locked | Another process holds the lock |
| `13` | Precondition failed | Operation prerequisites not met |
| `14` | Invalid arguments | Invalid command arguments or options |

## Configuration

Configure via environment variables:

```bash
# Scratch directory (default: scratch)
export DRAFTSNAP_SCR_DIR=notes

# Sidecar git directory (default: .git-scratch)
export DRAFTSNAP_GIT_DIR=.git-drafts

# Work tree (default: .)
export DRAFTSNAP_WORK_TREE=.
```

## Development

### Running Tests

```bash
# Bootstrap Bats test runner (first time only)
./scripts/bootstrap-bats.sh

# Run full test suite
./vendor/bats-core/bin/bats tests

# Run specific test file
./vendor/bats-core/bin/bats tests/snap.bats

# Run quality checks (shellcheck + tests)
./scripts/check.sh
```

### TDD Workflow

This project follows Test-Driven Development:

1. Add failing test to appropriate `tests/*.bats` file
2. Run `./vendor/bats-core/bin/bats tests` to verify failure
3. Implement minimal code in `bin/draftsnap`
4. Run tests again to verify success
5. Refactor as needed

See `work-plan.md` for the feature backlog and `AGENTS.md` for coding conventions.

### Release Process

Releases are cut from the `main` branch:

1. Ensure tests pass: `./scripts/check.sh`
2. Build release binary and checksum:
   ```bash
   rm -rf dist && mkdir dist
   cp bin/draftsnap dist/draftsnap
   shasum -a 256 dist/draftsnap > dist/draftsnap.sha256
   ```
3. Tag and push:
   ```bash
   git tag v0.1.X
   git push origin v0.1.X
   ```
4. Create GitHub Release:
   ```bash
   gh release create v0.1.X dist/draftsnap dist/draftsnap.sha256 \
     --title "draftsnap v0.1.X" \
     --notes "Release notes"
   ```

## Resources

- **Documentation**: See `CLAUDE.md` for AI assistant guidance
- **Architecture**: See `AGENTS.md` for implementation details
- **Backlog**: See `work-plan.md` for planned features

## License

MIT License - see [LICENSE](LICENSE) file for details.

Copyright (c) 2025 annenpolka
