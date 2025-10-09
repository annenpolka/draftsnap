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
}
