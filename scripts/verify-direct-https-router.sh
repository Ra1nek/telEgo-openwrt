#!/bin/sh
# Read-only router-side preflight for Direct HTTPS hardware acceptance.
set -u

FAIL=0
WARN=0

pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*" >&2; FAIL=$((FAIL + 1)); }
warn() { printf 'WARN  %s\n' "$*" >&2; WARN=$((WARN + 1)); }

need() {
	command -v "$1" >/dev/null 2>&1 || {
		fail "required command not found: $1"
		return 1
	}
}

field() {
	printf '%s\n' "$1" | awk -F '\t' -v k="$2" '$1 == k { print $2; exit }'
}

need uci
need grep
need awk
need netstat

direct=$(uci -q get nginx_telego.direct_https.enabled 2>/dev/null || true)
shared=$(uci -q get nginx_telego.shared.enabled 2>/dev/null || true)
cloudflare=$(uci -q get nginx_telego.cloudflare.enabled 2>/dev/null || true)

[ "$direct" = 1 ] && pass "Direct HTTPS profile enabled" || fail "nginx_telego.direct_https.enabled is not 1"
[ "${shared:-0}" != 1 ] && pass "Native Shared-Port disabled" || fail "Native Shared-Port is also enabled"
[ "${cloudflare:-0}" != 1 ] && pass "Cloudflare profile disabled" || fail "Cloudflare profile is also enabled"


service_enabled=$(uci -q get telego.general.enabled 2>/dev/null || true)
[ "$service_enabled" = 1 ] && pass "telEgo service enabled" || fail "telego.general.enabled is not 1"

mtproxy_bind=$(uci -q get telego.general.bind_to 2>/dev/null || true)
case "$mtproxy_bind" in
	*:443) fail "MTProxy listener $mtproxy_bind conflicts with Direct HTTPS TCP/443 ownership; use another MTProxy port or Native Shared-Port" ;;
	'') fail "telego.general.bind_to is missing" ;;
	*) pass "MTProxy listener uses separate port: $mtproxy_bind" ;;
esac

PLATFORM=/usr/libexec/nginx-telego-platform
FW=/usr/libexec/nginx-telego-firewall
CERT=/usr/libexec/nginx-telego-cert
NGINX=/usr/sbin/nginx
CONF=/etc/nginx/uci.conf

if [ -x "$PLATFORM" ]; then
	platform_status=$("$PLATFORM" status 2>&1) || {
		fail "platform status failed: $platform_status"
		platform_status=''
	}
	if [ -n "$platform_status" ]; then
		[ "$(field "$platform_status" uhttpd_has_443)" = 0 ] \
			&& pass "uhttpd does not own TCP/443" \
			|| fail "uhttpd still owns TCP/443"
		[ "$(field "$platform_status" pending_uhttpd)" = 0 ] \
			&& pass "no pending uhttpd UCI changes" \
			|| fail "pending uhttpd UCI changes detected"
		[ "$(field "$platform_status" pending_dhcp)" = 0 ] \
			&& pass "no pending DHCP/dnsmasq UCI changes" \
			|| fail "pending DHCP/dnsmasq UCI changes detected"
		split_state=$(field "$platform_status" split_dns_state)
		case "$split_state" in
			owned) pass "split DNS is package-owned" ;;
			external) pass "split DNS is administrator-owned" ;;
			disabled) warn "package-managed split DNS is disabled" ;;
			absent) fail "configured split-DNS entry is absent" ;;
			'') warn "split-DNS state was not reported" ;;
			*) warn "split-DNS state is $split_state" ;;
		esac
	fi
	if "$PLATFORM" preflight >/tmp/nginx-telego-platform-preflight.$$ 2>&1; then
		pass "platform preflight"
	else
		fail "platform preflight: $(cat /tmp/nginx-telego-platform-preflight.$$ 2>/dev/null)"
	fi
	rm -f /tmp/nginx-telego-platform-preflight.$$
else
	fail "$PLATFORM is missing or not executable"
fi

