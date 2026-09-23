#!/bin/sh
# P6.8 read-only acceptance verifier for an installed/booted OpenWrt router.
# It does not commit UCI, apply configuration, reload, restart or stop services.
set -u

FAIL=0
WARN=0
PASS=0
TMP_BASE="/tmp/telego-p6-acceptance.$$"

cleanup() {
	rm -f "$TMP_BASE".*
}
trap cleanup EXIT HUP INT TERM

pass() {
	PASS=$((PASS + 1))
	printf 'PASS: %s\n' "$*"
}

warn() {
	WARN=$((WARN + 1))
	printf 'WARN: %s\n' "$*" >&2
}

fail() {
	FAIL=$((FAIL + 1))
	printf 'FAIL: %s\n' "$*" >&2
}

check_file() {
	path=$1
	if [ -s "$path" ]; then
		pass "installed asset: $path"
	else
		fail "missing installed asset: $path"
	fi
}

check_exec() {
	path=$1
	if [ -x "$path" ]; then
		pass "installed executable: $path"
	else
		fail "missing executable: $path"
	fi
}

json_true() {
	file=$1
	key=$2
	grep -Eq "\"$key\"[[:space:]]*:[[:space:]]*true" "$file"
}

fingerprint() {
	path=$1
	if [ -L "$path" ]; then
		target=$(readlink "$path" 2>/dev/null) || return 1
		printf 'symlink:%s\n' "$target"
	elif [ -f "$path" ]; then
		if command -v sha256sum >/dev/null 2>&1; then
			sha256sum "$path" | awk '{print "file:" $1}'
		elif busybox sha256sum "$path" >/dev/null 2>&1; then
			busybox sha256sum "$path" | awk '{print "file:" $1}'
		else
			return 1
		fi
	elif [ -e "$path" ]; then
		printf 'other\n'
	else
		printf 'absent\n'
	fi
}

enabled() {
	case "$1" in
		1|true|yes|on) return 0 ;;
		*) return 1 ;;
	esac
}

printf '%s\n' 'telEgo P6.8 Full Router / Mobile / Accessibility Acceptance'
printf '%s\n' 'Read-only verifier: no UCI commit/apply and no service reload/restart.'

if [ -r /etc/openwrt_release ]; then
	release=$(sed -n "s/^DISTRIB_RELEASE=['\"]\{0,1\}\([^'\"]*\).*$/\1/p" /etc/openwrt_release | head -n1)
	case "$release" in
		25.12.*) pass "supported OpenWrt release: $release" ;;
		'') warn 'could not parse OpenWrt release' ;;
		*) fail "unsupported OpenWrt release for this acceptance gate: $release" ;;
	esac
else
	fail '/etc/openwrt_release is unavailable'
fi

for package in telego-pkg nginx-telego luci-app-telego luci-i18n-telego-ru; do
	if apk info -e "$package" >/dev/null 2>&1; then
		version=$(apk info -e -v "$package" 2>/dev/null | head -n1)
		pass "installed package: $version"
	else
		fail "package is not installed: $package"
	fi
done

for path in \
	/www/luci-static/resources/view/telego/app-shell.js \
	/www/luci-static/resources/view/telego/ui-foundation.js \
	/www/luci-static/resources/view/telego/config.js \
	/www/luci-static/resources/view/telego/ingress.js \
	/www/luci-static/resources/view/telego/ingress-wizard.js \
	/www/luci-static/resources/view/telego/advanced.js \
	/www/luci-static/resources/view/telego/nginx-files.js \
	/www/luci-static/resources/css/telego.css \
	/usr/share/luci/menu.d/telego.menu.json \
	/usr/share/rpcd/acl.d/luci-app-telego.json; do
	check_file "$path"
done

