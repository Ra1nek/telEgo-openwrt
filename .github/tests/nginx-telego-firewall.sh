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

# Reproduce the OpenWrt hardware portability failure that motivated P12.7-r7:
# POSIX character-class operands may pass through unchanged, while simple
# A-Z/a-z ranges remain portable. Any runtime dependency on the former must fail.
REAL_TR=$(command -v tr)
export REAL_TR
cat >"$work/tr" <<'SH'
#!/bin/sh
if [ "${1:-}" = '[:upper:]' ] && [ "${2:-}" = '[:lower:]' ]; then
  cat
else
  exec "$REAL_TR" "$@"
fi
SH
chmod +x "$work/tr"
export PATH="$work:$PATH"

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

# Legacy P12.5 package-owned redirect is migrated in place.
baseline
cat >>"$FIREWALL_CONFIG" <<'STATE'
telego_direct_https|redirect||
telego_direct_https|redirect|name|telEgo Direct HTTPS (managed)
telego_direct_https|redirect|src|wan
telego_direct_https|redirect|proto|tcp
telego_direct_https|redirect|src_dport|443
telego_direct_https|redirect|dest_port|18443
telego_direct_https|redirect|family|any
telego_direct_https|redirect|target|dnat
telego_direct_https|redirect|reflection|0
telego_direct_https|redirect|enabled|1
STATE
"$MANAGER" apply >/dev/null
grep -Fqx 'telego_direct_https|rule|dest_port|443' "$FIREWALL_CONFIG"
grep -Fqx 'telego_direct_https|rule|target|ACCEPT' "$FIREWALL_CONFIG"
! grep -q '^telego_direct_https|redirect|' "$FIREWALL_CONFIG"

# A foreign WAN redirect that claims TCP/443 is rejected.
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

# A foreign WAN INPUT ACCEPT rule for TCP/443 is also rejected.
baseline
cat >>"$FIREWALL_CONFIG" <<'STATE'
foreign_rule|rule||
foreign_rule|rule|src|wan
foreign_rule|rule|proto|tcp
foreign_rule|rule|dest_port|443
foreign_rule|rule|target|ACCEPT
STATE
if "$MANAGER" apply >"$work/foreign-rule.out" 2>&1; then
  echo 'foreign WAN/443 input rule was unexpectedly accepted' >&2
  exit 1
fi
grep -q "foreign firewall entry 'rule:foreign_rule' already claims WAN TCP/443" "$work/foreign-rule.out"

# Port ranges that include 443 also claim the dedicated endpoint.
baseline
cat >>"$FIREWALL_CONFIG" <<'STATE'
range|rule||
range|rule|src|wan
range|rule|proto|tcp
range|rule|dest_port|440-450
range|rule|target|ACCEPT
STATE
if "$MANAGER" apply >"$work/range.out" 2>&1; then exit 1; fi
grep -q 'claims WAN TCP/443' "$work/range.out"

# UDP/443 does not conflict with the TCP endpoint.
baseline
cat >>"$FIREWALL_CONFIG" <<'STATE'
udp443|rule||
udp443|rule|src|wan
udp443|rule|proto|udp
udp443|rule|dest_port|443
udp443|rule|target|ACCEPT
STATE
"$MANAGER" apply >/dev/null
grep -q '^udp443|' "$FIREWALL_CONFIG"

# A broad WAN INPUT ACCEPT policy makes ownership ambiguous.
baseline
sed -i 's/wan|zone|input|reject/wan|zone|input|ACCEPT/' "$FIREWALL_CONFIG"
if "$MANAGER" apply >"$work/accept.out" 2>&1; then exit 1; fi
grep -q 'input ACCEPT' "$work/accept.out"

# The reserved section name remains protected from administrator-owned content.
baseline
cat >>"$FIREWALL_CONFIG" <<'STATE'
telego_direct_https|rule||
telego_direct_https|rule|name|Administrator rule
telego_direct_https|rule|src|wan
telego_direct_https|rule|proto|tcp
telego_direct_https|rule|dest_port|444
STATE
cp "$FIREWALL_CONFIG" "$work/before"
if "$MANAGER" apply >"$work/reserved.out" 2>&1; then exit 1; fi
grep -q 'reserved firewall section' "$work/reserved.out"
cmp "$work/before" "$FIREWALL_CONFIG"

# Candidate fw4 failure restores the exact pre-transaction file.
baseline
cp "$FIREWALL_CONFIG" "$work/before"
export FW4_FAIL_AT=2
if "$MANAGER" apply >"$work/check-fail.out" 2>&1; then exit 1; fi
cmp "$work/before" "$FIREWALL_CONFIG"
grep -q 'candidate firewall configuration failed fw4 check' "$work/check-fail.out"
grep -q 'firewall transaction rolled back' "$work/check-fail.out"
[[ ! -s "$RELOAD_LOG" ]]
unset FW4_FAIL_AT

# Reload failure also rolls back and reloads the restored ruleset.
baseline
cp "$FIREWALL_CONFIG" "$work/before"
export RELOAD_FAIL_AT=1
if "$MANAGER" apply >"$work/reload-fail.out" 2>&1; then exit 1; fi
cmp "$work/before" "$FIREWALL_CONFIG"
grep -q 'firewall reload failed' "$work/reload-fail.out"
grep -q 'firewall transaction rolled back' "$work/reload-fail.out"
[[ $(wc -l <"$RELOAD_LOG") == 2 ]]
unset RELOAD_FAIL_AT

# Disabled Direct HTTPS removes only the package-owned reserved section.
baseline
"$MANAGER" apply >/dev/null
sed -i 's/direct_https|direct_https|enabled|1/direct_https|direct_https|enabled|0/' "$NGINX_CONFIG_STATE"
"$MANAGER" apply >/dev/null
! grep -q '^telego_direct_https|' "$FIREWALL_CONFIG"

# Pending administrator changes are never folded into a package transaction.
baseline
export UCI_PENDING=1
if "$MANAGER" apply >"$work/pending.out" 2>&1; then exit 1; fi
grep -q 'uncommitted firewall UCI changes' "$work/pending.out"
unset UCI_PENDING

# Check/preflight are read-only.
baseline
cp "$FIREWALL_CONFIG" "$work/before"
"$MANAGER" check >/dev/null
cmp "$work/before" "$FIREWALL_CONFIG"
[[ ! -s "$RELOAD_LOG" ]]

baseline
sed -i 's/direct_https|direct_https|enabled|1/direct_https|direct_https|enabled|0/' "$NGINX_CONFIG_STATE"
cp "$FIREWALL_CONFIG" "$work/before"
"$MANAGER" preflight >/dev/null
cmp "$work/before" "$FIREWALL_CONFIG"
[[ $(cat "$FW4_COUNT") == 1 ]]
[[ ! -s "$RELOAD_LOG" ]]

# Status is read-only and machine-readable.
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

# Status surfaces the exact kind of foreign WAN/443 owner.
baseline
cat >>"$FIREWALL_CONFIG" <<'STATE'
foreign_status|redirect||
foreign_status|redirect|src|wan
foreign_status|redirect|proto|tcp
foreign_status|redirect|src_dport|443
STATE
status=$("$MANAGER" status)
grep -Eq '^foreign_wan443[[:space:]]+redirect:foreign_status$' <<<"$status"

# Concurrent reconciliation is serialized.
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

echo 'nginx-telego P12.6 dedicated firewall manager tests passed'
