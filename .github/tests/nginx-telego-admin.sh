#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
ADMIN="$ROOT/package/nginx-telego/files/usr/libexec/nginx-telego-admin"
FLOCK_BIN=$(command -v flock)
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
rootfs="$work/rootfs"
mkdir -p "$rootfs/etc/nginx/conf.d" "$rootfs/etc/nginx/snippets" "$rootfs/usr/share/nginx-telego/templates" "$rootfs/usr/share/nginx-telego" "$rootfs/var/lock"
printf 'core canonical\n' >"$rootfs/usr/share/nginx-telego/templates/20-telego-core.conf"
printf 'locations canonical\n' >"$rootfs/usr/share/nginx-telego/templates/telego.locations"
cp "$rootfs/usr/share/nginx-telego/templates/20-telego-core.conf" "$rootfs/etc/nginx/conf.d/20-telego-core.conf"
cp "$rootfs/usr/share/nginx-telego/templates/telego.locations" "$rootfs/etc/nginx/snippets/telego.locations"
: >"$rootfs/usr/share/nginx-telego/ownership.tsv"
: >"$rootfs/etc/nginx/uci.conf"

cat >"$work/files" <<'SH'
#!/bin/sh
set -eu
ROOT=${NGINX_TELEGO_ROOT:?}
case "$1" in
  validate) exit 0 ;;
  status)
    core="$ROOT/etc/nginx/conf.d/20-telego-core.conf"
    core_src="$ROOT/usr/share/nginx-telego/templates/20-telego-core.conf"
    if [ -L "$core" ] || { [ -e "$core" ] && [ ! -f "$core" ]; }; then core_state=invalid-type
    elif [ ! -e "$core" ]; then core_state=missing
    elif cmp -s "$core" "$core_src"; then core_state=ok
    else core_state=modified
    fi
    printf '/etc/nginx/conf.d/20-telego-core.conf\tcore\tpackage\trequired\t%s\t/usr/share/nginx-telego/templates/20-telego-core.conf\n' "$core_state"
    loc="$ROOT/etc/nginx/snippets/telego.locations"
    loc_src="$ROOT/usr/share/nginx-telego/templates/telego.locations"
    if [ -L "$loc" ] || { [ -e "$loc" ] && [ ! -f "$loc" ]; }; then loc_state=invalid-type
    elif [ ! -e "$loc" ]; then loc_state=missing
    elif cmp -s "$loc" "$loc_src"; then loc_state=ok
    else loc_state=modified
    fi
    printf '/etc/nginx/snippets/telego.locations\tlocations\tpackage\trequired\t%s\t/usr/share/nginx-telego/templates/telego.locations\n' "$loc_state"
    for spec in '80-telego-ingress.conf ingress' '85-telego-fallback.conf fallback'; do
      set -- $spec
      p="$ROOT/etc/nginx/conf.d/$1"
      if [ -L "$p" ] || { [ -e "$p" ] && [ ! -f "$p" ]; }; then state=invalid-type
      elif [ ! -e "$p" ]; then state=absent
      elif grep -Fqx '# managed-test' "$p" 2>/dev/null; then state=managed
      else state=foreign
      fi
      printf '/etc/nginx/conf.d/%s\t%s\tgenerated\tconditional\t%s\trenderer\n' "$1" "$2" "$state"
    done
    ;;
  *) exit 2 ;;
esac
SH
chmod +x "$work/files"

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
 reload)
   printf 'reload\n' >>"$NGINX_RELOAD_LOG"
   [ "${NGINX_RELOAD_FAIL:-0}" != 1 ]
   ;;
 *) exit 0 ;;
esac
SH
chmod +x "$work/nginx-init"

cat >"$work/reconcile" <<'SH'
#!/bin/sh
printf '%s\n' "$*" >>"$RECONCILE_LOG"
[ "$1" = apply ]
SH
chmod +x "$work/reconcile"

export NGINX_TELEGO_ROOT="$rootfs"
export NGINX_TELEGO_FILES="$work/files"
export NGINX_TELEGO_RECONCILE="$work/reconcile"
export NGINX_TELEGO_MANIFEST="$rootfs/usr/share/nginx-telego/ownership.tsv"
export NGINX_TELEGO_CONF_DIR="$rootfs/etc/nginx/conf.d"
export NGINX_TELEGO_QUARANTINE_DIR="$rootfs/etc/nginx-telego/quarantine"
export NGINX_TELEGO_FLOCK_BIN="$FLOCK_BIN"
export NGINX_TELEGO_LOCK_FILE="$work/reconcile.lock"
export NGINX_BIN="$work/nginx"
export NGINX_CONF="$rootfs/etc/nginx/uci.conf"
export NGINX_INIT="$work/nginx-init"
export NGINX_LOG="$work/nginx.log"
export NGINX_RELOAD_LOG="$work/reload.log"
export RECONCILE_LOG="$work/reconcile.log"
: >"$NGINX_LOG"; : >"$NGINX_RELOAD_LOG"; : >"$RECONCILE_LOG"

