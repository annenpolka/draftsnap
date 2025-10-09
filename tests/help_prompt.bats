#!/usr/bin/env bats

setup() {
  export TEST_ROOT="${BATS_TEST_TMPDIR}/draftsnap.help.${BATS_TEST_NAME}"
  mkdir -p "$TEST_ROOT"
  cd "$TEST_ROOT"
  export PATH="${BATS_TEST_DIRNAME}/../bin:$PATH"
}

teardown() {
  cd /
  rm -rf "$TEST_ROOT"
}

@test "help prints usage summary" {
  run draftsnap help
  [ "$status" -eq 0 ]
  [[ "$output" == *"Usage: draftsnap"* ]]
  [[ "$output" == *"ensure"* ]]
  [[ "$output" == *"snap"* ]]
}

@test "help --json lists commands" {
  run draftsnap help --json
  [ "$status" -eq 0 ]
  python3 - "$output" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
assert payload["status"] == "ok"
commands = payload["data"].get("commands", [])
assert set(["ensure","snap","log","diff","restore","prune","help","prompt"]).issubset(set(commands))
PY
}

@test "prompt emits agent guidance" {
  run draftsnap prompt
  [ "$status" -eq 0 ]
  [[ "$output" == *"draftsnap ensure --json"* ]]
  [[ "$output" == *"draftsnap snap"* ]]
  [[ "$output" == *"draftsnap prune"* ]]
}

@test "prompt --json returns structured instructions" {
  run draftsnap prompt --json
  [ "$status" -eq 0 ]
  python3 - "$output" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
assert payload["status"] == "ok"
text = payload["data"].get("instructions", "")
assert "draftsnap ensure --json" in text
assert "draftsnap snap" in text
assert "draftsnap prune" in text
PY
}
