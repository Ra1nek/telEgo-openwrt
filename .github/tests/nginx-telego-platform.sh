#!/bin/bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PLATFORM="$ROOT/package/nginx-telego/files/usr/libexec/nginx-telego-platform"
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT

STATE="$work/uci.state"
cat >"$work/uci" <<'SH'
#!/bin/sh
[ "${1:-}" = -q ] && shift
cmd=$1
shift
get_value() { awk -F '|' -v k="$1" '$1==k {print $2; found=1; exit} END{if(!found) exit 1}' "$STATE"; }
set_value() {
  key=$1; value=$2; tmp="${STATE}.tmp.$$"
  awk -F '|' -v k="$key" '$1!=k' "$STATE" >"$tmp"
  printf '%s|%s\n' "$key" "$value" >>"$tmp"
  mv "$tmp" "$STATE"
}
case "$cmd" in
  get) get_value "$1" ;;
  changes)
    case "$1" in
      uhttpd) [ "${PENDING_UHTTPD:-0}" = 1 ] && echo "uhttpd.main.test='pending'" || true ;;
      dhcp) [ "${PENDING_DHCP:-0}" = 1 ] && echo "dhcp.test='pending'" || true ;;
      *) true ;;
    esac
    ;;
  delete)
    key=$1; tmp="${STATE}.tmp.$$"
    awk -F '|' -v k="$key" '$1!=k' "$STATE" >"$tmp"
    mv "$tmp" "$STATE"
    ;;
  add_list)
    expr=$1; key=${expr%%=*}; item=${expr#*=}; current=$(get_value "$key" 2>/dev/null || true)
    found=0; for v in $current; do [ "$v" = "$item" ] && found=1; done
    if [ "$found" = 0 ]; then [ -n "$current" ] && current="$current $item" || current="$item"; set_value "$key" "$current"; fi
    ;;
  del_list)
    expr=$1; key=${expr%%=*}; item=${expr#*=}; current=$(get_value "$key" 2>/dev/null || true); next=''
    for v in $current; do [ "$v" = "$item" ] && continue; [ -n "$next" ] && next="$next $v" || next="$v"; done
    set_value "$key" "$next"
    ;;
  commit|revert) : ;;
  *) exit 2 ;;
esac
SH
chmod +x "$work/uci"

cat >"$work/uhttpd-init" <<'SH'
#!/bin/sh
[ "$1" = restart ] || exit 2
echo restart >>"$UHTTPD_LOG"
[ "${FAIL_UHTTPD:-0}" != 1 ]
SH
chmod +x "$work/uhttpd-init"

cat >"$work/dnsmasq-init" <<'SH'
#!/bin/sh
[ "$1" = restart ] || exit 2
echo restart >>"$DNSMASQ_LOG"
[ "${FAIL_DNSMASQ:-0}" != 1 ]
SH
chmod +x "$work/dnsmasq-init"

export UCI_BIN="$work/uci"
export UHTTPD_INIT="$work/uhttpd-init"
export DNSMASQ_INIT="$work/dnsmasq-init"
export UHTTPD_CONFIG="$work/uhttpd.conf"
export DHCP_CONFIG="$work/dhcp.conf"
export NGINX_TELEGO_PLATFORM_STATE="$work/platform.state"
export NGINX_TELEGO_PLATFORM_LOCK_FILE="$work/platform.lock"
export FLOCK_BIN="$(command -v flock)"
export STATE
export UHTTPD_LOG="$work/uhttpd.log"
export DNSMASQ_LOG="$work/dnsmasq.log"

baseline() {
  cat >"$STATE" <<'STATE'
nginx_telego.direct_https.enabled|1
nginx_telego.direct_https.luci_https_port|10443
nginx_telego.direct_https.split_dns_address|192.168.88.1
nginx_telego.direct_https.hostname|web.example.com
telego.web_proxy.hostname|web.example.com
uhttpd.main.listen_https|0.0.0.0:443 [::]:443
uhttpd.main.listen_http|0.0.0.0:80 [::]:80
dhcp.@dnsmasq[0].address|
STATE
  : >"$UHTTPD_CONFIG"
  : >"$DHCP_CONFIG"
  : >"$UHTTPD_LOG"
  : >"$DNSMASQ_LOG"
  rm -f "$NGINX_TELEGO_PLATFORM_STATE"
  unset PENDING_UHTTPD PENDING_DHCP FAIL_UHTTPD FAIL_DNSMASQ || true
}

