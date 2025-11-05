# Changelog

All notable changes will be documented in this file. This project adheres to [SemVer](https://semver.org/spec/v2.0.0.html) while still pre-1.0.

## [0.3.2] - 2025-11-05

### Fixed
- `snap --all` no longer crashes when previously tracked files are deleted; staged bytes are calculated only for entries that still exist on disk.
- `ensure` and `status` detect `.git` indirection files produced by `git worktree`, so exclude entries are always managed in the correct repository.

### Changed
- `prune` now clones directly from the sidecar Git directory instead of temporarily replacing the main `.git`, preventing worktree conflicts during cleanup.

## [0.3.1] - 2025-10-14

### Fixed
- Allow `snap` to commit files even when `scratch/` is ignored in `.gitignore`.
- Scoped Biome linting to source and test directories to prevent noise from generated bundles.

## [0.3.0] - 2025-10-14


### Added
- Introduced `draftsnap timeline` command with an fzf-powered interactive UI, JSON and plain-text fallbacks, and in-place restore prompts.

### Changed
- Standardised diff viewing to `Enter`, adopted cross-platform `Ctrl+R` restore shortcut, and simplified quitting via `Esc`.
- Refreshed documentation and automated coverage to describe and verify the new timeline experience.

## [0.2.1] - 2025-10-14

### Added
- Implemented `draftsnap prompt` in the Node CLI with canonical workflow guidance and JSON support.

### Changed
- Running `draftsnap` without arguments now prints a helpful hint instead of exiting silently, mirroring the Bash CLI.
- Expanded automated coverage for prompt guidance and default invocation behaviour.


## [0.2.0] - 2025-10-13

### Added
- Complete Node CLI covering `ensure`, `snap`, `status`, `log`, `diff`, `restore`, and `prune` commands with JSON parity.
- Timeline utilities and `log --timeline` output compatible with the Bash implementation.
- Space-aware snapshots (`snap --space`) with matching commit annotations.
- Diff basis metadata, `--since` comparisons, and per-path statistics.
- Status reporting for exclude configuration (`exclude.main` and `exclude.sidecar`).
- README documentation for the Node-first workflow and agent guidance.

### Changed
- Renamed the published binary from `draftsnap-node` to `draftsnap` for drop-in replacement of the Bash CLI.
- Updated testing coverage to include parity scenarios for every command.

### Fixed
- Missing `path` metadata in log entries when filtering by file.
- Incomplete exclude configuration when initialising sidecars.

[0.3.2]: https://github.com/annenpolka/draftsnap/releases/tag/draftsnap-node-v0.3.2
[0.3.1]: https://github.com/annenpolka/draftsnap/releases/tag/draftsnap-node-v0.3.1
[0.3.0]: https://github.com/annenpolka/draftsnap/releases/tag/draftsnap-node-v0.3.0
[0.2.1]: https://github.com/annenpolka/draftsnap/releases/tag/draftsnap-node-v0.2.1
[0.2.0]: https://github.com/annenpolka/draftsnap/releases/tag/draftsnap-node-v0.2.0