if [ -x "$FW" ]; then
	fw_status=$("$FW" status 2>&1) || {
		fail "firewall status failed: $fw_status"
		fw_status=''
	}
	if [ -n "$fw_status" ]; then
		[ "$(field "$fw_status" section_state)" = owned ] && pass "firewall.telego_direct_https is package-owned" || fail "managed firewall section is not owned"
		[ "$(field "$fw_status" managed_match)" = 1 ] && pass "managed WAN/443 INPUT rule matches desired state" || fail "managed WAN/443 rule drift detected"
		wan_input=$(field "$fw_status" wan_input)
		case "$wan_input" in
			accept|ACCEPT) fail "WAN input policy is ACCEPT; dedicated TCP/443 ownership is ambiguous" ;;
			'') warn "WAN input policy was not reported" ;;
			*) pass "WAN input policy is $wan_input" ;;
		esac
		foreign=$(field "$fw_status" foreign_wan443)
		if [ -z "$foreign" ]; then
			fail "firewall status did not report foreign_wan443"
		elif [ "$foreign" = "-" ]; then
			pass "no foreign WAN TCP/443 owner detected"
		else
			fail "foreign WAN TCP/443 owner detected: $foreign"
		fi
	fi
	if "$FW" preflight >/tmp/nginx-telego-fw-preflight.$$ 2>&1; then
		pass "firewall preflight"
	else
		fail "firewall preflight: $(cat /tmp/nginx-telego-fw-preflight.$$ 2>/dev/null)"
	fi
	rm -f /tmp/nginx-telego-fw-preflight.$$
else
	fail "$FW is missing or not executable"
fi

if [ -x "$CERT" ]; then
	cert_status=$("$CERT" status 2>&1) || {
		fail "certificate status failed: $cert_status"
		cert_status=''
	}
	if [ -n "$cert_status" ]; then
		[ "$(field "$cert_status" certificate_state)" = valid ] && pass "TLS certificate parses" || fail "TLS certificate is not valid"
		[ "$(field "$cert_status" key_state)" = valid ] && pass "TLS private key parses" || fail "TLS private key is not valid"
		[ "$(field "$cert_status" key_match)" = 1 ] && pass "certificate and key match" || fail "certificate/key mismatch"
		[ "$(field "$cert_status" hostname_match)" = 1 ] && pass "certificate covers configured hostname" || fail "certificate hostname mismatch"
		expiry=$(field "$cert_status" expiry_state)
		case "$expiry" in
			ok) pass "certificate expiry state is ok" ;;
			warning) warn "certificate expires within 30 days" ;;
			critical|expired|invalid) fail "certificate expiry state is $expiry" ;;
			*) warn "certificate expiry state is ${expiry:-unknown}" ;;
		esac
	fi
	if "$CERT" preflight >/tmp/nginx-telego-cert-preflight.$$ 2>&1; then
		pass "certificate preflight including nginx -t"
	else
		fail "certificate preflight: $(cat /tmp/nginx-telego-cert-preflight.$$ 2>/dev/null)"
	fi
	rm -f /tmp/nginx-telego-cert-preflight.$$
else
	fail "$CERT is missing or not executable"
fi

if [ -x "$NGINX" ] && [ -r "$CONF" ]; then
	if "$NGINX" -t -c "$CONF" >/tmp/nginx-telego-nginx-test.$$ 2>&1; then
		pass "nginx -t -c $CONF"
	else
		fail "nginx -t failed: $(cat /tmp/nginx-telego-nginx-test.$$ 2>/dev/null)"
	fi
	rm -f /tmp/nginx-telego-nginx-test.$$
else
	fail "Nginx executable or $CONF is unavailable"
fi

check_uci() {
	key=$1
	expected=$2
	actual=$(uci -q get "$key" 2>/dev/null || true)
	[ "$actual" = "$expected" ] && pass "$key=$expected" || fail "$key expected $expected, got ${actual:-<missing>}"
}

