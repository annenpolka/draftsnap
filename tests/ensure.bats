#!/usr/bin/env bats

setup() {
  export TEST_ROOT="${BATS_TEST_TMPDIR}/draftsnap.${BATS_TEST_NAME}"
  mkdir -p "$TEST_ROOT"
  cd "$TEST_ROOT"
  git init --quiet
  export PATH="${BATS_TEST_DIRNAME}/../bin:$PATH"
}

teardown() {
  cd /
  rm -rf "$TEST_ROOT"
}

@test "ensure initializes scratch repo and reports success" {
  run env DRAFTSNAP_SCR_DIR=scratch DRAFTSNAP_GIT_DIR=.git-scratch draftsnap ensure --json
  [ "$status" -eq 0 ]

  [[ -d "$TEST_ROOT/.git-scratch" ]]
  [[ -d "$TEST_ROOT/scratch" ]]

  [[ "$output" == *'"status":"ok"'* ]]
  [[ "$output" == *'"code":0'* ]]
  [[ "$output" == *'"initialized":true'* ]]
  [[ "$output" == *'"git_dir":".git-scratch"'* ]]
  [[ "$output" == *'"scr_dir":"scratch"'* ]]

  grep -Fxq '.git-scratch/' .git/info/exclude
  grep -Fxq 'scratch/' .git/info/exclude

  local side_exclude="$TEST_ROOT/.git-scratch/info/exclude"
  [[ -f "$side_exclude" ]]
  [[ $(grep -cFx '*' "$side_exclude") -eq 1 ]]
  [[ $(grep -cFx '!scratch/' "$side_exclude") -eq 1 ]]
  [[ $(grep -cFx '!scratch/**' "$side_exclude") -eq 1 ]]

python3 - "$output" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
assert payload["data"].get("files") == []
assert payload["data"].get("files_count") == 0
PY
}

@test "ensure runs idempotently without duplicating exclude rules" {
  run env DRAFTSNAP_SCR_DIR=scratch DRAFTSNAP_GIT_DIR=.git-scratch draftsnap ensure --json
  [ "$status" -eq 0 ]
  run env DRAFTSNAP_SCR_DIR=scratch DRAFTSNAP_GIT_DIR=.git-scratch draftsnap ensure --json
  [ "$status" -eq 0 ]
  [[ "$output" == *'"initialized":false'* ]]

  local side_exclude="$TEST_ROOT/.git-scratch/info/exclude"
  [[ $(grep -cFx '*' "$side_exclude") -eq 1 ]]
  [[ $(grep -cFx '!scratch/' "$side_exclude") -eq 1 ]]
  [[ $(grep -cFx '!scratch/**' "$side_exclude") -eq 1 ]]

  local main_exclude=".git/info/exclude"
  [[ $(grep -cFx '.git-scratch/' "$main_exclude") -eq 1 ]]
  [[ $(grep -cFx 'scratch/' "$main_exclude") -eq 1 ]]

python3 - "$output" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
assert isinstance(payload["data"].get("files"), list)
assert payload["data"].get("files_count") == 0
PY
}

@test "ensure tolerates read-only main git exclude" {
  mkdir -p .git/info
  touch .git/info/exclude
  chmod 444 .git/info/exclude

  run env DRAFTSNAP_SCR_DIR=scratch DRAFTSNAP_GIT_DIR=.git-scratch draftsnap ensure --json
  [ "$status" -eq 0 ]

  local main_exclude=".git/info/exclude"
  [[ -f "$main_exclude" ]]
  [[ $(grep -cFx '.git-scratch/' "$main_exclude") -eq 0 ]]
  [[ $(grep -cFx 'scratch/' "$main_exclude") -eq 0 ]]

  local side_exclude="$TEST_ROOT/.git-scratch/info/exclude"
  [[ -f "$side_exclude" ]]
  [[ $(grep -cFx '*' "$side_exclude") -eq 1 ]]
  [[ $(grep -cFx '!scratch/' "$side_exclude") -eq 1 ]]
  [[ $(grep -cFx '!scratch/**' "$side_exclude") -eq 1 ]]

python3 - "$output" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
assert payload["status"] == "ok"
assert payload["code"] == 0
assert payload["data"]["initialized"] is True
PY
}

@test "ensure respects environment overrides" {
  run env DRAFTSNAP_SCR_DIR="notes/drafts" DRAFTSNAP_GIT_DIR=".git-drafts" draftsnap ensure --json
  [ "$status" -eq 0 ]

  [[ -d "$TEST_ROOT/.git-drafts" ]]
  [[ -d "$TEST_ROOT/notes/drafts" ]]

# shellcheck disable=SC2016
python3 - "$output" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
assert payload["status"] == "ok"
assert payload["code"] == 0
assert payload["data"]["git_dir"] == ".git-drafts"
assert payload["data"]["scr_dir"] == "notes/drafts"
PY

  grep -Fxq '.git-drafts/' .git/info/exclude
  grep -Fxq 'notes/drafts/' .git/info/exclude

  local side_exclude="$TEST_ROOT/.git-drafts/info/exclude"
  [[ $(grep -cFx '*' "$side_exclude") -eq 1 ]]
  [[ $(grep -cFx '!notes/drafts/' "$side_exclude") -eq 1 ]]
  [[ $(grep -cFx '!notes/drafts/**' "$side_exclude") -eq 1 ]]

python3 - "$output" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
assert payload["data"]["files"] == []
assert payload["data"]["files_count"] == 0
PY
}

@test "status reports uninitialized repo" {
  run draftsnap status --json
  [ "$status" -eq 0 ]

python3 - "$output" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
data = payload["data"]
assert data["initialized"] is False
assert data["git_dir"] == ".git-scratch"
assert data["scr_dir"] == "scratch"
assert data["locked"] is False
main = data["exclude"]["main"]
side = data["exclude"]["sidecar"]
assert main["git_dir"] is False
assert main["scr_dir"] is False
assert side["wildcard"] is False
assert side["scr_dir"] is False
assert side["scr_glob"] is False
PY
}

@test "status reports initialized repo" {
  run draftsnap ensure --json
  [ "$status" -eq 0 ]
  run draftsnap status --json
  [ "$status" -eq 0 ]

python3 - "$output" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
data = payload["data"]
assert data["initialized"] is True
assert data["locked"] is False
main = data["exclude"]["main"]
side = data["exclude"]["sidecar"]
assert main["git_dir"] is True
assert main["scr_dir"] is True
assert side["wildcard"] is True
assert side["scr_dir"] is True
assert side["scr_glob"] is True
PY
}

@test "status reports locked when lock directory exists" {
  run draftsnap ensure --json
  [ "$status" -eq 0 ]
  mkdir -p .git-scratch/.draftsnap.lock
  run draftsnap status --json
  [ "$status" -eq 0 ]
  python3 - "$output" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
assert payload["data"]["locked"] is True
PY
  rm -rf .git-scratch/.draftsnap.lock
}

@test "ensure lists existing tracked files" {
  run draftsnap ensure --json
  [ "$status" -eq 0 ]

  mkdir -p scratch
  echo "note" > scratch/note.md
  run draftsnap snap scratch/note.md -m "note" --json
  [ "$status" -eq 0 ]

  run draftsnap ensure --json
  [ "$status" -eq 0 ]
python3 - "$output" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
files = payload["data"]["files"]
assert isinstance(files, list)
assert "scratch/note.md" in files, files
assert payload["data"]["files_count"] == len(files) == 1
PY

  run draftsnap ensure
  [ "$status" -eq 0 ]
  [[ "$output" == *"existing files (1)"* ]]
}
