#!/bin/bash
set -euo pipefail

work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT

cat >"$work/reconcile" <<'SH'
#!/bin/sh
printf 'nginx %s\n' "$*" >>"$NGINX_TELEGO_TEST_LOG"
SH
chmod +x "$work/reconcile"

cat >"$work/firewall" <<'SH'
#!/bin/sh
printf 'firewall %s\n' "$*" >>"$NGINX_TELEGO_TEST_LOG"
[ "${FIREWALL_FAIL_ACTION:-}" != "$1" ]
SH
chmod +x "$work/firewall"

cat >"$work/uci" <<'SH'
#!/bin/sh
[ "$1" = '-q' ] && shift
[ "$1" = 'get' ] || exit 1
[ "$2" = 'nginx_telego.direct_https.enabled' ] || exit 1
printf '%s\n' "${FIX_DIRECT_ENABLED:-0}"
SH
chmod +x "$work/uci"

export NGINX_TELEGO_RECONCILE="$work/reconcile"
export NGINX_TELEGO_FIREWALL="$work/firewall"
export UCI_BIN="$work/uci"
export NGINX_TELEGO_TEST_LOG="$work/reconcile.log"
: >"$NGINX_TELEGO_TEST_LOG"

# shellcheck source=/dev/null
source package/nginx-telego/files/init.d/nginx-telego

triggers=''
procd_add_reload_trigger() {
	triggers="$*"
}

service_triggers
[[ "$triggers" == 'nginx_telego telego' ]]
[[ "$USE_PROCD" == 1 ]]

# Disabled/non-Direct profiles remove firewall ownership before reconciling Nginx.
export FIX_DIRECT_ENABLED=0
start_service
mapfile -t calls <"$NGINX_TELEGO_TEST_LOG"
[[ "${calls[*]}" == 'firewall apply nginx apply' ]]

# Direct HTTPS preflights WAN/443, renders Nginx, then exposes public 443.
: >"$NGINX_TELEGO_TEST_LOG"
export FIX_DIRECT_ENABLED=1
reload_service
mapfile -t calls <"$NGINX_TELEGO_TEST_LOG"
[[ "${calls[*]}" == 'firewall check nginx apply firewall apply' ]]

# A failed firewall preflight must prevent any Nginx mutation.
: >"$NGINX_TELEGO_TEST_LOG"
export FIREWALL_FAIL_ACTION=check
if start_service; then
	echo 'Direct HTTPS unexpectedly continued after firewall preflight failure' >&2
	exit 1
fi
mapfile -t calls <"$NGINX_TELEGO_TEST_LOG"
[[ "${calls[*]}" == 'firewall check' ]]
unset FIREWALL_FAIL_ACTION

stop_service
echo 'nginx-telego service trigger and firewall ordering tests passed'