check_uci firewall.telego_direct_https.src wan
check_uci firewall.telego_direct_https.proto tcp
check_uci firewall.telego_direct_https.dest_port 443
check_uci firewall.telego_direct_https.family any
target=$(uci -q get firewall.telego_direct_https.target 2>/dev/null || true)
[ "$(printf '%s' "$target" | tr '[:upper:]' '[:lower:]')" = accept ] && pass "firewall target=ACCEPT" || fail "firewall target is ${target:-<missing>}"
check_uci firewall.telego_direct_https.enabled 1

listeners=$(netstat -lntp 2>/dev/null || true)
printf '%s\n' "$listeners" | grep -Eq '[:.]443[[:space:]].*(nginx|/nginx)' 	&& pass "Nginx is listening directly on :443" 	|| fail "Nginx :443 listener not found"

printf '%s\n' "$listeners" | grep -Eq '[:.]8080[[:space:]].*(telego|/telego)' 	&& pass "telEgo WEB is listening on :8080" 	|| warn "could not prove telEgo ownership of :8080 from netstat"

luci_port=$(uci -q get nginx_telego.direct_https.luci_https_port 2>/dev/null || echo 10443)
printf '%s\n' "$listeners" | grep -Eq "[:.]${luci_port}[[:space:]].*(uhttpd|/uhttpd)" 	&& pass "uhttpd/LuCI is listening on management :$luci_port" 	|| warn "could not prove uhttpd ownership of :$luci_port from netstat; verify from a LAN client"

# P12.7 deliberately does not own or disable uhttpd plain HTTP. If :80 is
# present, record that it survived; if an administrator disabled it separately,
# that is also valid and must not fail Direct HTTPS acceptance.
if printf '%s\n' "$listeners" | grep -Eq '[:.]80[[:space:]].*(uhttpd|/uhttpd)'; then
	pass "uhttpd/LuCI HTTP :80 is present and remains administrator-managed"
else
	warn "uhttpd/LuCI HTTP :80 is not listening; P12.7 does not manage this listener"
fi

if [ -r /etc/nginx/conf.d/80-telego-ingress.conf ]; then
	grep -q '0.0.0.0:443' /etc/nginx/conf.d/80-telego-ingress.conf \
		&& pass "generated IPv4 Direct HTTPS :443 listener is present" \
		|| fail "80-telego-ingress.conf does not contain IPv4 :443"
	grep -Fq '[::]:443' /etc/nginx/conf.d/80-telego-ingress.conf \
		&& pass "generated IPv6 Direct HTTPS :443 listener is present" \
		|| fail "80-telego-ingress.conf does not contain IPv6 :443"
	grep -Fq 'ssl_protocols TLSv1.2 TLSv1.3;' /etc/nginx/conf.d/80-telego-ingress.conf \
		&& pass "generated TLS policy is TLS 1.2 + TLS 1.3 only" \
		|| fail "generated TLS policy is not the P12.7 baseline"
	grep -Fq 'server_tokens off;' /etc/nginx/conf.d/80-telego-ingress.conf \
		&& pass "Nginx version disclosure is disabled in managed ingress" \
		|| fail "server_tokens off is missing from managed ingress"

	hsts_age=$(uci -q get nginx_telego.direct_https.hsts_max_age 2>/dev/null || echo 604800)
	grep -Fq "add_header Strict-Transport-Security \"max-age=$hsts_age\" always;" /etc/nginx/conf.d/80-telego-ingress.conf \
		&& pass "staged HSTS max-age=$hsts_age is generated" \
		|| fail "generated HSTS does not match nginx_telego.direct_https.hsts_max_age=$hsts_age"
	if grep -Eq 'Strict-Transport-Security.*(includeSubDomains|preload)' /etc/nginx/conf.d/80-telego-ingress.conf; then
		fail "managed HSTS unexpectedly enables includeSubDomains or preload"
	else
		pass "HSTS excludes includeSubDomains and preload"
	fi
	if grep -Eq 'ssl_stapling|ssl_ciphers|ssl_conf_command[[:space:]]+Ciphersuites|Content-Security-Policy|Permissions-Policy' /etc/nginx/conf.d/80-telego-ingress.conf; then
		fail "managed ingress contains a P12.7-forbidden global TLS/header override"
	else
		pass "no OCSP/manual cipher/CSP/Permissions-Policy override in managed ingress"
	fi