for path in \
	/usr/share/rpcd/ucode/telego \
	/usr/share/rpcd/ucode/telego-ui \
	/usr/share/rpcd/ucode/telego-nginx \
	/usr/libexec/telego-ui-lifecycle \
	/usr/libexec/nginx-telego-render \
	/usr/libexec/nginx-telego-reconcile; do
	check_exec "$path"
done

css=/www/luci-static/resources/css/telego.css
if [ -r "$css" ]; then
	grep -Eq '\.telego-app[[:space:]]+\.cbi-button' "$css" &&
		pass 'all telEgo LuCI buttons inherit the 44px touch-target contract' ||
		fail 'global telEgo CBI button touch-target contract is missing'
	grep -Fq '@media screen and (max-width: 640px)' "$css" &&
		pass 'mobile 640px breakpoint is installed' ||
		fail 'mobile 640px breakpoint is missing'
	grep -Fq '@media screen and (max-width: 420px)' "$css" &&
		pass 'narrow mobile 420px breakpoint is installed' ||
		fail 'mobile 420px breakpoint is missing'
	grep -Fq '@media (prefers-reduced-motion: reduce)' "$css" &&
		pass 'reduced-motion accessibility contract is installed' ||
		fail 'reduced-motion accessibility contract is missing'
	grep -Fq '@media (forced-colors: active)' "$css" &&
		pass 'forced-colors accessibility contract is installed' ||
		fail 'forced-colors accessibility contract is missing'
	grep -Fq 'overflow-wrap: anywhere' "$css" &&
		pass 'narrow-screen long-text overflow protection is installed' ||
		fail 'long-text overflow protection is missing'
fi

wizard=/www/luci-static/resources/view/telego/ingress-wizard.js
if [ -r "$wizard" ]; then
	grep -Fq "'require baseclass';" "$wizard" &&
		grep -Fq 'return baseclass.extend({' "$wizard" &&
		pass 'Ingress Wizard uses the real LuCI constructor contract' ||
		fail 'Ingress Wizard LuCI constructor contract is missing'
fi

acl=/usr/share/rpcd/acl.d/luci-app-telego.json
if [ -r "$acl" ]; then
	grep -Fq '"candidate_nginx_validate"' "$acl" &&
		grep -Fq '"apply_preflight"' "$acl" &&
		pass 'P6.6/P6.7 read-only RPC methods are present in ACL' ||
		fail 'P6.6/P6.7 RPC ACL entries are missing'
fi

if ! command -v ubus >/dev/null 2>&1; then
	fail 'ubus is unavailable; this is not a booted OpenWrt runtime'