conf="$rootfs/etc/nginx/conf.d"
q="$rootfs/etc/nginx-telego/quarantine"

printf 'server custom;\n' >"$conf/50-custom.conf"
"$ADMIN" inventory >"$work/inventory"
grep -Fq $'managed\t20-telego-core.conf\t/etc/nginx/conf.d/20-telego-core.conf\tcore\tpackage\tok' "$work/inventory"
grep -Fq $'foreign\t50-custom.conf\t/etc/nginx/conf.d/50-custom.conf\t-\tforeign\tactive' "$work/inventory"

"$ADMIN" quarantine 50-custom.conf
test ! -e "$conf/50-custom.conf"
test -f "$q/50-custom.conf.disabled"
[[ $(wc -l <"$NGINX_RELOAD_LOG") == 1 ]]
"$ADMIN" inventory | grep -Fq $'quarantined\t50-custom.conf\t/etc/nginx-telego/quarantine/50-custom.conf.disabled'

"$ADMIN" restore 50-custom.conf
test -f "$conf/50-custom.conf"
test ! -e "$q/50-custom.conf.disabled"
[[ $(wc -l <"$NGINX_RELOAD_LOG") == 2 ]]

"$ADMIN" delete-active 50-custom.conf
test ! -e "$conf/50-custom.conf"
[[ $(wc -l <"$NGINX_RELOAD_LOG") == 3 ]]

printf 'delete me\n' >"$conf/51-delete.conf"
"$ADMIN" quarantine 51-delete.conf
reloads=$(wc -l <"$NGINX_RELOAD_LOG")
"$ADMIN" delete-quarantined 51-delete.conf
test ! -e "$q/51-delete.conf.disabled"
[[ $(wc -l <"$NGINX_RELOAD_LOG") == "$reloads" ]]

# Package-owned files can never be mutated by P8.
if "$ADMIN" quarantine 20-telego-core.conf >"$work/core.out" 2>&1; then
  echo 'package-owned core was unexpectedly quarantined' >&2; exit 1
fi
grep -q 'refusing to mutate nginx-telego-owned path' "$work/core.out"

# Generated foreign occupants may be quarantined/restored; managed ones may not.
printf 'foreign reserved\n' >"$conf/85-telego-fallback.conf"
"$ADMIN" quarantine 85-telego-fallback.conf
test -f "$q/85-telego-fallback.conf.disabled"
"$ADMIN" restore 85-telego-fallback.conf
grep -q 'foreign reserved' "$conf/85-telego-fallback.conf"
printf '# managed-test\n' >"$conf/85-telego-fallback.conf"
if "$ADMIN" delete-active 85-telego-fallback.conf >"$work/managed.out" 2>&1; then
  echo 'managed generated file was unexpectedly deleted' >&2; exit 1
fi
grep -q 'refusing to mutate nginx-telego-owned path' "$work/managed.out"
rm -f "$conf/85-telego-fallback.conf"

# Symlinks are visible as unsafe but never actionable.
ln -s /tmp/elsewhere "$conf/52-link.conf"
"$ADMIN" inventory | grep -Fq $'foreign\t52-link.conf\t/etc/nginx/conf.d/52-link.conf\t-\tforeign\tinvalid-type'
if "$ADMIN" quarantine 52-link.conf >"$work/link.out" 2>&1; then
  echo 'symlink foreign file was unexpectedly quarantined' >&2; exit 1
fi
grep -q 'refusing to mutate symlink' "$work/link.out"
rm -f "$conf/52-link.conf"

# nginx -t failure rolls quarantine back.
printf 'test fail\n' >"$conf/53-test-fail.conf"
export NGINX_TEST_FAIL=1
if "$ADMIN" quarantine 53-test-fail.conf >"$work/testfail.out" 2>&1; then
  echo 'quarantine unexpectedly survived nginx -t failure' >&2; exit 1