else
	fail "/etc/nginx/conf.d/80-telego-ingress.conf is missing"
fi

fallback_manage=$(uci -q get nginx_telego.fallback.manage 2>/dev/null || echo 1)
if [ "$fallback_manage" = 1 ]; then
	fallback=/etc/nginx/conf.d/85-telego-fallback.conf
	if [ -r "$fallback" ]; then
		grep -Fq 'return 200 "OK\n";' "$fallback" \
			&& pass "managed fallback remains 200 OK" \
			|| fail "managed fallback response changed from 200 OK"
		grep -Fq 'add_header X-Content-Type-Options "nosniff" always;' "$fallback" \
			&& pass "fallback X-Content-Type-Options header is present" \
			|| fail "fallback X-Content-Type-Options header is missing"
		grep -Fq 'add_header Referrer-Policy "no-referrer" always;' "$fallback" \
			&& pass "fallback Referrer-Policy header is present" \
			|| fail "fallback Referrer-Policy header is missing"
		grep -Fq 'add_header Cache-Control "no-store" always;' "$fallback" \
			&& pass "fallback Cache-Control header is present" \
			|| fail "fallback Cache-Control header is missing"
		if grep -Eq 'Content-Security-Policy|Permissions-Policy' "$fallback"; then
			fail "managed fallback unexpectedly contains global CSP/Permissions-Policy"
		else
			pass "fallback does not add CSP/Permissions-Policy"
		fi
	else
		fail "$fallback is missing while nginx_telego.fallback.manage=1"
	fi
else
	warn "managed fallback is disabled; fallback headers are administrator-owned"
fi

tls_hostname=$(uci -q get nginx_telego.direct_https.hostname 2>/dev/null || true)
[ -n "$tls_hostname" ] || tls_hostname=$(uci -q get telego.web_proxy.hostname 2>/dev/null || true)
if command -v openssl >/dev/null 2>&1 && [ -n "$tls_hostname" ]; then
	tls_probe() {
		flag=$1
		label=$2
		expect=$3
		out=/tmp/nginx-telego-tls-probe.$$.out
		if openssl s_client -connect 127.0.0.1:443 -servername "$tls_hostname" "$flag" </dev/null >"$out" 2>&1; then
			rc=0
		else
			rc=$?
		fi
		if [ "$expect" = pass ]; then
			[ "$rc" -eq 0 ] && pass "$label handshake accepted" || fail "$label handshake failed"
		else
			[ "$rc" -ne 0 ] && pass "$label handshake rejected" || fail "$label handshake unexpectedly accepted"
		fi
		rm -f "$out"
	}
	tls_probe -tls1 'TLS 1.0' fail
	tls_probe -tls1_1 'TLS 1.1' fail
	tls_probe -tls1_2 'TLS 1.2' pass
	tls_probe -tls1_3 'TLS 1.3' pass

	unknown_out=/tmp/nginx-telego-unknown-sni.$$.out
	if openssl s_client -connect 127.0.0.1:443 -servername invalid-sni.nginx-telego.invalid -tls1_2 </dev/null >"$unknown_out" 2>&1; then
		fail "unknown SNI TLS handshake unexpectedly accepted"
	else
		pass "unknown SNI TLS handshake rejected"
	fi
	rm -f "$unknown_out"
else
	warn "openssl or Direct HTTPS hostname unavailable; runtime TLS-version/SNI probes skipped"
fi

split_address=$(uci -q get nginx_telego.direct_https.split_dns_address 2>/dev/null || true)
if [ -n "$split_address" ]; then
	pass "split-DNS target configured: $split_address"
else
	warn "split_dns_address is empty; LAN clients may use administrator-managed DNS instead"
fi

printf '\nRouter-side result: %d failure(s), %d warning(s).\n' "$FAIL" "$WARN"
printf '%s\n' 'External LAN/WAN, HTTP response headers, LuCI WAN isolation, Telegram Desktop, reboot, ACME renewal and Cloudflare rollback tests are still required.'
[ "$FAIL" -eq 0 ]
