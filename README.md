# draftsnap

[![CI](https://github.com/annenpolka/draftsnap/actions/workflows/check.yml/badge.svg)](https://github.com/annenpolka/draftsnap/actions/workflows/check.yml)
[![Latest Release](https://img.shields.io/github/v/release/annenpolka/draftsnap)](https://github.com/annenpolka/draftsnap/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Version control for AI design docs. Local. Never pushed.**
Snapshot scratch/ files—plans, notes, explorations.

---

## The Problem

```
You: "Make this design more detailed."
AI:  [rewrites everything]
You: "Actually, the simple version was better."
AI:  "I don't have the old one anymore."
```

You just lost the draft you liked. This happens constantly when pair programming with an AI: you explore, it rewrites, and the version you wanted is gone. Git can rescue you, but only if you juggle branches, excludes, and commit discipline—and that overhead kills flow.

---

## The Solution

`draftsnap` gives you automatic version control for temporary AI work:

- Snapshot scratch files with one command (or let your assistant do it)
- Browse history visually with `draftsnap timeline`
- Restore any prior snapshot in seconds
- Keep experiments out of your real Git history

Under the hood it is "just Git," but configured as a sidecar repo that tracks only `scratch/`. There is no ceremony, no risk of pushing drafts, and no need to remember exclusions.

---

## What Goes in scratch/

Working with AI assistants produces artifacts that feel temporary yet worth keeping around; you will iterate on them, compare versions, or resurrect ideas later. `scratch/` is the sandbox for exactly that "ephemeral-but-valuable" work.

- **Design drafts** – "Explain how authentication should work for our API."
- **Exploration notes** – "List three approaches we could take to shrink build times."
- **Code experiments** – "Show me a Rust proof-of-concept for this Bash helper."
- **Meeting prep** – "Draft an agenda for tomorrow's incident review."

These files are not polished deliverables and do not belong in your main Git history, but they are also not disposable. Keeping them in `scratch/` lets draftsnap version them with no ceremony so you can safely explore with AI, rewind at any time, and promote the keepers into your real project when they are ready.

---

## Quick Start

### For AI Users (Recommended)

**1. Install:**

```bash
npm install --save-dev draftsnap-node       # or: pnpm add -D draftsnap-node
```

**2. Tell your AI:**

```
Run "draftsnap prompt" and follow the instructions.
```

**3. That's it.**

Your AI will handle initialization, snapshotting, and versioning automatically. You just browse history with `draftsnap timeline` when you need to restore something.

---

### For Manual Use

Run once without installing:

```bash
npx draftsnap-node@latest status --json
pnpm dlx draftsnap-node@latest status --json
```

Global install:

```bash
npm install --global draftsnap-node         # or: pnpm add -g draftsnap-node
draftsnap status --json
```

Initialize once per project:

```bash
draftsnap ensure
```

Snapshot scratch files:

```bash
echo "# My Draft" > scratch/notes.md
draftsnap snap scratch/notes.md -m "purpose: initial draft"

echo "More detail" >> scratch/notes.md
draftsnap snap scratch/notes.md -m "purpose: add detail"
```

Explore with timeline:

```bash
draftsnap timeline                      # interactive browser
draftsnap timeline -- scratch/notes.md  # limit to one file
```

Timeline controls:

- `↑/↓` — move between snapshots
- `Enter` — view the diff in `$PAGER` (uses `delta` when available)
- `Ctrl+R` — restore the highlighted snapshot (with confirmation)
- `Esc` — quit (or `Ctrl+C`)
- `--raw` / `--json` — non-interactive fallbacks when `fzf` is unavailable or output is piped

---

## Core Commands

| Command | Purpose |
|---------|---------|
| `draftsnap prompt` | **Show AI-friendly instructions (start here)** |
| `draftsnap ensure` | Initialize the sidecar repository |
| `draftsnap snap <path> -m "reason"` | Snapshot a file |
| `draftsnap snap --all -m "reason"` | Snapshot all modified scratch files |
| `draftsnap timeline [-- <path>]` | Browse history interactively |
| `draftsnap log [--json]` | Show history as text or JSON |
| `draftsnap restore <rev> -- <path>` | Restore a file from a snapshot |

Exit codes: `0` success · `10` no changes · `11` not initialized · `12` locked · `13` precondition failed · `14` invalid arguments.

---

## What This Is (and Isn't)

**draftsnap is:**
- A safety net for AI-generated drafts and experiments
- Git with training wheels—sidecar history, JSON output, idempotent commands
- Five simple CLI commands you can hand to an assistant

**draftsnap is not:**
- A replacement for Git in your main repository
- Magic (you could replicate it with `.git/info/exclude` + discipline)
- Complex—you can learn it in a coffee break

If you have ever said "wait, show me the previous version" to an AI and had nothing to revert to, draftsnap is useful.

---

## How It Works

- A second Git repository lives at `.git-scratch/`
- Only files beneath `scratch/` are tracked
- Commands expose consistent JSON and clear exit codes for automation
- Scratch history never touches origin, so you can't accidentally push it

Want to promote a draft to your real project? Move it out of `scratch/` and commit as usual.

---

## AI Integration

When you run `draftsnap prompt`, you get AI-friendly instructions that explain:

1. How to run `draftsnap ensure` once per session
2. When to snapshot files (after creating or editing in `scratch/`)
3. How to write descriptive messages (`purpose: refine intro`)
4. How to handle exit codes gracefully

Share that output with your AI and tell it:

```
Use draftsnap for anything under scratch/.
```

Your coding agent (Claude Code, Codex, etc.) will automatically:
- Snapshot after creating files
- Snapshot after significant edits (>10 lines or structural changes)
- Use searchable commit messages
- Handle errors without blocking your work

---

## Why Not Just Use Git?

You can—but draftsnap lowers the friction:

| Approach | Setup | Safety | AI-friendly | Overhead |
|----------|-------|--------|-------------|----------|
| `.git/info/exclude` | Manual | ⚠️ Easy to forget | ❌ | Low |
| Branch-per-experiment | Manual | ✅ | ❌ | High |
| VS Code Local History | Automatic | ⚠️ Limited | ❌ | Low |
| **draftsnap** | One command | ✅ Sidecar repo | ✅ JSON output | Low |

---

## Configuration

Optional environment variables:

```bash
export DRAFTSNAP_SCR_DIR=notes        # default: scratch
export DRAFTSNAP_GIT_DIR=.git-scratch # default: .git-scratch
```

---

## Development

```bash
./scripts/bootstrap-bats.sh            # install Bats test runner
./vendor/bats-core/bin/bats tests      # Bash CLI coverage

cd draftsnap-node
pnpm install
pnpm exec vitest                       # Node CLI tests
pnpm run build                         # produce dist/index.js
```

Follow coding guidelines in `AGENTS.md` and check `work-plan.md` for backlog ideas.

---

## Current Release

**draftsnap-node v0.3.0**

- Adds a first-class `draftsnap timeline` command with `fzf` preview, JSON/RAW fallbacks, and in-terminal restore prompts
- Standardizes keybindings (`Enter` for diff, `Ctrl+R` to restore, `Esc` to quit)
- Updates docs/tests to describe and exercise the new workflow

---

## License

MIT – see [LICENSE](LICENSE).

---

## Credits

draftsnap exists because AI pair programming encourages rapid, disposable drafts. By giving those drafts a lightweight safety net, you can explore confidently and recover instantly—no branches, no merge conflicts, and no "wait, what did we just overwrite?" moments.