else
	if ubus call telego.ui capabilities >"$TMP_BASE.capabilities" 2>"$TMP_BASE.capabilities.err"; then
		for feature in serviceLifecycle ingressWizard candidateIngressPreflight candidateNginxValidation; do
			if json_true "$TMP_BASE.capabilities" "$feature"; then
				pass "runtime capability: $feature"
			else
				fail "runtime capability is not advertised: $feature"
			fi
		done
	else
		fail 'telego.ui capabilities RPC is unavailable'
		cat "$TMP_BASE.capabilities.err" >&2 2>/dev/null || true
	fi

	if ubus -v list telego.nginx >"$TMP_BASE.nginx-methods" 2>"$TMP_BASE.nginx-methods.err"; then
		for method in candidate_nginx_validate apply_preflight platform_preflight firewall_preflight certificate_preflight; do
			if grep -Fq "$method" "$TMP_BASE.nginx-methods"; then
				pass "runtime telego.nginx method: $method"
			else
				fail "runtime telego.nginx method is missing: $method"
			fi
		done
	else
		fail 'telego.nginx RPC object is unavailable'
	fi

	if before_ingress=$(fingerprint /etc/nginx/conf.d/80-telego-ingress.conf) &&
	   before_fallback=$(fingerprint /etc/nginx/conf.d/85-telego-fallback.conf) &&
	   before_core=$(fingerprint /etc/nginx/conf.d/20-telego-core.conf) &&
	   before_locations=$(fingerprint /etc/nginx/snippets/telego.locations); then
		fingerprints_ready=1
	else
		fingerprints_ready=0
		fail 'could not fingerprint active Nginx files before candidate validation'
	fi

	if ubus call telego.nginx candidate_nginx_validate >"$TMP_BASE.candidate" 2>"$TMP_BASE.candidate.err" &&
	   grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' "$TMP_BASE.candidate"; then
		pass 'P6.7 candidate Nginx validation succeeds on the installed router'
	else
		fail 'P6.7 candidate Nginx validation failed'
		cat "$TMP_BASE.candidate" >&2 2>/dev/null || true
		cat "$TMP_BASE.candidate.err" >&2 2>/dev/null || true
	fi

	if after_ingress=$(fingerprint /etc/nginx/conf.d/80-telego-ingress.conf) &&
	   after_fallback=$(fingerprint /etc/nginx/conf.d/85-telego-fallback.conf) &&
	   after_core=$(fingerprint /etc/nginx/conf.d/20-telego-core.conf) &&
	   after_locations=$(fingerprint /etc/nginx/snippets/telego.locations); then
		after_fingerprints_ready=1
	else
		after_fingerprints_ready=0
		fail 'could not fingerprint active Nginx files after candidate validation'
	fi

	if [ "$fingerprints_ready" -eq 1 ] && [ "$after_fingerprints_ready" -eq 1 ]; then
		if [ "$before_ingress" = "$after_ingress" ] &&
		   [ "$before_fallback" = "$after_fallback" ] &&
		   [ "$before_core" = "$after_core" ] &&
		   [ "$before_locations" = "$after_locations" ]; then
			pass 'candidate validation left active Nginx files unchanged'
		else
			fail 'candidate validation changed active Nginx files'
		fi
	fi

	direct=$(uci -q get nginx_telego.direct_https.enabled 2>/dev/null || printf '0')
	cloudflare=$(uci -q get nginx_telego.cloudflare.enabled 2>/dev/null || printf '0')
	shared=$(uci -q get nginx_telego.shared.enabled 2>/dev/null || printf '0')
	profiles=0
	enabled "$direct" && profiles=$((profiles + 1))
	enabled "$cloudflare" && profiles=$((profiles + 1))
	enabled "$shared" && profiles=$((profiles + 1))

	if [ "$profiles" -gt 1 ]; then
		fail 'multiple managed ingress profiles are enabled'
	elif [ "$profiles" -eq 1 ]; then
		if ubus call telego.nginx apply_preflight >"$TMP_BASE.preflight" 2>"$TMP_BASE.preflight.err" &&
		   grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' "$TMP_BASE.preflight" &&
		   grep -Eq '"ready"[[:space:]]*:[[:space:]]*true' "$TMP_BASE.preflight"; then
			pass 'P6.6 Apply Preflight reports the current managed profile ready'
		else
			fail 'P6.6 Apply Preflight rejected the current managed profile'
			cat "$TMP_BASE.preflight" >&2 2>/dev/null || true
			cat "$TMP_BASE.preflight.err" >&2 2>/dev/null || true
		fi
	else
		warn 'managed ingress is disabled; Apply Preflight profile-ready assertion skipped'
	fi

	if ubus call telego.admin service_status >"$TMP_BASE.service" 2>"$TMP_BASE.service.err" &&
	   grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' "$TMP_BASE.service"; then
		pass 'P6.4 service lifecycle status RPC is readable'
	else
		fail 'service lifecycle status RPC is unavailable'
	fi
fi

printf '\nP6.8 router result: %d pass, %d warning(s), %d failure(s).\n' "$PASS" "$WARN" "$FAIL"
printf '%s\n' 'Mobile/browser visual checks still require opening LuCI at desktop and phone widths; this verifier proves the installed responsive/a11y contracts and router-side P6 APIs without mutation.'
[ "$FAIL" -eq 0 ]
