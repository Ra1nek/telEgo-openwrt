#!/bin/sh
# Read-only external-client verification for Direct HTTPS.
set -u

HOST=${1:-}
EXPECTED_IP=${2:-}
IP_FAMILY=${IP_FAMILY:-auto}
CURL_BIN=${CURL_BIN:-curl}
LUCI_PORT=${LUCI_PORT:-10443}
HSTS_MAX_AGE=${HSTS_MAX_AGE:-604800}

usage() {
	echo "Usage: $0 HOSTNAME [EXPECTED_WAN_IP]" >&2
	echo "Optional: IP_FAMILY=4 or IP_FAMILY=6; LUCI_PORT defaults to 10443; HSTS_MAX_AGE defaults to 604800" >&2
	exit 2
}

[ -n "$HOST" ] || usage
command -v "$CURL_BIN" >/dev/null 2>&1 || {
	echo "FAIL  curl is required" >&2
	exit 1
}

case "$IP_FAMILY" in
	4) FAMILY_FLAG='-4' ;;
	6) FAMILY_FLAG='-6' ;;
	auto) FAMILY_FLAG='' ;;
	*) echo "FAIL  IP_FAMILY must be auto, 4, or 6" >&2; exit 2 ;;
esac

FAIL=0
WARN=0
pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*" >&2; FAIL=$((FAIL + 1)); }
warn() { printf 'WARN  %s\n' "$*" >&2; WARN=$((WARN + 1)); }

tmp=${TMPDIR:-/tmp}/nginx-telego-client.$$
trap 'rm -f "$tmp.public" "$tmp.headers" "$tmp.luci"' EXIT HUP INT TERM

# A normal HTTPS request is enough to validate the certificate chain and
# hostname. The HTTP status itself is not constrained because an ordinary curl
# request may intentionally reach the configured fallback site.
if $CURL_BIN $FAMILY_FLAG --noproxy '*' --silent --show-error --http2 \
	--connect-timeout 8 --max-time 20 -o /dev/null --dump-header "$tmp.headers" \
	-w '%{remote_ip}\t%{http_code}\t%{http_version}\n' \
	"https://$HOST/" >"$tmp.public" 2>&1; then
	result=$(tail -n 1 "$tmp.public")
	remote_ip=$(printf '%s\n' "$result" | awk -F '\t' '{print $1}')
	http_code=$(printf '%s\n' "$result" | awk -F '\t' '{print $2}')
	http_version=$(printf '%s\n' "$result" | awk -F '\t' '{print $3}')

	[ -n "$remote_ip" ] && pass "public TLS reached $remote_ip (HTTP $http_code)" ||
		fail "curl did not report a remote IP"

	case "$http_version" in
		2|2.0) pass "public endpoint negotiated HTTP/2" ;;
		*) fail "public endpoint negotiated HTTP/$http_version instead of HTTP/2" ;;
	esac

	if [ -n "$EXPECTED_IP" ]; then
		[ "$remote_ip" = "$EXPECTED_IP" ] \
			&& pass "remote IP matches expected direct WAN address" \
			|| fail "remote IP $remote_ip does not match expected WAN $EXPECTED_IP"
	else
		warn "expected WAN IP not supplied; verify $remote_ip is your router WAN address and not a CDN/Tunnel endpoint"
	fi

	if grep -Eiq "^Strict-Transport-Security:[[:space:]]*max-age=${HSTS_MAX_AGE}([[:space:]]|\r)*$" "$tmp.headers"; then
		pass "HSTS max-age=$HSTS_MAX_AGE is present on the public Direct HTTPS response"
	else
		fail "HSTS header is missing or does not match expected max-age=$HSTS_MAX_AGE"
	fi
	if grep -Eiq '^Strict-Transport-Security:.*(includeSubDomains|preload)' "$tmp.headers"; then
		fail "public HSTS unexpectedly enables includeSubDomains or preload"
	else
		pass "public HSTS excludes includeSubDomains and preload"
	fi
	if grep -Eiq '^Server:[[:space:]]*nginx/[0-9]' "$tmp.headers"; then
		fail "public Server header exposes the Nginx version"
	else
		pass "public Server header does not expose an Nginx version"
	fi
else
	fail "public HTTPS/HTTP2 request failed: $(cat "$tmp.public" 2>/dev/null)"
fi

# The LuCI HTTPS management port must remain LAN-only. P12.7 intentionally
# leaves any administrator-managed LuCI plain HTTP :80 listener unchanged. Do not
# treat a TLS handshake rejection as closed: any non-zero time_connect proves
# that WAN TCP reached the management listener.
connect_time=$($CURL_BIN $FAMILY_FLAG --noproxy '*' --insecure --silent --show-error \
	--connect-timeout 5 --max-time 8 -o /dev/null -w '%{time_connect}' \
	"https://$HOST:$LUCI_PORT/" 2>"$tmp.luci")
rc=$?

case "$connect_time" in
	''|0|0.0|0.00|0.000|0.0000|0.00000|0.000000)
		if [ "$rc" -eq 0 ]; then
			fail "WAN TCP/$LUCI_PORT returned a response and exposes LuCI management"
		else
			pass "WAN TCP/$LUCI_PORT did not complete a TCP connection"
		fi
		;;
	*)
		fail "WAN TCP/$LUCI_PORT is TCP-reachable (connect time $connect_time s, curl rc=$rc)"
		;;
esac

printf '\nExternal-client result: %d failure(s), %d warning(s).\n' "$FAIL" "$WARN"
printf '%s\n' 'Telegram Desktop, LAN LuCI access (including administrator-managed :80 when retained), reboot persistence, ACME renewal, and Cloudflare rollback still require explicit checks.'
[ "$FAIL" -eq 0 ]
