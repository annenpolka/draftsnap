#!/usr/bin/env bats

PROMPT_TEXT=$'You may optionally use a CLI tool named “draftsnap” to manage temporary drafts (e.g., Markdown notes) in a sidecar Git repository. Your role is not fixed to “document manager”; use this tool only when it helps your current task.\n\nBasic rules:\n1) Once per session, run `draftsnap ensure --json`. It idempotently prepares a local sidecar repo, creates the scratch directory, and sets `.git/info/exclude`. Proceed only if it returns JSON with code 0.\n2) When you create or edit a temporary draft under the configured scratch directory (default: `scratch/`), snapshot it with:\n   `draftsnap snap <path> -m "<short reason>" --json`\n   Treat exit code 0 as committed. Treat exit code 10 as “no changes” (still a success).\n3) Parse only STDOUT as JSON (`--json`). Never parse STDERR; it is human-oriented logs.\n4) To review or roll back, you may call:\n   - `draftsnap log --json [-- <path>]` to list history,\n   - `draftsnap diff [REV] --json [-- <path>]` to inspect changes,\n   - `draftsnap restore <REV> -- <path> --json` to restore content into the working tree.\n5) For periodic cleanup, you may run `draftsnap prune --keep 200 --json` (or `--days N`). Use it sparingly.\n6) Do not modify `.gitignore`; drafts are excluded locally via `.git/info/exclude`. The tool never pushes to any remote.\n7) If `draftsnap` is unavailable, continue your task without it; do not block.\n\nMessage convention for `-m`:\nUse a terse “purpose: summary” style, e.g., `purpose: tighten outline`, so commits are searchable.\n\nReturn handling:\n- Success with commit: `{"status":"ok","code":0,...}`\n- Success with no changes: `{"status":"ok","code":10,...}`\n- Precondition or lock errors are non-fatal to your overall task; you may retry later.\n\nExample:\n- Start: `draftsnap ensure --json`\n- After writing `scratch/idea.md`: `draftsnap snap scratch/idea.md -m "purpose: refine intro" --json`\n\nUse the tool when it reduces risk or friction; otherwise proceed normally.'

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
  [[ "$output" == *"Commands"* ]]
  [[ "$output" == *"Global options"* ]]
  [[ "$output" == *"Exit codes"* ]]
}

@test "help --json lists commands" {
  run draftsnap help --json
  [ "$status" -eq 0 ]
  python3 - "$output" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
assert payload["status"] == "ok"
data = payload["data"]
commands = data.get("commands", [])
assert set(["ensure","snap","log","diff","restore","prune","help","prompt"]).issubset(set(commands))
assert data.get("global_options")
exit_codes = data.get("exit_codes", {})
assert set(exit_codes.keys()) == {"0","10","11","12","13","14"}
PY
}

@test "prompt emits agent guidance" {
  run draftsnap prompt
  [ "$status" -eq 0 ]
  [ "$output" = "$PROMPT_TEXT" ]
}

@test "prompt --json returns structured instructions" {
  run draftsnap prompt --json
  [ "$status" -eq 0 ]
  python3 - <<'PY' "$output" "$PROMPT_TEXT"
import json, sys
payload = json.loads(sys.argv[1])
expected = sys.argv[2]
assert payload["status"] == "ok"
assert payload["data"].get("instructions") == expected
PY
}
