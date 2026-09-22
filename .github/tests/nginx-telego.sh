#!/bin/bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
RENDER="$ROOT/package/nginx-telego/files/usr/libexec/nginx-telego-render"
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$work/nginx-source/conf.d" "$work/nginx-source/snippets" "$work/templates"

cat >"$work/uci" <<'SH'
#!/bin/sh
[ "$1" = '-q' ] && shift
[ "$1" = 'get' ] || exit 1
case "$2" in
  nginx_telego.shared.enabled) printf '%s\n' "${FIX_SHARED_ENABLED:-0}" ;;
  nginx_telego.shared.hostname) printf '%s\n' "${FIX_SHARED_HOSTNAME:-}" ;;
  nginx_telego.shared.certificate) printf '%s\n' "${FIX_CERT:-}" ;;
  nginx_telego.shared.certificate_key) printf '%s\n' "${FIX_KEY:-}" ;;
  nginx_telego.cloudflare.enabled) printf '%s\n' "${FIX_CF_ENABLED:-0}" ;;
  nginx_telego.cloudflare.hostname) printf '%s\n' "${FIX_CF_HOSTNAME:-}" ;;
  nginx_telego.direct_https.enabled) printf '%s\n' "${FIX_DIRECT_ENABLED:-0}" ;;
  nginx_telego.direct_https.hostname) printf '%s\n' "${FIX_DIRECT_HOSTNAME:-}" ;;
  nginx_telego.direct_https.certificate) printf '%s\n' "${FIX_DIRECT_CERT:-}" ;;
  nginx_telego.direct_https.certificate_key) printf '%s\n' "${FIX_DIRECT_KEY:-}" ;;
  nginx_telego.direct_https.hsts_max_age) printf '%s\n' "${FIX_HSTS_MAX_AGE:-604800}" ;;
  nginx_telego.fallback.manage) printf '%s\n' "${FIX_FALLBACK_MANAGE:-1}" ;;
  telego.general.enabled) printf '%s\n' "${FIX_GENERAL_ENABLED:-1}" ;;
  telego.general.bind_to) printf '%s\n' "${FIX_PUBLIC_BIND:-0.0.0.0:443}" ;;
  telego.web_proxy.enabled) printf '%s\n' "${FIX_WEB_ENABLED:-1}" ;;
  telego.web_proxy.hostname) printf '%s\n' "${FIX_WEB_HOSTNAME:-web.example.com}" ;;
  telego.web_proxy.bind_to) printf '%s\n' "${FIX_WEB_BIND:-127.0.0.1:8080}" ;;
  telego.web_proxy.trusted_proxy_cidrs) printf '%s\n' "${FIX_TRUSTED:-127.0.0.1/32}" ;;
  telego.tls_fronting.enabled) printf '%s\n' "${FIX_TLS_ENABLED:-1}" ;;
  telego.tls_fronting.mask_host) printf '%s\n' "${FIX_MASK_HOST:-proxy.example.com}" ;;
  telego.tls_fronting.cert_host) printf '%s\n' "${FIX_CERT_HOST:-127.0.0.1}" ;;
  telego.tls_fronting.cert_port) printf '%s\n' "${FIX_CERT_PORT:-8444}" ;;
  telego.tls_fronting.splice_host) printf '%s\n' "${FIX_SPLICE_HOST:-127.0.0.1}" ;;
  telego.tls_fronting.splice_port) printf '%s\n' "${FIX_SPLICE_PORT:-8443}" ;;
  telego.tls_fronting.splice_proxy_protocol) printf '%s\n' "${FIX_SPLICE_PROXY:-2}" ;;
  *) exit 1 ;;
esac
SH
chmod +x "$work/uci"

cat >"$work/nginx" <<'SH'
#!/bin/sh
printf '%s\n' "$*" >>"$NGINX_LOG"

