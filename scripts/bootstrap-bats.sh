#!/usr/bin/env bash
set -euo pipefail

VERSION=${BATS_VERSION:-1.11.0}
SHA256=${BATS_SHA256:-aeff09fdc8b0c88b3087c99de00cf549356d7a2f6a69e3fcec5e0e861d2f9063}
PREFIX=${BATS_PREFIX:-vendor/bats-core}
QUIET=0
FORCE=0

usage() {
  cat <<USAGE
Usage: ${0##*/} [options]

Options:
  --version <v>   Override Bats version (default: $VERSION)
  --sha256 <hex>  Override expected SHA256 (default: set for default version)
  --prefix <dir>  Installation target directory (default: $PREFIX)
  --force         Re-install even if target directory exists
  -q, --quiet     Suppress non-error logging
  -h, --help      Show this message
USAGE
}

log() {
  [[ $QUIET -eq 1 ]] && return
  printf '%s\n' "$*"
}

err() {
  printf 'error: %s\n' "$*" >&2
}

fatal() {
  err "$*"
  exit 1
}

needs() {
  command -v "$1" >/dev/null 2>&1 || fatal "required command not found: $1"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --version)
        [[ $# -lt 2 ]] && fatal "--version requires an argument"
        VERSION="$2"
        shift 2
        ;;
      --sha256)
        [[ $# -lt 2 ]] && fatal "--sha256 requires an argument"
        SHA256="$2"
        shift 2
        ;;
      --prefix)
        [[ $# -lt 2 ]] && fatal "--prefix requires an argument"
        PREFIX="$2"
        shift 2
        ;;
      --force)
        FORCE=1
        shift
        ;;
      -q|--quiet)
        QUIET=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        usage >&2
        exit 64
        ;;
    esac
  done
}

download() {
  local url="$1" dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$dest"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$dest" "$url"
  elif command -v fetch >/dev/null 2>&1; then
    fetch -q "$url" -o "$dest"
  else
    fatal "neither curl, wget, nor fetch is available"
  fi
}

sha256_file() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}'
  else
    fatal "cannot verify checksum: sha256sum or shasum not found"
  fi
}

main() {
  parse_args "$@"

  needs tar
  mkdir -p "$(dirname "$PREFIX")"

  if [[ -d "$PREFIX" && $FORCE -eq 0 ]]; then
    log "Bats already present at $PREFIX (use --force to reinstall)"
    exit 0
  fi

  local url="https://github.com/bats-core/bats-core/archive/refs/tags/v${VERSION}.tar.gz"
  local tmpdir
  tmpdir=$(mktemp -d)
  trap '[[ -n "${tmpdir:-}" ]] && rm -rf "$tmpdir"' EXIT
  local archive="$tmpdir/bats-core.tar.gz"

  log "Downloading bats-core ${VERSION}..."
  download "$url" "$archive"

  if [[ -n "$SHA256" ]]; then
    log "Verifying checksum..."
    local actual
    actual=$(sha256_file "$archive")
    if [[ "$actual" != "$SHA256" ]]; then
      fatal "checksum mismatch (expected $SHA256, got $actual)"
    fi
  fi

  [[ $FORCE -eq 1 && -e "$PREFIX" ]] && rm -rf "$PREFIX"

  log "Extracting to $PREFIX"
  tar -xzf "$archive" -C "$tmpdir"
  mv "$tmpdir/bats-core-${VERSION}" "$PREFIX"

  log "Bats ready: $PREFIX/bin/bats"
}

main "$@"
