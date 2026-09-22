#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../.."

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

state="$tmp/state"
mkdir -p "$state"
printf '0\n' > "$state/running"
printf '0\n' > "$state/autostart"
printf '1\n' > "$state/config_enabled"
: > "$state/calls"

cat > "$tmp/init-telego" <<'SH'
#!/bin/sh
state_dir="$(dirname "$0")/state"
case "$1" in
	status)
		[ "$(cat "$state_dir/running")" = 1 ]
		;;
	enabled)
		[ "$(cat "$state_dir/autostart")" = 1 ]
		;;
	start)
		echo start >> "$state_dir/calls"
		printf '1\n' > "$state_dir/running"
		;;
	restart)
		echo restart >> "$state_dir/calls"
		printf '1\n' > "$state_dir/running"
		;;
	stop)
		echo stop >> "$state_dir/calls"
		printf '0\n' > "$state_dir/running"
		;;
	enable)
		echo enable >> "$state_dir/calls"
		printf '1\n' > "$state_dir/autostart"
		;;
	disable)
		echo disable >> "$state_dir/calls"
		printf '0\n' > "$state_dir/autostart"
		;;
	*)
		exit 2
		;;
esac
SH
chmod +x "$tmp/init-telego"

cat > "$tmp/uci" <<'SH'
#!/bin/sh
state_dir="$(dirname "$0")/state"
[ "$1" = -q ] && [ "$2" = get ] && [ "$3" = telego.general.enabled ] || exit 1
cat "$state_dir/config_enabled"
SH
chmod +x "$tmp/uci"

sed 	-e "s|^INIT_SCRIPT=.*|INIT_SCRIPT=$tmp/init-telego|" 	-e "s|^UCI=.*|UCI=$tmp/uci|" 	-e "s|^STATE_DIR=.*|STATE_DIR=$tmp/ops|" 	-e "s|^LOCK_FILE=.*|LOCK_FILE=$tmp/lifecycle.lock|" 	package/luci-app-telego/root/usr/libexec/telego-ui-lifecycle > "$tmp/lifecycle"
chmod +x "$tmp/lifecycle"

field() {
	printf '%s\n' "$1" | sed -n "s/^$2=//p" | head -n1
}

status="$("$tmp/lifecycle" status)"
[ "$(field "$status" ok)" = 1 ]
[ "$(field "$status" running)" = 0 ]
[ "$(field "$status" autostart)" = 0 ]
[ "$(field "$status" config_enabled)" = 1 ]
[ "$(field "$status" busy)" = 0 ]
revision0="$(field "$status" state_revision)"
case "$revision0" in
	????????????????????????????????????????????????????????????????) ;;
	*) echo "bad initial revision" >&2; exit 1 ;;
esac

invalid="$("$tmp/lifecycle" action arbitrary request-0001 "$revision0")"
[ "$(field "$invalid" error)" = invalid-action ]
[ ! -s "$state/calls" ]

start="$("$tmp/lifecycle" action start request-0001 "$revision0")"
[ "$(field "$start" ok)" = 1 ]
[ "$(field "$start" state)" = completed ]
[ "$(field "$start" operation_id)" = request-0001 ]
[ "$(cat "$state/running")" = 1 ]
[ "$(grep -c '^start$' "$state/calls")" -eq 1 ]

# Same logical request is idempotent: no second service mutation.
duplicate="$("$tmp/lifecycle" action start request-0001 "$revision0")"
[ "$(field "$duplicate" ok)" = 1 ]
[ "$(field "$duplicate" state)" = completed ]
[ "$(grep -c '^start$' "$state/calls")" -eq 1 ]

conflict="$("$tmp/lifecycle" action stop request-0001 "$revision0")"
[ "$(field "$conflict" error)" = request-id-conflict ]
[ "$(cat "$state/running")" = 1 ]

op="$("$tmp/lifecycle" operation-status request-0001)"
[ "$(field "$op" ok)" = 1 ]
[ "$(field "$op" state)" = completed ]
[ "$(field "$op" message)" = service-started ]

unknown="$("$tmp/lifecycle" operation-status request-unknown)"
[ "$(field "$unknown" ok)" = 1 ]
[ "$(field "$unknown" state)" = unknown ]

status="$("$tmp/lifecycle" status)"
revision1="$(field "$status" state_revision)"
[ "$revision1" != "$revision0" ]

stale="$("$tmp/lifecycle" action restart request-0002 "$revision0")"
[ "$(field "$stale" ok)" = 0 ]
[ "$(field "$stale" error)" = revision-conflict ]
[ "$(grep -c '^restart$' "$state/calls" || true)" -eq 0 ]

# A failed request is also deduplicated and never becomes a mutation later.
stale_again="$("$tmp/lifecycle" action restart request-0002 "$revision0")"
[ "$(field "$stale_again" error)" = revision-conflict ]
[ "$(grep -c '^restart$' "$state/calls" || true)" -eq 0 ]

restart="$("$tmp/lifecycle" action restart request-0003 "$revision1")"
[ "$(field "$restart" ok)" = 1 ]
[ "$(grep -c '^restart$' "$state/calls")" -eq 1 ]

status="$("$tmp/lifecycle" status)"
revision2="$(field "$status" state_revision)"
enable="$("$tmp/lifecycle" action enable_autostart request-0004 "$revision2")"
[ "$(field "$enable" ok)" = 1 ]
[ "$(cat "$state/autostart")" = 1 ]

status="$("$tmp/lifecycle" status)"
revision3="$(field "$status" state_revision)"
disable="$("$tmp/lifecycle" action disable_autostart request-0005 "$revision3")"
[ "$(field "$disable" ok)" = 1 ]
[ "$(cat "$state/autostart")" = 0 ]

status="$("$tmp/lifecycle" status)"
revision4="$(field "$status" state_revision)"
stop="$("$tmp/lifecycle" action stop request-0006 "$revision4")"
[ "$(field "$stop" ok)" = 1 ]
[ "$(cat "$state/running")" = 0 ]

printf '0\n' > "$state/config_enabled"
status="$("$tmp/lifecycle" status)"
revision5="$(field "$status" state_revision)"
disabled_start="$("$tmp/lifecycle" action start request-0007 "$revision5")"
[ "$(field "$disabled_start" ok)" = 0 ]
[ "$(field "$disabled_start" error)" = config-disabled ]
[ "$(cat "$state/running")" = 0 ]

# Lock contention is reported without creating or repeating an operation.
exec 7>"$tmp/lifecycle.lock"
flock -n 7
busy="$("$tmp/lifecycle" action stop request-0008 "$revision5")"
[ "$(field "$busy" ok)" = 0 ]
[ "$(field "$busy" error)" = busy ]
[ "$(field "$busy" state)" = running ]
flock -u 7
exec 7>&-

bad_id="$("$tmp/lifecycle" operation-status '../../etc/passwd')"
[ "$(field "$bad_id" error)" = invalid-operation-id ]

# Operation files are private and bounded by hashed names, never request paths.
find "$tmp/ops" -maxdepth 1 -type f -print | while read -r file; do
	case "$(basename "$file")" in
		op-????????????????????????????????????????????????????????????????) ;;
		*) echo "unsafe operation filename: $file" >&2; exit 1 ;;
	esac
	[ "$(stat -c %a "$file")" = 600 ]
done

echo "P6.4 lifecycle helper tests passed"