if [ "${EXPECT_CANDIDATE_VALIDATION:-0}" = 1 ]; then
    prefix=''
    conf=''
    while [ "$#" -gt 0 ]; do
        case "$1" in
            -p) prefix=$2; shift 2 ;;
            -c) conf=$2; shift 2 ;;
            *) shift ;;
        esac
    done

    [ -n "$prefix" ] && [ -n "$conf" ] || exit 31
    [ "$conf" != "$NGINX_CONF" ] || exit 32
    candidate_root=${prefix%/}
    [ -f "$candidate_root/conf.d/20-telego-core.conf" ] || exit 33
    [ -f "$candidate_root/conf.d/80-telego-ingress.conf" ] || exit 34
    [ -f "$candidate_root/conf.d/85-telego-fallback.conf" ] || exit 35
    [ -f "$candidate_root/snippets/telego.locations" ] || exit 36
    grep -Fq 'upstream telego_web' "$candidate_root/conf.d/20-telego-core.conf" || exit 37
    grep -Fq 'proxy_pass http://telego_web;' "$candidate_root/snippets/telego.locations" || exit 38
    grep -Fq 'server_name web.example.com;' "$candidate_root/conf.d/80-telego-ingress.conf" || exit 39
    ! grep -Fq 'active-drift-core' "$candidate_root/conf.d/20-telego-core.conf" || exit 40
    if [ "${EXPECT_FOREIGN_FALLBACK:-0}" = 1 ]; then
        grep -Fq '# foreign-fallback-preserved' "$candidate_root/conf.d/85-telego-fallback.conf" || exit 41
    fi
fi

[ "${NGINX_TEST_FAIL:-0}" != 1 ]
SH
chmod +x "$work/nginx"

cat >"$work/nginx-init" <<'SH'
#!/bin/sh
case "$1" in
  status) exit 0 ;;
  reload) printf 'reload\n' >>"$NGINX_RELOAD_LOG" ;;
  *) exit 0 ;;
esac
SH
chmod +x "$work/nginx-init"

