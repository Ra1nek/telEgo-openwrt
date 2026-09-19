#!/bin/bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
MANAGER="$ROOT/package/nginx-telego/files/usr/libexec/nginx-telego-firewall"
work=$(mktemp -d)
background_pid=''
cleanup() {
  if [[ -n "$background_pid" ]]; then
    kill "$background_pid" 2>/dev/null || true
    wait "$background_pid" 2>/dev/null || true
  fi
  rm -rf -- "$work"
}
trap cleanup EXIT

cat >"$work/uci" <<'SH'
#!/bin/sh
[ "${1:-}" = -q ] && shift
cmd=$1
shift
path_for_pkg() {
  [ "$1" = firewall ] && printf '%s' "$FIREWALL_CONFIG" || printf '%s' "$NGINX_CONFIG_STATE"
}
case "$cmd" in
  get)
    key=$1; pkg=${key%%.*}; rest=${key#*.}; sec=${rest%%.*}; file=$(path_for_pkg "$pkg")
    if [ "$rest" = "$sec" ]; then
      awk -F '|' -v s="$sec" '$1==s && $3=="" {print $2; found=1; exit} END{if(!found) exit 1}' "$file"
    else
      opt=${rest#*.}
      awk -F '|' -v s="$sec" -v o="$opt" '$1==s && $3==o {print $4; found=1; exit} END{if(!found) exit 1}' "$file"
    fi
    ;;
  show)
    target=$1; pkg=${target%%.*}; file=$(path_for_pkg "$pkg"); wanted=''
    [ "$target" = "$pkg" ] || wanted=${target#*.}
    awk -F '|' -v pkg="$pkg" -v wanted="$wanted" '
      $3=="" && (wanted=="" || $1==wanted) { print pkg "." $1 "=" $2 }
      $3!="" && (wanted=="" || $1==wanted) { print pkg "." $1 "." $3 "=\047" $4 "\047" }
    ' "$file"
    ;;
  changes)
    [ "${UCI_PENDING:-0}" = 1 ] && printf "%s\n" "firewall.test='pending'" || true
    ;;
  set)
    expr=$1; left=${expr%%=*}; val=${expr#*=}; pkg=${left%%.*}; rest=${left#*.}; sec=${rest%%.*}; file=$(path_for_pkg "$pkg"); tmp="${file}.tmp.$$"
    if [ "$rest" = "$sec" ]; then
      awk -F '|' -v s="$sec" '$1!=s || $3!=""' "$file" >"$tmp"
      printf '%s|%s||\n' "$sec" "$val" >>"$tmp"
    else
      opt=${rest#*.}
      awk -F '|' -v s="$sec" -v o="$opt" '!($1==s && $3==o)' "$file" >"$tmp"
      type=$(awk -F '|' -v s="$sec" '$1==s && $3=="" {print $2; exit}' "$tmp")
      [ -n "$type" ] || { type=unknown; printf '%s|%s||\n' "$sec" "$type" >>"$tmp"; }
      printf '%s|%s|%s|%s\n' "$sec" "$type" "$opt" "$val" >>"$tmp"
    fi
    mv "$tmp" "$file"
    ;;
  delete)
    key=$1; pkg=${key%%.*}; rest=${key#*.}; sec=${rest%%.*}; file=$(path_for_pkg "$pkg"); tmp="${file}.tmp.$$"
    if [ "$rest" = "$sec" ]; then
      awk -F '|' -v s="$sec" '$1!=s' "$file" >"$tmp"
    else
      opt=${rest#*.}; awk -F '|' -v s="$sec" -v o="$opt" '!($1==s&&$3==o)' "$file" >"$tmp"
    fi
    cmp -s "$file" "$tmp" && { rm -f "$tmp"; exit 1; }
    mv "$tmp" "$file"
    ;;
  commit|revert) : ;;
  *) exit 2 ;;
esac
SH
chmod +x "$work/uci"

cat >"$work/fw4" <<'SH'
#!/bin/sh
[ "$1" = -q ] && shift
[ "$1" = check ] || exit 2
count=0
[ ! -f "$FW4_COUNT" ] || count=$(cat "$FW4_COUNT")
count=$((count + 1))
printf '%s\n' "$count" >"$FW4_COUNT"
printf 'check %s\n' "$count" >>"$FW4_LOG"
if [ -n "${FW4_BLOCK:-}" ] && [ "$count" -eq 1 ]; then
  : >"${FW4_BLOCK}.entered"
  while [ ! -e "${FW4_BLOCK}.release" ]; do sleep 0.05; done
fi
[ "${FW4_FAIL_AT:-0}" -ne "$count" ]
SH
chmod +x "$work/fw4"

cat >"$work/firewall-init" <<'SH'
#!/bin/sh
[ "$1" = reload ] || exit 2
count=0
[ ! -f "$RELOAD_COUNT" ] || count=$(cat "$RELOAD_COUNT")
count=$((count + 1))
printf '%s\n' "$count" >"$RELOAD_COUNT"
printf 'reload %s\n' "$count" >>"$RELOAD_LOG"
[ "${RELOAD_FAIL_AT:-0}" -ne "$count" ]
SH
chmod +x "$work/firewall-init"

export UCI_BIN="$work/uci"
export FW4_BIN="$work/fw4"
export FIREWALL_INIT="$work/firewall-init"
export FLOCK_BIN="$(command -v flock)"
export NGINX_TELEGO_FIREWALL_LOCK_FILE="$work/firewall.lock"
export FIREWALL_CONFIG="$work/firewall.state"
export NGINX_CONFIG_STATE="$work/nginx.state"
export FW4_COUNT="$work/fw4.count"
export FW4_LOG="$work/fw4.log"
export RELOAD_COUNT="$work/reload.count"
export RELOAD_LOG="$work/reload.log"

baseline() {
  cat >"$FIREWALL_CONFIG" <<'STATE'
defaults|defaults||
defaults|defaults|input|reject
wan|zone||
wan|zone|name|wan
wan|zone|input|reject
STATE
  cat >"$NGINX_CONFIG_STATE" <<'STATE'
direct_https|direct_https||
direct_https|direct_https|enabled|1
STATE
  : >"$FW4_LOG"
  : >"$RELOAD_LOG"
  rm -f "$FW4_COUNT" "$RELOAD_COUNT"
  unset FW4_FAIL_AT RELOAD_FAIL_AT UCI_PENDING FW4_BLOCK || true
}

baseline
"$MANAGER" apply >/dev/null
grep -Fqx 'telego_direct_https|rule|name|telEgo Direct HTTPS (managed)' "$FIREWALL_CONFIG"
grep -Fqx 'telego_direct_https|rule|src|wan' "$FIREWALL_CONFIG"
grep -Fqx 'telego_direct_https|rule|proto|tcp' "$FIREWALL_CONFIG"
grep -Fqx 'telego_direct_https|rule|dest_port|443' "$FIREWALL_CONFIG"
grep -Fqx 'telego_direct_https|rule|family|any' "$FIREWALL_CONFIG"
grep -Fqx 'telego_direct_https|rule|target|ACCEPT' "$FIREWALL_CONFIG"
grep -Fqx 'telego_direct_https|rule|enabled|1' "$FIREWALL_CONFIG"
[[ $(wc -l <"$RELOAD_LOG") == 1 ]]
"$MANAGER" apply >/dev/null
[[ $(wc -l <"$RELOAD_LOG") == 1 ]]

baseline
cat >>"$FIREWALL_CONFIG" <<'STATE'
foreign|redirect||
foreign|redirect|src|wan
foreign|redirect|proto|tcp
foreign|redirect|src_dport|443
foreign|redirect|dest_port|9443
STATE
cp "$FIREWALL_CONFIG" "$work/before"
if "$MANAGER" apply >"$work/foreign.out" 2>&1; then
  echo 'foreign WAN/443 redirect was unexpectedly accepted' >&2
  exit 1
fi
grep -q "foreign firewall entry 'redirect:foreign' already claims WAN TCP/443" "$work/foreign.out"
cmp "$work/before" "$FIREWALL_CONFIG"

baseline
cat >>"$FIREWALL_CONFIG" <<'STATE'
range|redirect||
range|redirect|src|wan
range|redirect|proto|tcp
range|redirect|src_dport|440-450
STATE
if "$MANAGER" apply >"$work/range.out" 2>&1; then exit 1; fi
grep -q 'claims WAN TCP/443' "$work/range.out"

baseline
cat >>"$FIREWALL_CONFIG" <<'STATE'
udp443|redirect||
udp443|redirect|src|wan
udp443|redirect|proto|udp
udp443|redirect|src_dport|443
STATE
"$MANAGER" apply >/dev/null
grep -q '^udp443|' "$FIREWALL_CONFIG"

baseline
sed -i 's/wan|zone|input|reject/wan|zone|input|accept/' "$FIREWALL_CONFIG"
if "$MANAGER" apply >"$work/accept.out" 2>&1; then exit 1; fi
grep -q 'input ACCEPT' "$work/accept.out"


# P12.6 has no private :18443 backend; WAN ownership is checked directly on TCP/443.
baseline
cat >>"$FIREWALL_CONFIG" <<'STATE'
telego_direct_https|redirect||
telego_direct_https|redirect|name|Administrator rule
telego_direct_https|redirect|src|wan
telego_direct_https|redirect|proto|tcp
telego_direct_https|redirect|src_dport|444
STATE
cp "$FIREWALL_CONFIG" "$work/before"
if "$MANAGER" apply >"$work/reserved.out" 2>&1; then exit 1; fi
grep -q 'reserved firewall section' "$work/reserved.out"
cmp "$work/before" "$FIREWALL_CONFIG"

baseline
cp "$FIREWALL_CONFIG" "$work/before"
export FW4_FAIL_AT=2
if "$MANAGER" apply >"$work/check-fail.out" 2>&1; then exit 1; fi
cmp "$work/before" "$FIREWALL_CONFIG"
grep -q 'candidate firewall configuration failed fw4 check' "$work/check-fail.out"
grep -q 'firewall transaction rolled back' "$work/check-fail.out"
[[ ! -s "$RELOAD_LOG" ]]
unset FW4_FAIL_AT

baseline
cp "$FIREWALL_CONFIG" "$work/before"
export RELOAD_FAIL_AT=1
if "$MANAGER" apply >"$work/reload-fail.out" 2>&1; then exit 1; fi
cmp "$work/before" "$FIREWALL_CONFIG"
grep -q 'firewall reload failed' "$work/reload-fail.out"
grep -q 'firewall transaction rolled back' "$work/reload-fail.out"
[[ $(wc -l <"$RELOAD_LOG") == 2 ]]
unset RELOAD_FAIL_AT

baseline
"$MANAGER" apply >/dev/null
sed -i 's/direct_https|direct_https|enabled|1/direct_https|direct_https|enabled|0/' "$NGINX_CONFIG_STATE"
"$MANAGER" apply >/dev/null
! grep -q '^telego_direct_https|' "$FIREWALL_CONFIG"

baseline
export UCI_PENDING=1
if "$MANAGER" apply >"$work/pending.out" 2>&1; then exit 1; fi
grep -q 'uncommitted firewall UCI changes' "$work/pending.out"
unset UCI_PENDING

baseline
cp "$FIREWALL_CONFIG" "$work/before"
"$MANAGER" check >/dev/null
cmp "$work/before" "$FIREWALL_CONFIG"
[[ ! -s "$RELOAD_LOG" ]]

# LuCI status is read-only and machine-readable.
baseline
status=$("$MANAGER" status)
grep -Eq '^profile_enabled[[:space:]]+1$' <<<"$status"
grep -Eq '^section_state[[:space:]]+absent$' <<<"$status"
grep -Eq '^managed_match[[:space:]]+0$' <<<"$status"
grep -Eq '^wan_zone_count[[:space:]]+1$' <<<"$status"
grep -Eq '^wan_input[[:space:]]+reject$' <<<"$status"
grep -Eq '^foreign_wan443[[:space:]]+-$' <<<"$status"
grep -Eq '^pending_changes[[:space:]]+0$' <<<"$status"
[[ ! -e "$FW4_COUNT" ]]
[[ ! -s "$RELOAD_LOG" ]]

# LuCI preflight validates Direct HTTPS readiness even before the profile is
# enabled, and never mutates firewall state.
baseline
sed -i 's/direct_https|direct_https|enabled|1/direct_https|direct_https|enabled|0/' "$NGINX_CONFIG_STATE"
cp "$FIREWALL_CONFIG" "$work/before"
"$MANAGER" preflight >/dev/null
cmp "$work/before" "$FIREWALL_CONFIG"
[[ $(cat "$FW4_COUNT") == 1 ]]
[[ ! -s "$RELOAD_LOG" ]]

# Status surfaces foreign WAN/443 ownership without failing the read.
baseline
cat >>"$FIREWALL_CONFIG" <<'STATE'
foreign_status|redirect||
foreign_status|redirect|src|wan
foreign_status|redirect|proto|tcp
foreign_status|redirect|src_dport|443
STATE
status=$("$MANAGER" status)
grep -Eq '^foreign_wan443[[:space:]]+redirect:foreign_status

# There is no legacy backend-exposure status in the dedicated-port model.
baseline
block="$work/block"
FW4_BLOCK="$block" "$MANAGER" check >"$work/first.out" 2>&1 &
background_pid=$!
for _ in {1..100}; do
  [[ -e "$block.entered" ]] && break
  sleep 0.05
done
[[ -e "$block.entered" ]]
if "$MANAGER" check >"$work/second.out" 2>&1; then
  echo 'concurrent firewall reconciliation unexpectedly acquired the lock' >&2
  exit 1
fi
grep -q 'another firewall reconciliation is already running' "$work/second.out"
: >"$block.release"
wait "$background_pid"
background_pid=''

echo 'nginx-telego firewall4 manager tests passed'
 <<<"$status"

# Status also surfaces direct backend exposure without mutating state.
baseline
cat >>"$FIREWALL_CONFIG" <<'STATE'
backend_status|rule||
backend_status|rule|src|wan
backend_status|rule|proto|tcp
backend_status|rule|dest_port|18443
backend_status|rule|target|ACCEPT
STATE
status=$("$MANAGER" status)
grep -Eq '^foreign_wan18443[[:space:]]+rule:backend_status$' <<<"$status"

baseline
block="$work/block"
FW4_BLOCK="$block" "$MANAGER" check >"$work/first.out" 2>&1 &
background_pid=$!
for _ in {1..100}; do
  [[ -e "$block.entered" ]] && break
  sleep 0.05
done
[[ -e "$block.entered" ]]
if "$MANAGER" check >"$work/second.out" 2>&1; then
  echo 'concurrent firewall reconciliation unexpectedly acquired the lock' >&2
  exit 1
fi
grep -q 'another firewall reconciliation is already running' "$work/second.out"
: >"$block.release"
wait "$background_pid"
background_pid=''

echo 'nginx-telego firewall4 manager tests passed'
