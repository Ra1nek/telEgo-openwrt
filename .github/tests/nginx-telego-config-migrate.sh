#!/bin/bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
MIGRATOR="$ROOT/package/nginx-telego/files/usr/libexec/nginx-telego-config-migrate"
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT

export STATE="$work/nginx.state"
export PENDING="$work/nginx.pending"
export UCI_LOG="$work/uci.log"

cat >"$work/uci" <<'SH'
#!/bin/sh
[ "${1:-}" = -q ] && shift
cmd=${1:-}
[ -n "$cmd" ] || exit 2
shift || true

current_file() {
	if [ -f "$PENDING" ]; then
		printf '%s' "$PENDING"
	else
		printf '%s' "$STATE"
	fi
}

case "$cmd" in
	get)
		key=$1
		pkg=${key%%.*}
		rest=${key#*.}
		[ "$pkg" = nginx_telego ] || exit 1
		sec=${rest%%.*}
		file=$(current_file)
		if [ "$rest" = "$sec" ]; then
			awk -F '|' -v s="$sec" '$1==s && $3=="" {print $2; found=1; exit} END{if(!found) exit 1}' "$file"
		else
			opt=${rest#*.}
			awk -F '|' -v s="$sec" -v o="$opt" '$1==s && $3==o {print $4; found=1; exit} END{if(!found) exit 1}' "$file"
		fi
		;;
	changes)
		[ "${1:-}" = nginx_telego ] || exit 1
		[ ! -f "$PENDING" ] || printf "%s\n" "nginx_telego.test='pending'"
		;;
	set)
		expr=$1
		left=${expr%%=*}
		value=${expr#*=}
		pkg=${left%%.*}
		rest=${left#*.}
		[ "$pkg" = nginx_telego ] || exit 1
		[ -f "$PENDING" ] || cp "$STATE" "$PENDING"
		sec=${rest%%.*}
		tmp="$PENDING.tmp.$$"
		if [ "$rest" = "$sec" ]; then
			awk -F '|' -v s="$sec" '$1!=s || $3!=""' "$PENDING" >"$tmp"
			printf '%s|%s||\n' "$sec" "$value" >>"$tmp"
		else
			opt=${rest#*.}
			awk -F '|' -v s="$sec" -v o="$opt" '!($1==s && $3==o)' "$PENDING" >"$tmp"
			type=$(awk -F '|' -v s="$sec" '$1==s && $3=="" {print $2; exit}' "$tmp")
			[ -n "$type" ] || exit 1
			printf '%s|%s|%s|%s\n' "$sec" "$type" "$opt" "$value" >>"$tmp"
		fi
		mv "$tmp" "$PENDING"
		printf 'set %s\n' "$expr" >>"$UCI_LOG"
		;;
	commit)
		[ "${1:-}" = nginx_telego ] || exit 1
		if [ -f "$PENDING" ]; then
			mv "$PENDING" "$STATE"
		fi
		printf 'commit\n' >>"$UCI_LOG"
		;;
	revert)
		[ "${1:-}" = nginx_telego ] || exit 1
		rm -f "$PENDING"
		printf 'revert\n' >>"$UCI_LOG"
		;;
	*) exit 2 ;;
esac
SH
chmod +x "$work/uci"
export UCI_BIN="$work/uci"

baseline() {
	cat >"$STATE" <<'STATE'
shared|shared||
shared|shared|enabled|0
shared|shared|hostname|legacy.example.com
cloudflare|cloudflare||
cloudflare|cloudflare|enabled|1
fallback|fallback||
fallback|fallback|manage|0
STATE
	rm -f "$PENDING"
	: >"$UCI_LOG"
}

baseline
sh "$MIGRATOR" >"$work/first.out"

# Existing administrator values survive.
grep -Fqx 'shared|shared|hostname|legacy.example.com' "$STATE"
grep -Fqx 'cloudflare|cloudflare|enabled|1' "$STATE"
grep -Fqx 'fallback|fallback|manage|0' "$STATE"

# Missing defaults and the newly introduced Direct HTTPS section are added.
grep -Fqx 'shared|shared|certificate|' "$STATE"
grep -Fqx 'shared|shared|certificate_key|' "$STATE"
grep -Fqx 'cloudflare|cloudflare|hostname|' "$STATE"
grep -Fqx 'direct_https|direct_https||' "$STATE"
grep -Fqx 'direct_https|direct_https|enabled|0' "$STATE"
grep -Fqx 'direct_https|direct_https|hostname|' "$STATE"
grep -Fqx 'direct_https|direct_https|certificate|' "$STATE"
grep -Fqx 'direct_https|direct_https|certificate_key|' "$STATE"
grep -Fqx 'direct_https|direct_https|luci_https_port|10443' "$STATE"
grep -Fqx 'direct_https|direct_https|split_dns_address|' "$STATE"
[[ $(grep -c '^commit$' "$UCI_LOG") == 1 ]]

# Re-running is a no-op and does not commit again.
cp "$STATE" "$work/after-first"
sh "$MIGRATOR" >"$work/second.out"
cmp "$work/after-first" "$STATE"
[[ $(grep -c '^commit$' "$UCI_LOG") == 1 ]]
grep -q 'already contains all managed defaults' "$work/second.out"

# A foreign section type is rejected before any staged mutation.
baseline
cat >>"$STATE" <<'STATE'
direct_https|cloudflare||
direct_https|cloudflare|enabled|1
STATE
cp "$STATE" "$work/before-foreign"
if sh "$MIGRATOR" >"$work/foreign.out" 2>&1; then
	echo 'foreign direct_https section type was unexpectedly accepted' >&2
	exit 1
fi
cmp "$work/before-foreign" "$STATE"
[[ ! -e "$PENDING" ]]
grep -q "expected 'direct_https'" "$work/foreign.out"

# Never trample administrator changes already pending in UCI.
baseline
cp "$STATE" "$PENDING"
printf '%s\n' 'cloudflare|cloudflare|hostname|pending.example.com' >>"$PENDING"
cp "$STATE" "$work/before-pending"
if sh "$MIGRATOR" >"$work/pending.out" 2>&1; then
	echo 'pre-existing pending UCI changes were unexpectedly accepted' >&2
	exit 1
fi
cmp "$work/before-pending" "$STATE"
grep -q 'uncommitted nginx_telego UCI changes' "$work/pending.out"

echo 'nginx-telego UCI migration tests passed'
