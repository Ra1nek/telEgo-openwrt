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
export NGINX_TELEGO_CONF_DIR="$work/conf.d" NGINX_TELEGO_OUTPUT="$work/conf.d/zz-telego-managed.conf"
export NGINX_LOG="$work/nginx.log" NGINX_RELOAD_LOG="$work/reload.log"
export FIX_CERT="$work/fullchain.pem" FIX_KEY="$work/privkey.pem"
: >"$NGINX_LOG"
: >"$NGINX_RELOAD_LOG"

# Disabled profiles must not create managed state.
FIX_SHARED_ENABLED=0 FIX_CF_ENABLED=0 "$RENDER" apply
! test -e "$NGINX_TELEGO_OUTPUT"

# An administrator-owned reserved filename must never be overwritten or removed.
printf '# administrator-owned file\n' >"$NGINX_TELEGO_OUTPUT"
cp "$NGINX_TELEGO_OUTPUT" "$work/admin-owned"
FIX_SHARED_ENABLED=0 FIX_CF_ENABLED=0 "$RENDER" apply
cmp "$work/admin-owned" "$NGINX_TELEGO_OUTPUT"
export FIX_CF_ENABLED=1 FIX_CF_HOSTNAME=web.example.com FIX_SHARED_ENABLED=0
export FIX_WEB_HOSTNAME=web.example.com FIX_WEB_ENABLED=1
if "$RENDER" apply >"$work/ownership.out" 2>&1; then
  echo 'managed profile unexpectedly overwrote an administrator-owned output file' >&2
  exit 1
fi
cmp "$work/admin-owned" "$NGINX_TELEGO_OUTPUT"
# The renderer may reject the reserved file during conflict discovery or during
# the final ownership guard; both paths are safe as long as the file is unchanged.
grep -Eq 'not owned by nginx-telego|existing listener or the managed profile' "$work/ownership.out"
rm -f "$NGINX_TELEGO_OUTPUT"

# Cloudflare ingress is loopback-only and preserves the real Cloudflare client IP.
"$RENDER" apply
grep -q 'listen 127.0.0.1:18080;' "$NGINX_TELEGO_OUTPUT"
grep -q 'map \$http_cf_connecting_ip \$telego_cf_client_ip' "$NGINX_TELEGO_OUTPUT"
grep -q 'proxy_set_header CF-Connecting-IP "";' "$NGINX_TELEGO_OUTPUT"
grep -q 'listen 127.0.0.1:8090;' "$NGINX_TELEGO_OUTPUT"

# Identical renders validate Nginx but do not reload it again.
reloads=$(wc -l <"$NGINX_RELOAD_LOG")
"$RENDER" apply
[[ $(wc -l <"$NGINX_RELOAD_LOG") == "$reloads" ]]

# Hostname contract mismatch must be rejected without changing the active file.
cp "$NGINX_TELEGO_OUTPUT" "$work/before-contract-error"
export FIX_WEB_HOSTNAME=other.example.com
if "$RENDER" apply >"$work/contract.out" 2>&1; then
  echo 'Cloudflare profile unexpectedly accepted a WEB hostname mismatch' >&2
  exit 1
fi
cmp "$work/before-contract-error" "$NGINX_TELEGO_OUTPUT"
export FIX_WEB_HOSTNAME=web.example.com

# Native shared-port profile must match the pinned telEgo WEB/FakeTLS topology.
export FIX_CF_ENABLED=0 FIX_SHARED_ENABLED=1 FIX_SHARED_HOSTNAME=proxy.example.com
export FIX_WEB_HOSTNAME=proxy.example.com FIX_MASK_HOST=proxy.example.com
"$RENDER" apply
grep -q 'listen 127.0.0.1:8443 ssl proxy_protocol;' "$NGINX_TELEGO_OUTPUT"
grep -q 'listen 127.0.0.1:8444 ssl;' "$NGINX_TELEGO_OUTPUT"
grep -q 'include /etc/nginx/snippets/telego.locations;' "$NGINX_TELEGO_OUTPUT"
grep -q "ssl_certificate $FIX_CERT;" "$NGINX_TELEGO_OUTPUT"

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
cp "$NGINX_TELEGO_OUTPUT" "$work/before-conflict"
printf 'server { listen 127.0.0.1:18080; }\n' >"$work/conf.d/manual.conf"
if "$RENDER" apply >"$work/conflict.out" 2>&1; then exit 1; fi
cmp "$work/before-conflict" "$NGINX_TELEGO_OUTPUT"
grep -q 'existing listener or the managed profile' "$work/conflict.out"
rm -f "$work/conf.d/manual.conf"

printf 'server { listen 18080; }\n' >"$work/conf.d/manual.conf"
if "$RENDER" apply >"$work/wildcard-conflict.out" 2>&1; then exit 1; fi
cmp "$work/before-conflict" "$NGINX_TELEGO_OUTPUT"
rm -f "$work/conf.d/manual.conf"

printf "config server 'existing'\n\tlist listen '127.0.0.1:18080'\n" >"$NGINX_UCI_CONFIG"
if "$RENDER" apply >"$work/uci-conflict.out" 2>&1; then exit 1; fi
grep -Fq "$NGINX_UCI_CONFIG" "$work/uci-conflict.out"
: >"$NGINX_UCI_CONFIG"

# Invalid hostnames are rejected before active Nginx state is touched.
export FIX_CF_HOSTNAME='bad;hostname'
if "$RENDER" apply >"$work/invalid.out" 2>&1; then exit 1; fi
cmp "$work/before-conflict" "$NGINX_TELEGO_OUTPUT"
export FIX_CF_HOSTNAME=web.example.com

# nginx -t failure must restore the previous managed output atomically.
printf '%s\n# previous-good\n' \
  '# Generated by /usr/libexec/nginx-telego-render from /etc/config/nginx_telego.' \
  >"$NGINX_TELEGO_OUTPUT"
cp "$NGINX_TELEGO_OUTPUT" "$work/previous-good"
export NGINX_TEST_FAIL=1
if "$RENDER" apply >"$work/test-fail.out" 2>&1; then exit 1; fi
cmp "$work/previous-good" "$NGINX_TELEGO_OUTPUT"
grep -q 'previous configuration restored' "$work/test-fail.out"
unset NGINX_TEST_FAIL

# A separately managed fallback may own 8090 when the package fallback is disabled.
printf 'server { listen 127.0.0.1:8090; }\n' >"$work/conf.d/site.conf"
export FIX_FALLBACK_MANAGE=0 FIX_CF_ENABLED=1 FIX_SHARED_ENABLED=0
"$RENDER" apply
! grep -q 'listen 127.0.0.1:8090;' "$NGINX_TELEGO_OUTPUT"
grep -q 'listen 127.0.0.1:18080;' "$NGINX_TELEGO_OUTPUT"

echo 'nginx-telego managed ingress tests passed'
