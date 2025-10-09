#!/usr/bin/env bats

setup() {
  export TEST_ROOT="${BATS_TEST_TMPDIR}/draftsnap.lock.${BATS_TEST_NAME}"
  mkdir -p "$TEST_ROOT"
  cd "$TEST_ROOT"
  git init --quiet
  export PATH="${BATS_TEST_DIRNAME}/../bin:$PATH"
}

teardown() {
  cd /
  rm -rf "$TEST_ROOT"
}

@test "ensure returns code 12 when lock is held" {
  run draftsnap ensure --json
  [ "$status" -eq 0 ]
  mkdir -p .git-scratch/.draftsnap.lock
  run draftsnap ensure --json
  [ "$status" -eq 12 ]
  [[ "$output" == *"locked"* ]]
}

@test "snap returns code 12 when lock is held" {
  run draftsnap ensure --json
  [ "$status" -eq 0 ]
  mkdir -p .git-scratch/.draftsnap.lock
  run draftsnap snap scratch/test.md --json
  [ "$status" -eq 12 ]
}

@test "prune returns code 12 when lock is held" {
  run draftsnap ensure --json
  [ "$status" -eq 0 ]
  mkdir -p .git-scratch/.draftsnap.lock
  run draftsnap prune --keep 1 --json
  [ "$status" -eq 12 ]
}
