#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT_DIR"

run_shellcheck() {
  if ! command -v shellcheck >/dev/null 2>&1; then
    echo "shellcheck not found; skipping lint" >&2
    return 0
  fi
  echo "Running shellcheck..." >&2
  shellcheck bin/draftsnap scripts/bootstrap-bats.sh
}

run_bats() {
  echo "Running bats tests..." >&2
  ./vendor/bats-core/bin/bats tests
}

run_shellcheck
run_bats
