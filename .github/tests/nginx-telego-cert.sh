#!/bin/bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
HELPER="$ROOT/package/nginx-telego/files/usr/libexec/nginx-telego-cert"
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT

openssl_bin=$(command -v openssl)
"$openssl_bin" req -x509 -newkey rsa:2048 -nodes   -keyout "$work/key.pem" -out "$work/cert.pem" -days 45   -subj /CN=web.example.com -addext subjectAltName=DNS:web.example.com >/dev/null 2>&1
"$openssl_bin" genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$work/wrong.key" >/dev/null 2>&1

cat >"$work/uci" <<'SH'
#!/bin/sh
[ "${1:-}" = -q ] && shift
[ "${1:-}" = get ] || exit 1
key=${2:-}
case "$key" in
  nginx_telego.shared.enabled) printf '%s\n' "${SHARED_ENABLED:-0}" ;;
  nginx_telego.cloudflare.enabled) printf '%s\n' "${CLOUDFLARE_ENABLED:-0}" ;;
  nginx_telego.direct_https.enabled) printf '%s\n' "${DIRECT_ENABLED:-1}" ;;
  nginx_telego.direct_https.hostname) printf '%s\n' "${DIRECT_HOSTNAME:-}" ;;
  nginx_telego.direct_https.certificate) printf '%s\n' "${CERT_FILE:-}" ;;
  nginx_telego.direct_https.certificate_key) printf '%s\n' "${CERT_KEY:-}" ;;
  nginx_telego.shared.hostname) printf '%s\n' "${SHARED_HOSTNAME:-}" ;;
  nginx_telego.shared.certificate) printf '%s\n' "${SHARED_CERT_FILE:-}" ;;
  nginx_telego.shared.certificate_key) printf '%s\n' "${SHARED_CERT_KEY:-}" ;;
  telego.web_proxy.hostname) printf '%s\n' "${WEB_HOSTNAME:-web.example.com}" ;;
  *) exit 1 ;;
esac
SH
chmod +x "$work/uci"

cat >"$work/nginx" <<'SH'
#!/bin/sh
printf '%s\n' "$*" >>"$NGINX_TEST_LOG"
[ "${NGINX_TEST_FAIL:-0}" != 1 ]
SH
chmod +x "$work/nginx"
: >"$work/uci.conf"

export UCI_BIN="$work/uci"
export OPENSSL_BIN="$openssl_bin"
export NGINX_BIN="$work/nginx"
export NGINX_CONF="$work/uci.conf"
export NGINX_TEST_LOG="$work/nginx.log"
export CERT_FILE="$work/cert.pem"
export CERT_KEY="$work/key.pem"
export WEB_HOSTNAME='web.example.com'
export DIRECT_ENABLED=1
export SHARED_ENABLED=0
export CLOUDFLARE_ENABLED=0

status=$("$HELPER" status)
grep -Eq '^profile[[:space:]]+direct_https$' <<<"$status"
grep -Eq '^managed_tls[[:space:]]+1$' <<<"$status"
grep -Eq '^certificate_state[[:space:]]+valid$' <<<"$status"
grep -Eq '^key_state[[:space:]]+valid$' <<<"$status"
grep -Eq '^key_match[[:space:]]+1$' <<<"$status"
grep -Eq '^hostname_match[[:space:]]+1$' <<<"$status"
grep -Eq '^expiry_state[[:space:]]+ok$' <<<"$status"
grep -Eq '^openssl_available[[:space:]]+1$' <<<"$status"
grep -Eq '^acme_managed[[:space:]]+0$' <<<"$status"
grep -Eq '^not_after[[:space:]]+.+$' <<<"$status"
grep -Eq '^fingerprint_sha256[[:space:]]+[0-9A-F:]+$' <<<"$status"

: >"$NGINX_TEST_LOG"
"$HELPER" preflight >"$work/preflight.out"
grep -q 'certificate preflight passed; nginx -t succeeded' "$work/preflight.out"
grep -Fqx -- "-t -c $work/uci.conf" "$NGINX_TEST_LOG"

export WEB_HOSTNAME='other.example.com'
if "$HELPER" preflight >"$work/hostname.out" 2>&1; then
  echo 'certificate preflight unexpectedly accepted wrong hostname' >&2
  exit 1
fi
grep -q 'does not cover hostname' "$work/hostname.out"
export WEB_HOSTNAME='web.example.com'

export CERT_KEY="$work/wrong.key"
if "$HELPER" preflight >"$work/key.out" 2>&1; then
  echo 'certificate preflight unexpectedly accepted mismatched key' >&2
  exit 1
fi
grep -q 'certificate and private key do not match' "$work/key.out"
export CERT_KEY="$work/key.pem"

export NGINX_TEST_FAIL=1
if "$HELPER" preflight >"$work/nginx.out" 2>&1; then
  echo 'certificate preflight unexpectedly accepted failed nginx -t' >&2
  exit 1
fi
unset NGINX_TEST_FAIL

export DIRECT_ENABLED=0
export CLOUDFLARE_ENABLED=1
: >"$NGINX_TEST_LOG"
"$HELPER" preflight >"$work/cloudflare.out"
grep -q 'profile cloudflare has no local managed TLS certificate' "$work/cloudflare.out"
[[ ! -s "$NGINX_TEST_LOG" ]]

status=$("$HELPER" status)
grep -Eq '^profile[[:space:]]+cloudflare$' <<<"$status"
grep -Eq '^managed_tls[[:space:]]+0$' <<<"$status"
grep -Eq '^certificate_state[[:space:]]+not-applicable$' <<<"$status"

export DIRECT_ENABLED=1
export SHARED_ENABLED=1
if "$HELPER" preflight >"$work/conflict.out" 2>&1; then
  echo 'certificate preflight unexpectedly accepted conflicting ingress profiles' >&2
  exit 1
fi
grep -q 'managed ingress profiles are mutually exclusive' "$work/conflict.out"

export SHARED_ENABLED=0
export CLOUDFLARE_ENABLED=0
export CERT_FILE="$work/missing.pem"
status=$("$HELPER" status)
grep -Eq '^certificate_state[[:space:]]+missing$' <<<"$status"

echo 'nginx-telego certificate readiness tests passed'
