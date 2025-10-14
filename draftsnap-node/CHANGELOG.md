# Changelog

All notable changes will be documented in this file. This project adheres to [SemVer](https://semver.org/spec/v2.0.0.html) while still pre-1.0.

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

[0.2.1]: https://github.com/annenpolka/draftsnap/releases/tag/draftsnap-node-v0.2.1
[0.2.0]: https://github.com/annenpolka/draftsnap/releases/tag/draftsnap-node-v0.2.0
