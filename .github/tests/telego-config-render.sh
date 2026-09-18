#!/bin/sh
# Exercise UCI -> TOML mappings that are easy to regress in LuCI/OpenWrt glue.
set -eu
. package/telego-pkg/files/init.d/telego

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM
RUNTIME_CONFIG="$tmp/telego.toml"
CF_ENABLED=0
SHARED_ENABLED=0
DIRECT_ENABLED=0

# generate_config() uses OpenWrt helpers plus the uci CLI. Provide a focused
# fixture instead of parsing TOML by inspection in this test.
config_load() { :; }
config_list_foreach() {
	section=$1
	option=$2
	callback=$3
	case "$section.$option" in
		tls_fronting.mask_sni_safelist) "$callback" 'www.example.net' ;;
		web_proxy.trusted_proxy_cidrs) "$callback" '127.0.0.1/32' ;;
	esac
}
config_foreach() {
	callback=$1
	type=$2
	[ "$type" = secret ] && "$callback" default
}
chown() { :; }
mkdir() {
	[ "$#" -eq 2 ] && [ "$1" = -p ] && [ "$2" = /var/etc ] && return 0
	command mkdir "$@"
}

uci() {
	[ "${1:-}" = -q ] && shift
	[ "${1:-}" = get ] || return 1
	case "${2:-}" in
		nginx_telego.cloudflare.enabled) printf '%s\n' "$CF_ENABLED" ;;
		nginx_telego.shared.enabled) printf '%s\n' "$SHARED_ENABLED" ;;
		nginx_telego.direct_https.enabled) printf '%s\n' "$DIRECT_ENABLED" ;;

		telego.general.bind_to) printf '%s\n' '0.0.0.0:443' ;;
		telego.general.log_level) printf '%s\n' 'info' ;;
		telego.general.proxy_protocol) printf '%s\n' '0' ;;
		telego.general.max_connections_per_ip) printf '%s\n' '100' ;;
		telego.general.max_ips_per_user) printf '%s\n' '10' ;;
		telego.general.ip_block_timeout) printf '%s\n' '5m' ;;
		telego.general.handshake_timeout) printf '%s\n' '5s' ;;
		telego.general.clock_sync_url) printf '%s\n' 'https://time.example.net' ;;

		telego.tls_fronting.mask_host) printf '%s\n' 'proxy.example.com' ;;
		telego.tls_fronting.mask_port) printf '%s\n' '443' ;;
		telego.tls_fronting.cert_host) printf '%s\n' '127.0.0.1' ;;
		telego.tls_fronting.cert_port) printf '%s\n' '8444' ;;
		telego.tls_fronting.fake_cert_size) printf '%s\n' '1024' ;;
		telego.tls_fronting.splice_host) printf '%s\n' '127.0.0.1' ;;
		telego.tls_fronting.splice_port) printf '%s\n' '8443' ;;
		telego.tls_fronting.splice_proxy_protocol) printf '%s\n' '2' ;;
		telego.tls_fronting.splice_idle_timeout) printf '%s\n' '30s' ;;
		telego.tls_fronting.enable_drs) printf '%s\n' '1' ;;
		telego.tls_fronting.enable_split_tls) printf '%s\n' '1' ;;

		telego.performance.tcp_buffer_kb) printf '%s\n' '128' ;;
		telego.performance.num_event_loops) printf '%s\n' '0' ;;
		telego.performance.prefer_ip) printf '%s\n' 'prefer-ipv4' ;;
		telego.performance.idle_timeout) printf '%s\n' '5m' ;;
		telego.performance.max_write_buffer_mb) printf '%s\n' '0' ;;
		telego.performance.client_silence_close) printf '%s\n' '0s' ;;
		telego.upstream.socks5) printf '%s\n' '' ;;
		telego.metrics.bind_to) printf '%s\n' '127.0.0.1:9090' ;;
		telego.metrics.path) printf '%s\n' '/metrics' ;;
		telego.metrics.diagnostics) printf '%s\n' '1' ;;

		telego.web_proxy.enabled) printf '%s\n' '1' ;;
		telego.web_proxy.carrier) printf '%s\n' 'https-lanes' ;;
		telego.web_proxy.bind_to) printf '%s\n' '127.0.0.1:8080' ;;
		telego.web_proxy.hostname) printf '%s\n' 'proxy.example.com' ;;
		telego.web_proxy.backend) printf '%s\n' '127.0.0.1:9443' ;;
		telego.web_proxy.num_event_loops) printf '%s\n' '2' ;;

		telego.middle_end.enabled) printf '%s\n' '1' ;;
		telego.middle_end.proxy_tag) printf '%s\n' '0123456789abcdef0123456789abcdef' ;;
		telego.middle_end.socks5) printf '%s\n' '127.0.0.1:1080' ;;
		telego.middle_end.socks5_username) printf '%s\n' 'me-user' ;;
		telego.middle_end.socks5_password) printf '%s\n' 'me-pass' ;;
		telego.middle_end.artifact_proxy) printf '%s\n' 'http://127.0.0.1:3128' ;;
		telego.middle_end.nat_ip) printf '%s\n' '203.0.113.10' ;;
		telego.middle_end.max_connections) printf '%s\n' '5000' ;;
		telego.middle_end.queue_budget_mb) printf '%s\n' '16' ;;

		telego.default.name) printf '%s\n' 'default' ;;
		telego.default.secret) printf '%s\n' '0123456789abcdef0123456789abcdef' ;;
		*) return 1 ;;
	esac
}

