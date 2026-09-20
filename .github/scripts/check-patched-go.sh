#!/usr/bin/env bash
set -euo pipefail

PATCH_DIR=${PATCH_DIR:-patches}
TELEGO_SRC_DIR=${TELEGO_SRC_DIR:-telego-src}

mapfile -t files < <(
  awk '/^\+\+\+ b\/.*\.go$/ {
    sub(/^\+\+\+ b\//, "", $0)
    print $0
  }' "$PATCH_DIR"/*.patch | sort -u
)

if (( ${#files[@]} == 0 )); then
  echo "::error::No patched Go files were discovered in $PATCH_DIR" >&2
  exit 1
fi

targets=()
for file in "${files[@]}"; do
  target="$TELEGO_SRC_DIR/$file"
  if [[ ! -f "$target" ]]; then
    echo "::error::Patched Go file is missing after patch application: $target" >&2
    exit 1
  fi
  targets+=("$target")
done

unformatted="$(gofmt -l "${targets[@]}")"
if [[ -n "$unformatted" ]]; then
  echo "::error::OpenWrt-patched Go source is not gofmt-clean:" >&2
  printf '%s\n' "$unformatted" >&2
  exit 1
fi

printf 'gofmt verified %d patched Go files\n' "${#targets[@]}"
