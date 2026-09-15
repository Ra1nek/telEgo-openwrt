#!/bin/bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
RENDER="$ROOT/package/nginx-telego/files/usr/libexec/nginx-telego-render"
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$work/conf.d"

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
  nginx_telego.fallback.manage) printf '%s\n' "${FIX_FALLBACK_MANAGE:-1}" ;;
  telego.general.bind_to) printf '%s\n' "${FIX_PUBLIC_BIND:-0.0.0.0:443}" ;;
  telego.web_proxy.enabled) printf '%s\n' "${FIX_WEB_ENABLED:-1}" ;;
  telego.web_proxy.hostname) printf '%s\n' "${FIX_WEB_HOSTNAME:-web.example.com}" ;;
  telego.web_proxy.bind_to) printf '%s\n' "${FIX_WEB_BIND:-127.0.0.1:8080}" ;;
  telego.web_proxy.trusted_proxy_cidrs) printf '%s\n' "${FIX_TRUSTED:-127.0.0.1/32}" ;;
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

: >"$work/uci.conf"
: >"$work/nginx-uci"
printf 'dummy cert\n' >"$work/fullchain.pem"
printf 'dummy key\n' >"$work/privkey.pem"

export UCI_BIN="$work/uci" NGINX_BIN="$work/nginx" NGINX_CONF="$work/uci.conf"
export NGINX_INIT="$work/nginx-init" NGINX_UCI_CONFIG="$work/nginx-uci"
export NGINX_TELEGO_CONF_DIR="$work/conf.d"
export NGINX_TELEGO_INGRESS_OUTPUT="$work/conf.d/80-telego-ingress.conf"
export NGINX_TELEGO_FALLBACK_OUTPUT="$work/conf.d/85-telego-fallback.conf"
export NGINX_TELEGO_LEGACY_OUTPUT="$work/conf.d/zz-telego-managed.conf"
export NGINX_LOG="$work/nginx.log" NGINX_RELOAD_LOG="$work/reload.log"
export FIX_CERT="$work/fullchain.pem" FIX_KEY="$work/privkey.pem"
: >"$NGINX_LOG"
: >"$NGINX_RELOAD_LOG"

# Disabled profiles must not create generated state.
FIX_SHARED_ENABLED=0 FIX_CF_ENABLED=0 "$RENDER" apply
! test -e "$NGINX_TELEGO_INGRESS_OUTPUT"
! test -e "$NGINX_TELEGO_FALLBACK_OUTPUT"

# A foreign reserved ingress filename is preserved while disabled and blocks enablement.
printf '# administrator-owned file\n' >"$NGINX_TELEGO_INGRESS_OUTPUT"
cp "$NGINX_TELEGO_INGRESS_OUTPUT" "$work/admin-owned"
FIX_SHARED_ENABLED=0 FIX_CF_ENABLED=0 "$RENDER" apply
cmp "$work/admin-owned" "$NGINX_TELEGO_INGRESS_OUTPUT"
export FIX_CF_ENABLED=1 FIX_CF_HOSTNAME=web.example.com FIX_SHARED_ENABLED=0
export FIX_WEB_HOSTNAME=web.example.com FIX_WEB_ENABLED=1
if "$RENDER" apply >"$work/ownership.out" 2>&1; then
  echo 'managed profile unexpectedly overwrote an administrator-owned ingress file' >&2
  exit 1
fi
cmp "$work/admin-owned" "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -Eq 'not owned by nginx-telego|existing listener or the managed profile' "$work/ownership.out"
rm -f "$NGINX_TELEGO_INGRESS_OUTPUT"

# Cloudflare ingress and fallback are separate generated files.
"$RENDER" apply
grep -q 'listen 127.0.0.1:18080;' "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -q 'map \$http_cf_connecting_ip \$telego_cf_client_ip' "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -q 'proxy_set_header CF-Connecting-IP "";' "$NGINX_TELEGO_INGRESS_OUTPUT"
! grep -q 'listen 127.0.0.1:8090;' "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -q 'listen 127.0.0.1:8090;' "$NGINX_TELEGO_FALLBACK_OUTPUT"

# Identical renders validate Nginx but do not reload it again.
reloads=$(wc -l <"$NGINX_RELOAD_LOG")
"$RENDER" apply
[[ $(wc -l <"$NGINX_RELOAD_LOG") == "$reloads" ]]

# Hostname contract mismatch must be rejected without changing generated files.
cp "$NGINX_TELEGO_INGRESS_OUTPUT" "$work/before-contract-error"
cp "$NGINX_TELEGO_FALLBACK_OUTPUT" "$work/fallback-before-contract-error"
export FIX_WEB_HOSTNAME=other.example.com
if "$RENDER" apply >"$work/contract.out" 2>&1; then
  echo 'Cloudflare profile unexpectedly accepted a WEB hostname mismatch' >&2
  exit 1
fi
cmp "$work/before-contract-error" "$NGINX_TELEGO_INGRESS_OUTPUT"
cmp "$work/fallback-before-contract-error" "$NGINX_TELEGO_FALLBACK_OUTPUT"
export FIX_WEB_HOSTNAME=web.example.com

