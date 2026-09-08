#!/bin/sh
# Verify the service uses OpenWrt's account API without adduser/addgroup.
set -e
. package/telego-pkg/files/init.d/telego
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
group_add_next() { printf '32769\n'; }
user_exists() { test -f "$tmp/user"; }
user_add() {
    test "$1" = telego
    test -z "$2"
    test "$3" = 32769
    test "$5" = /var/run/telego
    test "$6" = /bin/false
    printf created > "$tmp/user"
}
adduser() { echo 'Unexpected adduser dependency' >&2; exit 1; }
addgroup() { echo 'Unexpected addgroup dependency' >&2; exit 1; }
ensure_service_account
test "$(cat "$tmp/user")" = created
# An existing account must not be recreated or have its attributes overwritten.
user_add() { return 99; }
ensure_service_account
group_add_next() { return 1; }
if ensure_service_account; then
    echo 'Group creation failure was ignored' >&2
    exit 1
fi
echo 'OpenWrt service account tests passed'