assert_shared_tls_runtime() {
	grep -Fqx 'cert-host = "127.0.0.1"' "$RUNTIME_CONFIG"
	grep -Fqx 'cert-port = 8444' "$RUNTIME_CONFIG"
	grep -Fqx 'splice-host = "127.0.0.1"' "$RUNTIME_CONFIG"
	grep -Fqx 'splice-port = 8443' "$RUNTIME_CONFIG"
}

assert_external_tls_runtime() {
	grep -Fqx 'mask-host = "proxy.example.com"' "$RUNTIME_CONFIG"
	! grep -Fq 'cert-host =' "$RUNTIME_CONFIG"
	! grep -Fq 'cert-port =' "$RUNTIME_CONFIG"
	! grep -Fq 'splice-host =' "$RUNTIME_CONFIG"
	! grep -Fq 'splice-port =' "$RUNTIME_CONFIG"
}

# Generic/advanced TLS-fronting behavior remains backwards compatible.
generate_config

test -s "$RUNTIME_CONFIG"
assert_shared_tls_runtime
grep -Fqx 'splice-proxy-protocol = 2' "$RUNTIME_CONFIG"

awk '/^\[web-proxy\]$/{on=1;next} /^\[/{on=0} on' "$RUNTIME_CONFIG" >"$tmp/web"
grep -Fqx 'enabled = true' "$tmp/web"
grep -Fqx 'backend = "127.0.0.1:9443"' "$tmp/web"
grep -Fqx 'num-event-loops = 2' "$tmp/web"
grep -Fqx 'trusted-proxy-cidrs = ["127.0.0.1/32"]' "$tmp/web"

awk '/^\[middle-end\]$/{on=1;next} /^\[/{on=0} on' "$RUNTIME_CONFIG" >"$tmp/middle-end"
grep -Fqx 'enabled = true' "$tmp/middle-end"
grep -Fqx 'proxy-tag = "0123456789abcdef0123456789abcdef"' "$tmp/middle-end"
grep -Fqx 'socks5 = "127.0.0.1:1080"' "$tmp/middle-end"
grep -Fqx 'socks5-username = "me-user"' "$tmp/middle-end"
grep -Fqx 'socks5-password = "me-pass"' "$tmp/middle-end"
grep -Fqx 'artifact-proxy = "http://127.0.0.1:3128"' "$tmp/middle-end"
grep -Fqx 'nat-ip = "203.0.113.10"' "$tmp/middle-end"
grep -Fqx 'max-connections = 5000' "$tmp/middle-end"
grep -Fqx 'queue-budget-mb = 16' "$tmp/middle-end"

# Cloudflare owns public WEB TLS. Stale Native Shared-Port endpoints may remain
# stored in UCI, but they must not enter the active telEgo runtime configuration.
CF_ENABLED=1
SHARED_ENABLED=0
DIRECT_ENABLED=0
generate_config
assert_external_tls_runtime

# Direct HTTPS is another externally terminated WEB TLS profile. It must keep
# the same Native Shared-Port fields out of the active runtime TOML.
CF_ENABLED=0
DIRECT_ENABLED=1
generate_config
assert_external_tls_runtime

# Invalid cross-package state is rejected instead of guessing which profile wins.
CF_ENABLED=1
if generate_config >/dev/null 2>&1; then
	echo 'mutually exclusive managed WEB profiles were unexpectedly accepted' >&2
	exit 1
fi

# Switching back to Native Shared-Port restores the preserved advanced values.
CF_ENABLED=0
DIRECT_ENABLED=0
SHARED_ENABLED=1
generate_config
assert_shared_tls_runtime

echo 'telEgo UCI to TOML render tests passed'
