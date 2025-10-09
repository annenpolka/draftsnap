#!/usr/bin/env bats

load_helpers() {
  export TEST_ROOT="${BATS_TEST_TMPDIR}/draftsnap.log.${BATS_TEST_NAME}"
  mkdir -p "$TEST_ROOT"
  cd "$TEST_ROOT"
  git init --quiet
  export PATH="${BATS_TEST_DIRNAME}/../bin:$PATH"
}

setup() {
  load_helpers
}

teardown() {
  cd /
  rm -rf "$TEST_ROOT"
}

@test "log --json returns commits in reverse chronological order" {
  run draftsnap ensure --json
  [ "$status" -eq 0 ]

  mkdir -p scratch
  echo alpha > scratch/alpha.md
  run draftsnap snap alpha.md --space notes -m "alpha" --json
  [ "$status" -eq 0 ]

  sleep 1
  echo beta > scratch/beta.md
  run draftsnap snap beta.md --space notes -m "beta" --json
  [ "$status" -eq 0 ]

  run draftsnap log --json
  [ "$status" -eq 0 ]

  python3 - "$output" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
entries = payload["data"]["entries"]
assert len(entries) >= 2
assert entries[0]["message"].endswith("beta")
assert entries[0]["path"] == "scratch/notes/beta.md"
assert entries[1]["path"] == "scratch/notes/alpha.md"
PY
}

@test "log prints human readable lines" {
  run draftsnap ensure --json
  [ "$status" -eq 0 ]
  echo gamma > scratch/gamma.md
  run draftsnap snap gamma.md --json
  [ "$status" -eq 0 ]

  run draftsnap log
  [ "$status" -eq 0 ]
  [[ "$output" == *"scratch/gamma.md"* ]]
}