# Fresh default: migrate LuCI off :443 and install split DNS.
baseline
sh "$PLATFORM" apply >"$work/apply.out"
[[ $(awk -F '|' '$1=="uhttpd.main.listen_https" {print $2}' "$STATE") == '0.0.0.0:10443 [::]:10443' ]]
[[ $(awk -F '|' '$1=="uhttpd.main.listen_http" {print $2}' "$STATE") == '0.0.0.0:80 [::]:80' ]]
[[ $(awk -F '|' '$1=="dhcp.@dnsmasq[0].address" {print $2}' "$STATE") == '/web.example.com/192.168.88.1' ]]
[[ -f "$NGINX_TELEGO_PLATFORM_STATE" ]]
grep -q '^uhttpd_owned=1$' "$NGINX_TELEGO_PLATFORM_STATE"
grep -q '^split_dns_owned=1$' "$NGINX_TELEGO_PLATFORM_STATE"
[[ $(wc -l <"$UHTTPD_LOG") == 1 ]]
[[ $(wc -l <"$DNSMASQ_LOG") == 1 ]]

status=$(sh "$PLATFORM" status)
grep -Eq '^uhttpd_has_443[[:space:]]+0$' <<<"$status"
grep -Eq '^uhttpd_has_luci_port[[:space:]]+1$' <<<"$status"
grep -Eq '^split_dns_state[[:space:]]+owned$' <<<"$status"

# Disabling restores only package-owned state.
awk -F '|' 'BEGIN{OFS="|"} $1=="nginx_telego.direct_https.enabled" {$2="0"} {print}' "$STATE" >"$work/state.next"
mv "$work/state.next" "$STATE"
sh "$PLATFORM" apply >/dev/null
[[ $(awk -F '|' '$1=="uhttpd.main.listen_https" {print $2}' "$STATE") == '0.0.0.0:443 [::]:443' ]]
[[ $(awk -F '|' '$1=="uhttpd.main.listen_http" {print $2}' "$STATE") == '0.0.0.0:80 [::]:80' ]]
[[ -z $(awk -F '|' '$1=="dhcp.@dnsmasq[0].address" {print $2}' "$STATE") ]]
[[ ! -e "$NGINX_TELEGO_PLATFORM_STATE" ]]

# Pre-existing dedicated topology is external and never claimed or removed.
baseline
awk -F '|' 'BEGIN{OFS="|"} $1=="uhttpd.main.listen_https" {$2="0.0.0.0:10443 [::]:10443"} $1=="dhcp.@dnsmasq[0].address" {$2="/web.example.com/192.168.88.1"} {print}' "$STATE" >"$work/state.next"
mv "$work/state.next" "$STATE"
sh "$PLATFORM" apply >/dev/null
[[ ! -e "$NGINX_TELEGO_PLATFORM_STATE" ]]
sh "$PLATFORM" remove >/dev/null
[[ $(awk -F '|' '$1=="uhttpd.main.listen_https" {print $2}' "$STATE") == '0.0.0.0:10443 [::]:10443' ]]
[[ $(awk -F '|' '$1=="uhttpd.main.listen_http" {print $2}' "$STATE") == '0.0.0.0:80 [::]:80' ]]
[[ $(awk -F '|' '$1=="dhcp.@dnsmasq[0].address" {print $2}' "$STATE") == '/web.example.com/192.168.88.1' ]]

# Drift after a package-owned migration is refused rather than overwritten.
baseline
sh "$PLATFORM" apply >/dev/null
awk -F '|' 'BEGIN{OFS="|"} $1=="uhttpd.main.listen_https" {$2="0.0.0.0:10443 127.0.0.1:11443"} {print}' "$STATE" >"$work/state.next"
mv "$work/state.next" "$STATE"
if sh "$PLATFORM" remove >"$work/drift.out" 2>&1; then
  echo 'uhttpd drift was unexpectedly overwritten' >&2
  exit 1
fi
grep -q 'drifted' "$work/drift.out"

echo 'nginx-telego P12.7 platform reconciliation tests passed'
