# draftsnap-node

TypeScript/Node implementation of the draftsnap CLI. It mirrors the Bash tool while paving the path toward a JavaScript-first workflow for agents and automation.

## Install

Use `pnpm dlx` to execute without installing globally:

```bash
pnpm dlx draftsnap-node@latest status --json
```

Or add it to a project:

```bash
pnpm add -D draftsnap-node@latest
```

The CLI executable name is `draftsnap`. After installation you can run `draftsnap ensure --json` just like the Bash version.

## Commands

- `ensure` – initialise or verify the `.git-scratch` sidecar repository
- `snap` – snapshot a file (`--space`, `--all`, `--stdin` supported)
- `log` – list snapshots, optionally with `--timeline`
- `diff` – compare recent snapshots (`--since`, `--current`)
- `status` – show initialisation and lock state, plus exclude configuration
- `restore` – restore a path from a given revision
- `prune` – trim older snapshots keeping the most recent `--keep` commits

Every command supports `--json`, `--quiet`, and `--debug` for automation parity with the Bash CLI.

## Development

```bash
pnpm install
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
```

Tests rely on Vitest and create temporary Git repositories under `tests/setup`. The TDD flow should follow the repository-wide `AGENTS.md` guidance (write failing test, make it pass, refactor).

## Release Checklist

1. Update `package.json` version.
2. Run `pnpm run build` and smoke-test `node dist/index.js status --json`.
3. Publish with `pnpm publish --access public`.
4. Tag `draftsnap-node-v<version>` in the monorepo and push.
