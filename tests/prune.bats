#!/usr/bin/env bats

setup() {
  export TEST_ROOT="${BATS_TEST_TMPDIR}/draftsnap.prune.${BATS_TEST_NAME}"
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

@test "prune keeps latest N commits and removes older ones" {
  run draftsnap ensure --json
  [ "$status" -eq 0 ]

  for tag in one two three four; do
    create_snapshot "$tag" "$tag"
    sleep 0.1
  done

  run draftsnap prune --keep 2 --json
  [ "$status" -eq 0 ]

  python3 - "$output" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
data = payload["data"]
assert data["kept"] == 2
assert data["removed"] == 2
PY

  count=$(git --git-dir=.git-scratch --work-tree=. rev-list --count HEAD)
  [ "$count" -eq 2 ]
}

@test "prune archives removed commits before deletion" {
  run draftsnap ensure --json
  [ "$status" -eq 0 ]
  create_snapshot alpha "alpha"
  sleep 0.1
  create_snapshot beta "beta"

  mkdir archives
  run draftsnap prune --keep 1 --archive archives --json
  [ "$status" -eq 0 ]
  python3 - "$output" <<'PY'
import json, sys, os
payload = json.loads(sys.argv[1])
removed = payload["data"].get("removed", [])
assert removed
archive = payload["data"].get("archive")
assert archive and os.path.isdir(archive)
PY

  ls archives > /dev/null
}
