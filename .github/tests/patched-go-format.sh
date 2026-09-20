#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
CHECKER="$ROOT_DIR/.github/scripts/check-patched-go.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/patches" "$TMP/src/pkg/demo"
cat >"$TMP/patches/0001-demo.patch" <<'EOF'
diff --git a/pkg/demo/demo.go b/pkg/demo/demo.go
--- a/pkg/demo/demo.go
+++ b/pkg/demo/demo.go
@@ -1 +1 @@
-package demo
+package demo
EOF
cat >"$TMP/src/pkg/demo/demo.go" <<'EOF'
package demo
func Demo( ){ }
EOF

if PATCH_DIR="$TMP/patches" TELEGO_SRC_DIR="$TMP/src" "$CHECKER" >/dev/null 2>&1; then
  echo 'unformatted patched Go file unexpectedly passed checker' >&2
  exit 1
fi

gofmt -w "$TMP/src/pkg/demo/demo.go"
PATCH_DIR="$TMP/patches" TELEGO_SRC_DIR="$TMP/src" "$CHECKER" >/dev/null

for workflow in "$ROOT_DIR/.github/workflows/build-telego.yaml" "$ROOT_DIR/.github/workflows/release.yaml"; do
  grep -Fq 'bash .github/scripts/check-patched-go.sh' "$workflow"
done

echo 'patched Go formatting checker tests passed'