# Native shared-port profile must match the pinned telEgo WEB/FakeTLS topology.
export FIX_CF_ENABLED=0 FIX_SHARED_ENABLED=1 FIX_SHARED_HOSTNAME=proxy.example.com
export FIX_WEB_HOSTNAME=proxy.example.com FIX_MASK_HOST=proxy.example.com
"$RENDER" apply
grep -q 'listen 127.0.0.1:8443 ssl proxy_protocol;' "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -q 'listen 127.0.0.1:8444 ssl;' "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -q 'include /etc/nginx/snippets/telego.locations;' "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -q "ssl_certificate $FIX_CERT;" "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -q 'listen 127.0.0.1:8090;' "$NGINX_TELEGO_FALLBACK_OUTPUT"

# Managed ingress modes are mutually exclusive.
export FIX_CF_ENABLED=1 FIX_CF_HOSTNAME=proxy.example.com
if "$RENDER" apply >"$work/both.out" 2>&1; then
  echo 'managed profiles unexpectedly accepted simultaneous enablement' >&2
  exit 1
fi
grep -q 'choose either native shared-port or Cloudflare ingress' "$work/both.out"
export FIX_CF_ENABLED=0

# Shared-port mask host must match the public WEB hostname.
export FIX_MASK_HOST=wrong.example.com
if "$RENDER" apply >"$work/shared-contract.out" 2>&1; then
  echo 'shared-port profile unexpectedly accepted a mask hostname mismatch' >&2
  exit 1
fi
export FIX_MASK_HOST=proxy.example.com

# Hand-written listeners on exact, wildcard, and UCI-managed ports are conflicts.
export FIX_SHARED_ENABLED=0 FIX_CF_ENABLED=1 FIX_CF_HOSTNAME=web.example.com FIX_WEB_HOSTNAME=web.example.com
"$RENDER" apply
cp "$NGINX_TELEGO_INGRESS_OUTPUT" "$work/before-conflict"
printf 'server { listen 127.0.0.1:18080; }\n' >"$work/conf.d/manual.conf"
if "$RENDER" apply >"$work/conflict.out" 2>&1; then exit 1; fi
cmp "$work/before-conflict" "$NGINX_TELEGO_INGRESS_OUTPUT"
grep -q 'existing listener or the managed profile' "$work/conflict.out"
rm -f "$work/conf.d/manual.conf"

printf 'server { listen 18080; }\n' >"$work/conf.d/manual.conf"
if "$RENDER" apply >"$work/wildcard-conflict.out" 2>&1; then exit 1; fi
cmp "$work/before-conflict" "$NGINX_TELEGO_INGRESS_OUTPUT"
rm -f "$work/conf.d/manual.conf"

printf "config server 'existing'\n\tlist listen '127.0.0.1:18080'\n" >"$NGINX_UCI_CONFIG"
if "$RENDER" apply >"$work/uci-conflict.out" 2>&1; then exit 1; fi
grep -Fq "$NGINX_UCI_CONFIG" "$work/uci-conflict.out"
: >"$NGINX_UCI_CONFIG"

# Invalid hostnames are rejected before active Nginx state is touched.
export FIX_CF_HOSTNAME='bad;hostname'
if "$RENDER" apply >"$work/invalid.out" 2>&1; then exit 1; fi
cmp "$work/before-conflict" "$NGINX_TELEGO_INGRESS_OUTPUT"
export FIX_CF_HOSTNAME=web.example.com

# nginx -t failure must restore both generated files atomically.
printf '%s\n# previous-good\n' \
  '# Generated by /usr/libexec/nginx-telego-render from /etc/config/nginx_telego.' \
  >"$NGINX_TELEGO_INGRESS_OUTPUT"
printf '%s\n# previous-fallback\n' \
  '# Generated by /usr/libexec/nginx-telego-render from /etc/config/nginx_telego.' \
  >"$NGINX_TELEGO_FALLBACK_OUTPUT"
cp "$NGINX_TELEGO_INGRESS_OUTPUT" "$work/previous-good"
cp "$NGINX_TELEGO_FALLBACK_OUTPUT" "$work/previous-fallback"
export NGINX_TEST_FAIL=1
if "$RENDER" apply >"$work/test-fail.out" 2>&1; then exit 1; fi
cmp "$work/previous-good" "$NGINX_TELEGO_INGRESS_OUTPUT"
cmp "$work/previous-fallback" "$NGINX_TELEGO_FALLBACK_OUTPUT"
grep -q 'generated-file transaction rolled back' "$work/test-fail.out"
unset NGINX_TEST_FAIL

# A separately managed fallback may own 8090 when package fallback is disabled.
printf 'server { listen 127.0.0.1:8090; }\n' >"$work/conf.d/site.conf"
export FIX_FALLBACK_MANAGE=0 FIX_CF_ENABLED=1 FIX_SHARED_ENABLED=0
"$RENDER" apply
! test -e "$NGINX_TELEGO_FALLBACK_OUTPUT"
grep -q 'listen 127.0.0.1:18080;' "$NGINX_TELEGO_INGRESS_OUTPUT"

# Uninstall removal clears current generated files and a marker-owned legacy file.
rm -f "$work/conf.d/site.conf"
printf '%s\n# legacy\n' \
  '# Generated by /usr/libexec/nginx-telego-render from /etc/config/nginx_telego.' \
  >"$NGINX_TELEGO_LEGACY_OUTPUT"
"$RENDER" remove
! test -e "$NGINX_TELEGO_INGRESS_OUTPUT"
! test -e "$NGINX_TELEGO_FALLBACK_OUTPUT"
! test -e "$NGINX_TELEGO_LEGACY_OUTPUT"

echo 'nginx-telego managed ingress tests passed'
