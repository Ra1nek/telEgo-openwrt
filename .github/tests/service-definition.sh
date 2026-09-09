#!/bin/bash
# Exercise the real start_service definition with a mock procd/UCI boundary.
set -euo pipefail
source package/telego-pkg/files/init.d/telego
test_dir=$(mktemp -d)
trap 'rm -rf -- "$test_dir"' EXIT
RUNTIME_CONFIG="$test_dir/telego.toml"
CAPS="$test_dir/caps.json"
PROG=/bin/true
touch "$CAPS"

ensure_service_account() { :; }
config_load() { :; }
config_get_bool() { printf -v "$1" '%s' "$fixture_enabled"; }
generate_config() { printf '%s\n' "$fixture_secret" > "$RUNTIME_CONFIG"; }
# Only emulate the router-specific ujail executable check.
[() {
	if [[ $# == 3 && $1 == -x && $2 == /sbin/ujail && $3 == ']' ]]; then return 0; fi
	builtin [ "$@"
}
procd_open_instance() { instance_count=$((instance_count + 1)); }
procd_close_instance() { :; }
procd_add_jail() { :; }
procd_add_jail_mount() { :; }
procd_add_jail_mount_rw() { :; }
procd_set_param() {
	case "$1" in
		file) instance_checksum=$(sha256sum "$2") ;;
		reload_signal) echo 'Unexpected signal-only reload' >&2; exit 1 ;;
	esac
}
definition() {
	instance_count=0
	instance_checksum=
	start_service
}
# rc.common uses its standard start/update path only if no override is defined.
if declare -F reload_service >/dev/null; then
	echo 'Unexpected custom reload handler' >&2
	exit 1
fi

# With USE_PROCD=1 rc.common owns instance termination. A custom stop_service
# that calls procd_kill causes a second kill and makes stop/restart fail noisily.
if declare -F stop_service >/dev/null; then
	echo 'Unexpected custom stop handler' >&2
	exit 1
fi

fixture_enabled=0
fixture_secret=old-secret
definition
[[ $instance_count == 0 ]]

fixture_enabled=1
definition
[[ $instance_count == 1 && -n $instance_checksum ]]
old_checksum=$instance_checksum
definition
[[ $instance_checksum == "$old_checksum" ]]

fixture_secret=new-secret
definition
[[ $instance_count == 1 && $instance_checksum != "$old_checksum" ]]

fixture_enabled=0
definition
[[ $instance_count == 0 ]]
fixture_enabled=1
definition
[[ $instance_count == 1 ]]
echo 'procd service definition tests passed'