fi
unset NGINX_TEST_FAIL
test -f "$conf/53-test-fail.conf"
test ! -e "$q/53-test-fail.conf.disabled"
grep -q 'active-tree change was rolled back' "$work/testfail.out"

# Reload failure also rolls back.
printf 'reload fail\n' >"$conf/54-reload-fail.conf"
export NGINX_RELOAD_FAIL=1
if "$ADMIN" quarantine 54-reload-fail.conf >"$work/reloadfail.out" 2>&1; then
  echo 'quarantine unexpectedly survived reload failure' >&2; exit 1
fi
unset NGINX_RELOAD_FAIL
test -f "$conf/54-reload-fail.conf"
test ! -e "$q/54-reload-fail.conf.disabled"
grep -q 'active-tree change was rolled back' "$work/reloadfail.out"

# Restore failure rolls back into quarantine.
"$ADMIN" quarantine 54-reload-fail.conf
export NGINX_TEST_FAIL=1
if "$ADMIN" restore 54-reload-fail.conf >"$work/restorefail.out" 2>&1; then
  echo 'restore unexpectedly survived nginx -t failure' >&2; exit 1
fi
unset NGINX_TEST_FAIL
test ! -e "$conf/54-reload-fail.conf"
test -f "$q/54-reload-fail.conf.disabled"

# Collision never overwrites an existing quarantine copy.
printf 'active\n' >"$conf/55-collision.conf"
printf 'saved\n' >"$q/55-collision.conf.disabled"
if "$ADMIN" quarantine 55-collision.conf >"$work/collision.out" 2>&1; then
  echo 'quarantine collision unexpectedly overwrote saved file' >&2; exit 1
fi
grep -qx 'active' "$conf/55-collision.conf"
grep -qx 'saved' "$q/55-collision.conf.disabled"

# Managed inspection is role-scoped, not arbitrary-path file read.
printf 'core modified\n' >"$conf/20-telego-core.conf"
[[ $("$ADMIN" inspect-managed core source) == 'core canonical' ]]
[[ $("$ADMIN" inspect-managed core active) == 'core modified' ]]
if "$ADMIN" inspect-managed ingress active >"$work/inspect.out" 2>&1; then
  echo 'generated role unexpectedly exposed through package inspection' >&2; exit 1
fi
grep -q 'invalid managed role' "$work/inspect.out"

# repair delegates to P7 instead of nesting the same flock.
"$ADMIN" repair
grep -qx 'apply' "$RECONCILE_LOG"

# Concurrent writer is rejected by the shared P7/P8 lock.
exec 8>>"$NGINX_TELEGO_LOCK_FILE"
"$FLOCK_BIN" -n 8
if "$ADMIN" inventory >"$work/locked.out" 2>&1; then
  echo 'admin unexpectedly acquired an already-held reconciliation flock' >&2; exit 1
fi
grep -q 'another Nginx configuration operation is already running' "$work/locked.out"
exec 8>&-

# Unsafe lock paths are refused.
rm -f "$NGINX_TELEGO_LOCK_FILE"
mkdir "$NGINX_TELEGO_LOCK_FILE"
if "$ADMIN" inventory >"$work/locktype.out" 2>&1; then
  echo 'admin unexpectedly accepted a directory lock path' >&2; exit 1
fi
grep -q 'lock path is not a regular file' "$work/locktype.out"
rmdir "$NGINX_TELEGO_LOCK_FILE"

# Unsupported filenames are not exposed as actionable entries; inventory reports a warning count.
printf 'odd name\n' >"$conf/bad name.conf"
"$ADMIN" inventory | grep -Fq $'meta\t-\t-\t-\t-\tunsafe-name\t1'
rm -f "$conf/bad name.conf"

# Quarantine storage itself may not be redirected through a symlink.
rm -rf "$q"
ln -s "$work/elsewhere" "$q"
printf 'symlink qdir\n' >"$conf/56-qdir.conf"
if "$ADMIN" quarantine 56-qdir.conf >"$work/qdir.out" 2>&1; then
  echo 'symlink quarantine directory unexpectedly accepted' >&2; exit 1
fi
grep -q 'quarantine path is not a real directory' "$work/qdir.out"
rm -f "$q" "$conf/56-qdir.conf"

# Invalid names never enter filesystem operations.
if "$ADMIN" quarantine '../evil.conf' >"$work/name.out" 2>&1; then
  echo 'path traversal name unexpectedly accepted' >&2; exit 1
fi
grep -q 'invalid conf.d file name' "$work/name.out"

printf 'nginx-telego P8 admin tests passed.\n'
