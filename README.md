# draftsnap

[![CI](https://github.com/annenpolka/draftsnap/actions/workflows/check.yml/badge.svg)](https://github.com/annenpolka/draftsnap/actions/workflows/check.yml)
[![Latest Release](https://img.shields.io/github/v/release/annenpolka/draftsnap)](https://github.com/annenpolka/draftsnap/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Undo for AI pair programming.** Keep experiments in `scratch/`, snapshot automatically, and rewind instantly.

---

## The Problem

You ask an AI to “make this design more detailed” and it rewrites the entire document. Two prompts later you decide the simpler version was better—but you never saved it. When you say “go back,” the model shrugs; you have no diff, no history, and no way to recover the draft you liked.

This happens all the time when pair programming with AI. Git can help, but only if you manually manage branches, exclusions, and commit messages. That overhead kills flow.

---

## The Solution

`draftsnap` gives you automatic version control for temporary AI work:

- Snapshot scratch files with one command (or let your assistant do it)
- Browse history visually with `draftsnap timeline`
- Restore any prior snapshot in seconds
- Keep experiments out of your real Git history

Under the hood it is “just Git,” but configured as a sidecar repo that tracks only `scratch/`. There is no ceremony, no risk of pushing drafts, and no need to remember exclusions.

---

## What This Is (and Isn’t)

**draftsnap is:**
- A safety net for AI-generated drafts and experiments
- Git with training wheels—sidecar history, JSON output, idempotent commands
- Five simple CLI commands you can hand to an assistant

**draftsnap is not:**
- A replacement for Git in your main repository
- Magic (you could replicate it with `.git/info/exclude` + discipline)
- Complex—you can learn it in a coffee break

If you have ever said “wait, show me the previous version” to an AI and had nothing to revert to, draftsnap is useful.

---

## How It Works

- A second Git repository lives at `.git-scratch/`
- Only files beneath `scratch/` are tracked
- Commands expose consistent JSON and clear exit codes for automation
- Scratch history never touches origin, so you can’t accidentally push it

Want to promote a draft to your real project? Move it out of `scratch/` and commit as usual.

---

## Quick Start

### Install (NodeCLI – recommended)

```bash
npm install --save-dev draftsnap-node       # or pnpm add -D draftsnap-node
```

Run once without installing:

```bash
npx draftsnap-node@latest status --json
pnpm dlx draftsnap-node@latest status --json
```

Global install:

```bash
npm install --global draftsnap-node         # or pnpm add -g draftsnap-node
draftsnap status --json
```

### Initialize once per project

```bash
draftsnap ensure
```

### Snapshot scratch files

```bash
echo "# My Draft" > scratch/notes.md
draftsnap snap scratch/notes.md -m "purpose: initial draft"

echo "More detail" >> scratch/notes.md
draftsnap snap scratch/notes.md -m "purpose: add detail"
```

### Explore with timeline

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

### Other essentials

| Command | Purpose |
|---------|---------|
| `draftsnap log [--json]` | Show snapshot history as text or JSON |
| `draftsnap snap --all -m "purpose: checkpoint"` | Snapshot every modified scratch file |
| `draftsnap restore <rev> -- scratch/notes.md` | Restore a file from a specific snapshot |
| `draftsnap prompt` | Print AI-friendly instructions |

Exit codes: `0` success · `10` no changes · `11` not initialized · `12` locked · `13` precondition failed · `14` invalid arguments.

---

## AI Integration

`draftsnap prompt` prints a miniature playbook for assistants:

1. Run `draftsnap ensure` once per session
2. Snapshot after creating or editing files in `scratch/`
3. Use descriptive messages such as `purpose: refine intro`
4. Handle exit codes without halting work

Share that output with your AI and tell it “use draftsnap for anything under `scratch/`.”

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

draftsnap exists because AI pair programming encourages rapid, disposable drafts. By giving those drafts a lightweight safety net, you can explore confidently and recover instantly—no branches, no merge conflicts, and no “wait, what did we just overwrite?” moments.
