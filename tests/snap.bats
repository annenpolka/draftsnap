#!/usr/bin/env bats

setup() {
  export TEST_ROOT="${BATS_TEST_TMPDIR}/draftsnap.snap.${BATS_TEST_NAME}"
  mkdir -p "$TEST_ROOT"
  cd "$TEST_ROOT"
  git init --quiet
  export PATH="${BATS_TEST_DIRNAME}/../bin:$PATH"
}

teardown() {
  cd /
  rm -rf "$TEST_ROOT"
}

@test "snap commits new file and returns commit metadata" {
  run draftsnap ensure --json
  [ "$status" -eq 0 ]

  echo "first draft" > scratch/notes.md
  run draftsnap snap scratch/notes.md -m "init note" --json
  [ "$status" -eq 0 ]

  python3 - "$output" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
data = payload["data"]
assert payload["status"] == "ok"
assert payload["code"] == 0
assert data["path"] == "scratch/notes.md"
assert isinstance(data["commit"], str) and len(data["commit"]) == 40
assert data["bytes"] > 0
PY

  git --git-dir=.git-scratch --work-tree=. log --oneline > scratch.log
  grep -Fq "init note" scratch.log
}

@test "snap returns code 10 when no changes" {
  run draftsnap ensure --json
  [ "$status" -eq 0 ]

  echo hello > scratch/notes.md
  run draftsnap snap scratch/notes.md -m "hello" --json
  [ "$status" -eq 0 ]

  run draftsnap snap scratch/notes.md -m "again" --json
  [ "$status" -eq 10 ]
  python3 - "$output" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
assert payload["code"] == 10
assert payload["data"]["commit"] is None
assert payload["data"]["bytes"] == 0
assert payload["status"] == "ok"
PY
}

@test "snap dash captures stdin into stream file" {
  run draftsnap ensure --json
  [ "$status" -eq 0 ]

  run sh -c 'printf "stream draft" | draftsnap snap - -m "stdin note" --json'
  [ "$status" -eq 0 ]

  python3 - "$output" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
path = payload["data"]["path"]
assert path.startswith("scratch/stream-")
assert path.endswith(".md")
assert payload["data"]["bytes"] == 12
assert payload["data"]["commit"]
content = open(path).read()
assert content == "stream draft"
PY
}

@test "snap exits with code 12 when lock is held" {
  run draftsnap ensure --json
  [ "$status" -eq 0 ]
  mkdir -p .git-scratch/.draftsnap.lock
  run draftsnap snap scratch/locked.md -m "locked" --json
  [ "$status" -eq 12 ]
  python3 - "$output" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
assert payload["code"] == 12
assert payload["status"] == "error"
PY
  rm -rf .git-scratch/.draftsnap.lock
}

@test "snap supports space option" {
  run draftsnap ensure --json
  [ "$status" -eq 0 ]
  mkdir -p scratch/ideas
  echo "space content" > scratch/ideas/brainstorm.md

  run draftsnap snap brainstorm.md --space ideas -m "outline" --json
  [ "$status" -eq 0 ]

  python3 - "$output" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
assert payload["data"]["path"] == "scratch/ideas/brainstorm.md"
assert payload["data"]["bytes"] == 14
PY

  subject=$(git --git-dir=.git-scratch --work-tree=. log -1 --pretty=%s)
  [[ "$subject" == "[space:ideas] outline" ]]
}
