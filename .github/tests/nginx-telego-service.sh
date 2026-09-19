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

cat >"$work/platform" <<'SH'
#!/bin/sh
printf 'platform %s\n' "$*" >>"$NGINX_TELEGO_TEST_LOG"
[ "${PLATFORM_FAIL_ACTION:-}" != "$1" ]
SH
chmod +x "$work/platform"

cat >"$work/nginx-init" <<'SH'
#!/bin/sh
case "$1" in
	status)
		printf 'nginx-init status\n' >>"$NGINX_TELEGO_TEST_LOG"
		[ "$(cat "$NGINX_TEST_STATE" 2>/dev/null || true)" = '1' ]
		;;
	start)
		printf 'nginx-init start\n' >>"$NGINX_TELEGO_TEST_LOG"
		[ "${NGINX_START_FAIL:-0}" != '1' ] || exit 1
		printf '1\n' >"$NGINX_TEST_STATE"
		;;
	*)
		exit 2
		;;
esac
SH
chmod +x "$work/nginx-init"

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
export NGINX_TELEGO_PLATFORM="$work/platform"
export NGINX_INIT="$work/nginx-init"
export NGINX_TEST_STATE="$work/nginx.state"
export UCI_BIN="$work/uci"
export NGINX_TELEGO_TEST_LOG="$work/reconcile.log"
printf '0\n' >"$NGINX_TEST_STATE"
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
[[ "${calls[*]}" == 'firewall apply nginx apply platform apply' ]]

# Direct HTTPS preflights platform and WAN/443, moves LuCI, renders Nginx,
# recovers Nginx if the earlier boot stage failed, then exposes public 443.
: >"$NGINX_TELEGO_TEST_LOG"
export FIX_DIRECT_ENABLED=1
reload_service
mapfile -t calls <"$NGINX_TELEGO_TEST_LOG"
[[ "${calls[*]}" == 'platform check firewall check platform apply nginx apply nginx-init status nginx-init start nginx-init status firewall apply' ]]

# An already running Nginx must not be started again.
: >"$NGINX_TELEGO_TEST_LOG"
reload_service
mapfile -t calls <"$NGINX_TELEGO_TEST_LOG"
[[ "${calls[*]}" == 'platform check firewall check platform apply nginx apply nginx-init status firewall apply' ]]

# If Nginx cannot be recovered, WAN exposure must remain closed.
: >"$NGINX_TELEGO_TEST_LOG"
printf '0\n' >"$NGINX_TEST_STATE"
export NGINX_START_FAIL=1
if start_service; then
	echo 'Direct HTTPS unexpectedly continued after nginx recovery failure' >&2
	exit 1
fi
mapfile -t calls <"$NGINX_TELEGO_TEST_LOG"
[[ "${calls[*]}" == 'platform check firewall check platform apply nginx apply nginx-init status nginx-init start' ]]
unset NGINX_START_FAIL

# A failed firewall preflight must prevent any Nginx mutation.
: >"$NGINX_TELEGO_TEST_LOG"
export FIREWALL_FAIL_ACTION=check
if start_service; then
	echo 'Direct HTTPS unexpectedly continued after firewall preflight failure' >&2
	exit 1
fi
mapfile -t calls <"$NGINX_TELEGO_TEST_LOG"
[[ "${calls[*]}" == 'platform check firewall check' ]]
unset FIREWALL_FAIL_ACTION

# Platform preflight failure must stop before firewall/Nginx changes.
: >"$NGINX_TELEGO_TEST_LOG"
export PLATFORM_FAIL_ACTION=check
if start_service; then
	echo 'Direct HTTPS unexpectedly continued after platform preflight failure' >&2
	exit 1
fi
mapfile -t calls <"$NGINX_TELEGO_TEST_LOG"
[[ "${calls[*]}" == 'platform check' ]]
unset PLATFORM_FAIL_ACTION

stop_service
echo 'nginx-telego service trigger, nginx recovery and firewall ordering tests passed'
