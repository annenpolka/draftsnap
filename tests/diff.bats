#!/usr/bin/env bats

setup() {
  export TEST_ROOT="${BATS_TEST_TMPDIR}/draftsnap.diff.${BATS_TEST_NAME}"
  mkdir -p "$TEST_ROOT"
  cd "$TEST_ROOT"
  git init --quiet
  export PATH="${BATS_TEST_DIRNAME}/../bin:$PATH"
}

teardown() {
  cd /
  rm -rf "$TEST_ROOT"
}

create_snapshot() {
  local name="$1"; shift
  mkdir -p scratch/notes
  echo "$*" > "scratch/notes/${name}.md"
  run draftsnap snap "${name}.md" --space notes -m "$name" --json
  [ "$status" -eq 0 ]
}

@test "diff default compares latest two snapshots" {
  run draftsnap ensure --json
  [ "$status" -eq 0 ]

  mkdir -p scratch
  create_snapshot first "alpha"
  sleep 1
  create_snapshot second "beta"

  run draftsnap diff --json
  [ "$status" -eq 0 ]
  python3 - "$output" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
data = payload["data"]
assert data["basis"]["type"] == "latest_pair"
entries = data["entries"]
assert len(entries) == 1
entry = entries[0]
assert entry["path"] == "scratch/notes/second.md"
assert entry["added"] > 0
PY
}

@test "diff --since 1 compares current HEAD to previous snapshot" {
  run draftsnap ensure --json
  [ "$status" -eq 0 ]
  mkdir -p scratch
  create_snapshot one "aaa"
  sleep 1
  create_snapshot two "bbb"
  sleep 1
  create_snapshot three "ccc"

  run draftsnap diff --json --since 1
  [ "$status" -eq 0 ]
  python3 - "$output" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
assert payload["data"]["basis"]["type"] == "since"
assert payload["data"]["basis"]["since"] == 1
PY
}

@test "diff --current compares working tree against latest snapshot" {
  run draftsnap ensure --json
  [ "$status" -eq 0 ]
  mkdir -p scratch
  create_snapshot base "base"
  echo changed > scratch/notes/base.md

  run draftsnap diff --current --json
  [ "$status" -eq 0 ]
  python3 - "$output" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
assert payload["data"]["basis"]["type"] == "current"
entries = payload["data"]["entries"]
assert entries
PY
}

@test "diff prints human output when not json" {
  run draftsnap ensure --json
  [ "$status" -eq 0 ]
  mkdir -p scratch
  create_snapshot foo "hello"
  sleep 1
  create_snapshot bar "world"

  run draftsnap diff
  [ "$status" -eq 0 ]
  [[ "$output" == *"scratch/notes/bar.md"* ]]
}