cat >"$work/nginx-source/uci.conf" <<'NGINX'
events {}
http {
    include conf.d/*.conf;
}
NGINX

cp "$ROOT/package/nginx-telego/files/conf.d/20-telego-core.conf" "$work/templates/20-telego-core.conf"
cp "$ROOT/package/nginx-telego/files/telego.locations" "$work/templates/telego.locations"
printf '%s\n' '# active-drift-core' >"$work/nginx-source/conf.d/20-telego-core.conf"
printf '%s\n' '# active-drift-locations' >"$work/nginx-source/snippets/telego.locations"
: >"$work/nginx-uci"
cat >"$work/fullchain.pem" <<'PEM'
-----BEGIN CERTIFICATE-----
test-certificate-body
-----END CERTIFICATE-----
PEM
cat >"$work/privkey.pem" <<'PEM'
-----BEGIN PRIVATE KEY-----
test-private-key-body
-----END PRIVATE KEY-----
PEM

export UCI_BIN="$work/uci" NGINX_BIN="$work/nginx" NGINX_CONF="$work/nginx-source/uci.conf"
export NGINX_INIT="$work/nginx-init" NGINX_UCI_CONFIG="$work/nginx-uci"
export NGINX_TELEGO_NGINX_ROOT_DIR="$work/nginx-source"
export NGINX_TELEGO_CONF_DIR="$work/nginx-source/conf.d"
export NGINX_TELEGO_SNIPPET_DIR="$work/nginx-source/snippets"
export NGINX_TELEGO_CORE_ACTIVE="$work/nginx-source/conf.d/20-telego-core.conf"
export NGINX_TELEGO_LOCATIONS_ACTIVE="$work/nginx-source/snippets/telego.locations"
export NGINX_TELEGO_CORE_SOURCE="$work/templates/20-telego-core.conf"
export NGINX_TELEGO_LOCATIONS_SOURCE="$work/templates/telego.locations"
export NGINX_TELEGO_INGRESS_OUTPUT="$work/nginx-source/conf.d/80-telego-ingress.conf"
export NGINX_TELEGO_FALLBACK_OUTPUT="$work/nginx-source/conf.d/85-telego-fallback.conf"
export NGINX_LOG="$work/nginx.log" NGINX_RELOAD_LOG="$work/reload.log"
export FIX_CERT="$work/fullchain.pem" FIX_KEY="$work/privkey.pem"
export FIX_DIRECT_CERT="$work/fullchain.pem" FIX_DIRECT_KEY="$work/privkey.pem"
: >"$NGINX_LOG"
: >"$NGINX_RELOAD_LOG"

MARKER='# Generated by /usr/libexec/nginx-telego-render from /etc/config/nginx_telego.'
INGRESS_ROLE='# nginx-telego-role: ingress'
FALLBACK_ROLE='# nginx-telego-role: fallback'
OLD_INGRESS_ROLE='# Role: ingress. Do not edit this file directly.'

# Disabled profiles create no generated state.
FIX_SHARED_ENABLED=0 FIX_CF_ENABLED=0 "$RENDER" apply
! test -e "$NGINX_TELEGO_INGRESS_OUTPUT"
! test -e "$NGINX_TELEGO_FALLBACK_OUTPUT"

# Cloudflare creates separate role-owned files and repeat is no-op.
export FIX_CF_ENABLED=1 FIX_CF_HOSTNAME=web.example.com FIX_SHARED_ENABLED=0
export FIX_WEB_HOSTNAME=web.example.com FIX_WEB_ENABLED=1 FIX_FALLBACK_MANAGE=1
"$RENDER" apply
grep -Fqx "$MARKER" "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -Fqx "$INGRESS_ROLE" "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -Fqx "$FALLBACK_ROLE" "$NGINX_TELEGO_FALLBACK_OUTPUT"
grep -q 'listen 127.0.0.1:18080;' "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -q 'listen 127.0.0.1:8090;' "$NGINX_TELEGO_FALLBACK_OUTPUT"
grep -Fq 'server_tokens off;' "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -Fq 'server_tokens off;' "$NGINX_TELEGO_FALLBACK_OUTPUT"
grep -Fq 'add_header X-Content-Type-Options "nosniff" always;' "$NGINX_TELEGO_FALLBACK_OUTPUT"
grep -Fq 'add_header Referrer-Policy "no-referrer" always;' "$NGINX_TELEGO_FALLBACK_OUTPUT"
grep -Fq 'add_header Cache-Control "no-store" always;' "$NGINX_TELEGO_FALLBACK_OUTPUT"
grep -Fq 'return 200 "OK\n";' "$NGINX_TELEGO_FALLBACK_OUTPUT"
! grep -Fq 'Content-Security-Policy' "$NGINX_TELEGO_INGRESS_OUTPUT"
! grep -Fq 'Permissions-Policy' "$NGINX_TELEGO_INGRESS_OUTPUT"

# P6.6 candidate check is strictly read-only: it validates the pending UCI
# contract and candidate rendering without replacing files or touching nginx.
cp "$NGINX_TELEGO_INGRESS_OUTPUT" "$work/before-check-ingress"
cp "$NGINX_TELEGO_FALLBACK_OUTPUT" "$work/before-check-fallback"
nginx_calls=$(wc -l <"$NGINX_LOG")
reloads=$(wc -l <"$NGINX_RELOAD_LOG")
"$RENDER" check --no-reload >"$work/check.out"
grep -q 'candidate render preflight passed for cloudflare' "$work/check.out"
cmp "$work/before-check-ingress" "$NGINX_TELEGO_INGRESS_OUTPUT"
cmp "$work/before-check-fallback" "$NGINX_TELEGO_FALLBACK_OUTPUT"
[[ $(wc -l <"$NGINX_LOG") == "$nginx_calls" ]]
[[ $(wc -l <"$NGINX_RELOAD_LOG") == "$reloads" ]]

# P6.7 validates the rendered candidate against a temporary Nginx tree.
# The active generated files, drifted package-owned files and service state
# remain untouched while nginx -t receives the candidate root/config.
export EXPECT_CANDIDATE_VALIDATION=1
nginx_calls=$(wc -l <"$NGINX_LOG")
reloads=$(wc -l <"$NGINX_RELOAD_LOG")
"$RENDER" validate --no-reload >"$work/validate.out"
grep -q 'candidate Nginx validation passed for cloudflare' "$work/validate.out"
cmp "$work/before-check-ingress" "$NGINX_TELEGO_INGRESS_OUTPUT"
cmp "$work/before-check-fallback" "$NGINX_TELEGO_FALLBACK_OUTPUT"
grep -Fqx '# active-drift-core' "$NGINX_TELEGO_CORE_ACTIVE"
grep -Fqx '# active-drift-locations' "$NGINX_TELEGO_LOCATIONS_ACTIVE"
[[ $(wc -l <"$NGINX_LOG") == $((nginx_calls + 1)) ]]
[[ $(wc -l <"$NGINX_RELOAD_LOG") == "$reloads" ]]
tail -n 1 "$NGINX_LOG" | grep -Eq -- '-t -p .*/nginx-root/ -c .*/nginx-root/uci\.conf'
unset EXPECT_CANDIDATE_VALIDATION

export EXPECT_CANDIDATE_VALIDATION=1 NGINX_TEST_FAIL=1
if "$RENDER" validate --no-reload >"$work/validate-fail.out" 2>&1; then
    echo 'candidate validation unexpectedly accepted nginx -t failure' >&2
    exit 1
fi
grep -q 'candidate Nginx validation failed for cloudflare' "$work/validate-fail.out"
cmp "$work/before-check-ingress" "$NGINX_TELEGO_INGRESS_OUTPUT"
cmp "$work/before-check-fallback" "$NGINX_TELEGO_FALLBACK_OUTPUT"
unset EXPECT_CANDIDATE_VALIDATION NGINX_TEST_FAIL

# If a generated target is foreign and the desired state does not manage it,
# Apply preserves it; the validation tree must preserve the same file.
cp "$NGINX_TELEGO_FALLBACK_OUTPUT" "$work/managed-fallback.before-foreign"
printf '%s\n' '# foreign-fallback-preserved' 'server { listen 127.0.0.1:18081; }' >"$NGINX_TELEGO_FALLBACK_OUTPUT"
export FIX_FALLBACK_MANAGE=0 EXPECT_CANDIDATE_VALIDATION=1 EXPECT_FOREIGN_FALLBACK=1
"$RENDER" validate --no-reload >"$work/validate-foreign-preserved.out"
grep -q 'candidate Nginx validation passed for cloudflare' "$work/validate-foreign-preserved.out"
grep -Fq '# foreign-fallback-preserved' "$NGINX_TELEGO_FALLBACK_OUTPUT"
cp "$work/managed-fallback.before-foreign" "$NGINX_TELEGO_FALLBACK_OUTPUT"
export FIX_FALLBACK_MANAGE=1
unset EXPECT_CANDIDATE_VALIDATION EXPECT_FOREIGN_FALLBACK

# Reconcile refuses package-owned symlink/non-regular active paths, so P6.7
# must fail closed instead of validating an impossible post-apply state.
cp "$NGINX_TELEGO_CORE_ACTIVE" "$work/active-core.before-unsafe"
rm -f "$NGINX_TELEGO_CORE_ACTIVE"
ln -s "$work/active-core.before-unsafe" "$NGINX_TELEGO_CORE_ACTIVE"
nginx_calls=$(wc -l <"$NGINX_LOG")
if "$RENDER" validate --no-reload >"$work/validate-unsafe-core.out" 2>&1; then
    echo 'candidate validation unexpectedly accepted unsafe active core path' >&2
    exit 1
fi
grep -q 'active core path is unsafe and cannot be reconciled' "$work/validate-unsafe-core.out"
[[ $(wc -l <"$NGINX_LOG") == "$nginx_calls" ]]
rm -f "$NGINX_TELEGO_CORE_ACTIVE"
cp "$work/active-core.before-unsafe" "$NGINX_TELEGO_CORE_ACTIVE"

reloads=$(wc -l <"$NGINX_RELOAD_LOG")
"$RENDER" apply
[[ $(wc -l <"$NGINX_RELOAD_LOG") == "$reloads" ]]

# Empty managed hostname inherits telego.web_proxy.hostname.
export FIX_CF_HOSTNAME='' FIX_WEB_HOSTNAME=inherit-cf.example.com
"$RENDER" apply
grep -q 'server_name inherit-cf.example.com;' "$NGINX_TELEGO_INGRESS_OUTPUT"
export FIX_CF_HOSTNAME=web.example.com FIX_WEB_HOSTNAME=web.example.com

# Pre-baseline alpha marker format is foreign and cannot be adopted.
printf '%s\n%s\nserver { listen 127.0.0.1:18080; }\n' \
  "$MARKER" "$OLD_INGRESS_ROLE" >"$NGINX_TELEGO_INGRESS_OUTPUT"
cp "$NGINX_TELEGO_INGRESS_OUTPUT" "$work/old-role"
if "$RENDER" apply >"$work/old-role.out" 2>&1; then
  echo 'renderer unexpectedly adopted pre-baseline ingress file' >&2
  exit 1
fi
cmp "$work/old-role" "$NGINX_TELEGO_INGRESS_OUTPUT"
rm -f "$NGINX_TELEGO_INGRESS_OUTPUT"

# Cross-role marker is foreign and cannot be overwritten.
printf '%s\n%s\n' "$MARKER" "$FALLBACK_ROLE" >"$NGINX_TELEGO_INGRESS_OUTPUT"
cp "$NGINX_TELEGO_INGRESS_OUTPUT" "$work/cross-role"
if "$RENDER" apply >"$work/cross-role.out" 2>&1; then
  echo 'renderer unexpectedly adopted cross-role ingress file' >&2
  exit 1
fi
cmp "$work/cross-role" "$NGINX_TELEGO_INGRESS_OUTPUT"
rm -f "$NGINX_TELEGO_INGRESS_OUTPUT"

# Contract mismatch is rejected before generated state is changed.
"$RENDER" apply
cp "$NGINX_TELEGO_INGRESS_OUTPUT" "$work/before-contract"
export FIX_WEB_HOSTNAME=other.example.com
if "$RENDER" apply >"$work/contract.out" 2>&1; then exit 1; fi
cmp "$work/before-contract" "$NGINX_TELEGO_INGRESS_OUTPUT"
export FIX_WEB_HOSTNAME=web.example.com

# Native shared-port requires TLS Fronting and then uses the fixed private topology.
export FIX_CF_ENABLED=0 FIX_DIRECT_ENABLED=0 FIX_SHARED_ENABLED=1 FIX_SHARED_HOSTNAME=proxy.example.com
export FIX_WEB_HOSTNAME=proxy.example.com FIX_MASK_HOST=proxy.example.com FIX_TLS_ENABLED=0
if "$RENDER" apply >"$work/shared-tls-disabled.out" 2>&1; then
  echo 'renderer unexpectedly accepted Native Shared-Port with TLS Fronting disabled' >&2
  exit 1
fi
grep -q 'requires telego.tls_fronting.enabled=1' "$work/shared-tls-disabled.out"
export FIX_TLS_ENABLED=1
"$RENDER" apply
grep -q 'listen 127.0.0.1:8443 ssl proxy_protocol;' "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -q 'listen 127.0.0.1:8444 ssl;' "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -q 'include /etc/nginx/snippets/telego.locations;' "$NGINX_TELEGO_INGRESS_OUTPUT"

# Native Shared-Port also inherits the WEB hostname when its override is empty.
export FIX_SHARED_HOSTNAME='' FIX_WEB_HOSTNAME=proxy.example.com
"$RENDER" apply
grep -q 'server_name proxy.example.com;' "$NGINX_TELEGO_INGRESS_OUTPUT"

# Direct HTTPS owns real WEB TLS directly on dedicated TCP/443.
export FIX_SHARED_ENABLED=0 FIX_CF_ENABLED=0 FIX_DIRECT_ENABLED=1
export FIX_DIRECT_HOSTNAME=direct.example.com FIX_WEB_HOSTNAME=direct.example.com
export FIX_PUBLIC_BIND=0.0.0.0:9443
"$RENDER" apply
grep -q 'listen 0.0.0.0:443 ssl default_server;' "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -Fq 'listen [::]:443 ssl default_server;' "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -q 'listen 0.0.0.0:443 ssl;' "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -Fq 'listen [::]:443 ssl;' "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -q 'server_name direct.example.com;' "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -q 'http2 on;' "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -q "ssl_certificate $FIX_DIRECT_CERT;" "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -q "ssl_certificate_key $FIX_DIRECT_KEY;" "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -Fq 'ssl_protocols TLSv1.2 TLSv1.3;' "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -Fq 'server_tokens off;' "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -Fq 'add_header Strict-Transport-Security "max-age=604800" always;' "$NGINX_TELEGO_INGRESS_OUTPUT"
! grep -Eq 'Strict-Transport-Security.*(includeSubDomains|preload)' "$NGINX_TELEGO_INGRESS_OUTPUT"
! grep -Eq 'ssl_stapling|ssl_ciphers|ssl_conf_command[[:space:]]+Ciphersuites' "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -q 'include /etc/nginx/snippets/telego.locations;' "$NGINX_TELEGO_INGRESS_OUTPUT"

# HSTS max-age is staged/configurable without enabling includeSubDomains/preload.
export FIX_HSTS_MAX_AGE=31536000
"$RENDER" apply
grep -Fq 'add_header Strict-Transport-Security "max-age=31536000" always;' "$NGINX_TELEGO_INGRESS_OUTPUT"
cp "$NGINX_TELEGO_INGRESS_OUTPUT" "$work/before-bad-hsts"
export FIX_HSTS_MAX_AGE=invalid
if "$RENDER" apply >"$work/bad-hsts.out" 2>&1; then exit 1; fi
cmp "$work/before-bad-hsts" "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -q 'HSTS max-age must be an integer' "$work/bad-hsts.out"
export FIX_HSTS_MAX_AGE=604800
"$RENDER" apply

# Direct HTTPS inherits telego.web_proxy.hostname when no profile override is set.
export FIX_DIRECT_HOSTNAME='' FIX_WEB_HOSTNAME=direct.example.com
"$RENDER" apply
grep -q 'server_name direct.example.com;' "$NGINX_TELEGO_INGRESS_OUTPUT"

# Direct HTTPS owns TCP/443 on LAN and WAN. MTProxy on the same port is rejected
# before generated state changes; Native Shared-Port is the supported shared-443 mode.
cp "$NGINX_TELEGO_INGRESS_OUTPUT" "$work/before-port-contract"
export FIX_PUBLIC_BIND=0.0.0.0:443
if "$RENDER" apply >"$work/direct-port.out" 2>&1; then exit 1; fi
cmp "$work/before-port-contract" "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -q 'Direct HTTPS reserves TCP/443 for WEB/Nginx on LAN and WAN' "$work/direct-port.out"
export FIX_PUBLIC_BIND=0.0.0.0:9443

# A managed WEB ingress cannot be published while the telEgo daemon is disabled.
export FIX_GENERAL_ENABLED=0
if "$RENDER" apply >"$work/service-disabled.out" 2>&1; then exit 1; fi
grep -q 'requires telego.general.enabled=1' "$work/service-disabled.out"
export FIX_GENERAL_ENABLED=1

# PEM shape is checked before generated state changes; nginx -t remains the
# authoritative syntax/key-pair check on the router.
cp "$NGINX_TELEGO_INGRESS_OUTPUT" "$work/before-bad-pem"
printf '%s\n' 'not a certificate' >"$work/bad-cert.pem"
export FIX_DIRECT_CERT="$work/bad-cert.pem"
if "$RENDER" apply >"$work/bad-pem.out" 2>&1; then exit 1; fi
cmp "$work/before-bad-pem" "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -q 'TLS certificate is not PEM encoded' "$work/bad-pem.out"
export FIX_DIRECT_CERT="$work/fullchain.pem"

# All three managed ingress profiles are mutually exclusive.
export FIX_CF_ENABLED=1 FIX_CF_HOSTNAME=direct.example.com
if "$RENDER" apply >"$work/both.out" 2>&1; then exit 1; fi
grep -q 'choose exactly one managed ingress profile' "$work/both.out"
export FIX_CF_ENABLED=0 FIX_DIRECT_ENABLED=0

# Port conflicts in hand-written or UCI-managed Nginx state are rejected.
export FIX_SHARED_ENABLED=0 FIX_CF_ENABLED=1 FIX_CF_HOSTNAME=web.example.com FIX_WEB_HOSTNAME=web.example.com
"$RENDER" apply
cp "$NGINX_TELEGO_INGRESS_OUTPUT" "$work/before-conflict"
printf 'server { listen 18080; }\n' >"$work/nginx-source/conf.d/manual.conf"
if "$RENDER" apply >"$work/conflict.out" 2>&1; then exit 1; fi
cmp "$work/before-conflict" "$NGINX_TELEGO_INGRESS_OUTPUT"
rm -f "$work/nginx-source/conf.d/manual.conf"
printf "config disable '_lan'\n\tlist listen '18080'\n\tlist listen '[::]:18080'\n" >"$NGINX_UCI_CONFIG"
"$RENDER" apply
printf "config server 'existing'\n\tlist listen '127.0.0.1:18080'\n" >"$NGINX_UCI_CONFIG"
if "$RENDER" apply >"$work/uci-conflict.out" 2>&1; then exit 1; fi
grep -Fq "$NGINX_UCI_CONFIG" "$work/uci-conflict.out"
: >"$NGINX_UCI_CONFIG"

# nginx -t failure restores both generated files atomically.
printf '%s\n%s\n# previous ingress\n' "$MARKER" "$INGRESS_ROLE" >"$NGINX_TELEGO_INGRESS_OUTPUT"
printf '%s\n%s\n# previous fallback\n' "$MARKER" "$FALLBACK_ROLE" >"$NGINX_TELEGO_FALLBACK_OUTPUT"
cp "$NGINX_TELEGO_INGRESS_OUTPUT" "$work/previous-ingress"
cp "$NGINX_TELEGO_FALLBACK_OUTPUT" "$work/previous-fallback"
export NGINX_TEST_FAIL=1
if "$RENDER" apply >"$work/test-fail.out" 2>&1; then exit 1; fi
cmp "$work/previous-ingress" "$NGINX_TELEGO_INGRESS_OUTPUT"
cmp "$work/previous-fallback" "$NGINX_TELEGO_FALLBACK_OUTPUT"
grep -q 'generated-file transaction rolled back' "$work/test-fail.out"
unset NGINX_TEST_FAIL

# External fallback may own 8090 when package fallback is disabled.
printf 'server { listen 127.0.0.1:8090; }\n' >"$work/nginx-source/conf.d/site.conf"
export FIX_FALLBACK_MANAGE=0 FIX_CF_ENABLED=1 FIX_SHARED_ENABLED=0
"$RENDER" apply
! test -e "$NGINX_TELEGO_FALLBACK_OUTPUT"
grep -q 'listen 127.0.0.1:18080;' "$NGINX_TELEGO_INGRESS_OUTPUT"

# remove --no-reload removes only current managed generated outputs.
rm -f "$work/nginx-source/conf.d/site.conf"
reloads=$(wc -l <"$NGINX_RELOAD_LOG")
"$RENDER" remove --no-reload
! test -e "$NGINX_TELEGO_INGRESS_OUTPUT"
! test -e "$NGINX_TELEGO_FALLBACK_OUTPUT"
[[ $(wc -l <"$NGINX_RELOAD_LOG") == "$reloads" ]]

echo 'nginx-telego managed ingress tests passed'
