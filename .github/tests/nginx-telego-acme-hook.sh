#!/bin/bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
HOOK="$ROOT/package/nginx-telego/files/etc/hotplug.d/acme/90-nginx-telego"
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT

cat >"$work/cert-helper" <<'SH'
#!/bin/sh
printf '%s\n' "$*" >>"$HOOK_HELPER_LOG"
[ "${HOOK_HELPER_FAIL:-0}" != 1 ]
SH
chmod +x "$work/cert-helper"

cat >"$work/logger" <<'SH'
#!/bin/sh
printf '%s\n' "$*" >>"$HOOK_LOGGER_LOG"
SH
chmod +x "$work/logger"

export NGINX_TELEGO_CERT_BIN="$work/cert-helper"
export LOGGER_BIN="$work/logger"
export HOOK_HELPER_LOG="$work/helper.log"
export HOOK_LOGGER_LOG="$work/logger.log"
: >"$HOOK_HELPER_LOG"
: >"$HOOK_LOGGER_LOG"

ACTION=renewed "$HOOK"
grep -Fqx 'preflight' "$HOOK_HELPER_LOG"
grep -q 'renewed:' "$HOOK_LOGGER_LOG"

: >"$HOOK_HELPER_LOG"
: >"$HOOK_LOGGER_LOG"
ACTION=issued "$HOOK"
grep -Fqx 'preflight' "$HOOK_HELPER_LOG"
grep -q 'issued:' "$HOOK_LOGGER_LOG"

: >"$HOOK_HELPER_LOG"
: >"$HOOK_LOGGER_LOG"
export HOOK_HELPER_FAIL=1
ACTION=renewed "$HOOK"
grep -Fqx 'preflight' "$HOOK_HELPER_LOG"
grep -q 'renewed preflight failed:' "$HOOK_LOGGER_LOG"
unset HOOK_HELPER_FAIL

: >"$HOOK_HELPER_LOG"
ACTION=prepare "$HOOK"
[[ ! -s "$HOOK_HELPER_LOG" ]]

echo 'nginx-telego ACME hotplug tests passed'
