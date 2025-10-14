# Repository Guidelines

## Project Structure & Module Organization
- `src/`: TypeScript implementation of the draftsnap CLI (primary moving forward).
- `dist/`: Build artifacts produced by `pnpm run build`.
- `tests/node/`: Vitest suites covering commands, utilities, and integration flows.
- `bin/draftsnap`: Legacy Bash CLI (kept temporarily for reference—avoid extending).
- `scratch/`: Sidecar workspace tracked by draftsnap; keep agent notes under `scratch/logs/` and remove when not needed.
- `docs/` and `work-plan.md`: Design notes and backlog; consult before adding new features.

## Build, Test, and Development Commands
- `pnpm install --frozen-lockfile`: install dependencies at the repository root.
- `pnpm lint`: run Biome checks over `src/` and `tests/node/`.
- `pnpm typecheck`: ensure TypeScript sources compile cleanly.
- `pnpm test --run`: execute the Vitest suite (covers command parity and integrations).
- `pnpm run build`: emit bundled CLI into `dist/`.
- `bin/draftsnap ensure --json`: initialize sidecar repo (safe to run repeatedly).
- `bin/draftsnap log --json` and `bin/draftsnap diff --json`: inspect recent snapshots and differences while coding.

## Coding Style & Naming Conventions
- TypeScript (ESM, Node 18+) with Biome formatting (`pnpm lint` / `pnpm format --write`).
- Prefer small, composable modules under `src/commands`, `src/core`, and `src/utils`.
- Command names follow `draftsnap <noun>`; new subcommands should accept `--json`, `--quiet`, `--dry-run` for consistency.
- Snapshots live under `scratch/<space>/`; default space is implied when absent.

## Testing Guidelines
- Framework: [Vitest](https://vitest.dev/) in `tests/node/` (integration + unit coverage).
- Tests create temporary Git repositories under the OS tmpdir; ensure clean-up with `afterEach`.
- Cover JSON and human output modes, exit codes, and error handling for each command.
- Keep runtime under ~20s by scoping fixtures and reusing helpers in `tests/node/setup/`.

## Commit & Pull Request Guidelines
- Commit messages use short imperative prefixes (`feat:`, `fix:`, `test:`, `chore:`) as seen in history.
- One logical change per commit; include updated tests/docs.
- PRs should summarize behaviour, list commands run (`pnpm lint`, `pnpm test --run`, `pnpm run build`), and link relevant backlog items in `work-plan.md`.
- Capture agent activity with `draftsnap snap --space logs` so reviewers can replay your context.

## Agent-Specific Tips
- Acquire the draftsnap lock (`acquire_lock`) before mutating tracked files; avoid manual writes inside `.git-scratch/`.
- Prefer existing helpers in `src/utils` rather than reimplementing plumbing.
- When extending CLI, add Red tests first, update README quick-start, and log the decision in `scratch/logs/`.
