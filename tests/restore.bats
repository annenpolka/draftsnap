#!/usr/bin/env bats

setup() {
  export TEST_ROOT="${BATS_TEST_TMPDIR}/draftsnap.restore.${BATS_TEST_NAME}"
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
  printf '%s' "$*" > "scratch/notes/${name}.md"
  run draftsnap snap "${name}.md" --space notes -m "$name" --json
  [ "$status" -eq 0 ]
}

@test "restore reinstates file from latest snapshot" {
  run draftsnap ensure --json
  [ "$status" -eq 0 ]

  create_snapshot first "original"
  printf 'mutated' > scratch/notes/first.md

  run draftsnap restore --json HEAD -- scratch/notes/first.md
  [ "$status" -eq 0 ]

  python3 - "$output" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
assert payload["status"] == "ok"
assert payload["data"]["path"] == "scratch/notes/first.md"
assert payload["data"]["bytes"] == len("original")
PY

  diff_output=$(git --git-dir=.git-scratch --work-tree=. diff -- scratch/notes/first.md)
  [ -z "$diff_output" ]
  run cat scratch/notes/first.md
  [ "$status" -eq 0 ]
  [ "$output" = "original" ]
}

@test "restore warns when target differs and creates backup" {
  run draftsnap ensure --json
  [ "$status" -eq 0 ]

  create_snapshot draft "aaa"
  printf 'bbb' > scratch/notes/draft.md

  run draftsnap restore --json HEAD -- scratch/notes/draft.md
  [ "$status" -eq 0 ]

  python3 - "$output" <<'PY'
import json, sys, os
payload = json.loads(sys.argv[1])
warns = payload.get("warnings", [])
assert any("backup" in w for w in warns)
backup = payload["data"].get("backup")
assert backup
assert os.path.exists(backup)
PY

  run cat scratch/notes/draft.md
  [ "$status" -eq 0 ]
  [ "$output" = "aaa" ]
}
