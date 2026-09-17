#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
HELPER="$ROOT_DIR/package/telego-pkg/files/usr/libexec/telego-package-reconcile"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT HUP INT TERM

ETC="$TMP/etc"
BACKUPS="$TMP/backups"
mkdir -p "$ETC/init.d" "$ETC/capabilities"

printf '%s\n' 'old telego init' > "$ETC/init.d/telego"
printf '%s\n' 'old nginx init' > "$ETC/init.d/nginx-telego"
printf '%s\n' 'old capabilities' > "$ETC/capabilities/telego.json"
chmod 0755 "$ETC/init.d/telego" "$ETC/init.d/nginx-telego"
chmod 0644 "$ETC/capabilities/telego.json"

printf '%s\n' 'new telego init' > "$ETC/init.d/telego.apk-new"
printf '%s\n' 'new nginx init' > "$ETC/init.d/nginx-telego.apk-new"
printf '%s\n' 'new capabilities' > "$ETC/capabilities/telego.json.apk-new"
chmod 0700 "$ETC/init.d/telego.apk-new" "$ETC/init.d/nginx-telego.apk-new"
chmod 0600 "$ETC/capabilities/telego.json.apk-new"

TELEGO_ETC_ROOT="$ETC" \
TELEGO_PACKAGE_BACKUP_ROOT="$BACKUPS" \
sh "$HELPER"

grep -Fqx 'new telego init' "$ETC/init.d/telego"
grep -Fqx 'new nginx init' "$ETC/init.d/nginx-telego"
grep -Fqx 'new capabilities' "$ETC/capabilities/telego.json"
[ ! -e "$ETC/init.d/telego.apk-new" ]
[ ! -e "$ETC/init.d/nginx-telego.apk-new" ]
[ ! -e "$ETC/capabilities/telego.json.apk-new" ]
[ "$(stat -c '%a' "$ETC/init.d/telego")" = 755 ]
[ "$(stat -c '%a' "$ETC/init.d/nginx-telego")" = 755 ]
[ "$(stat -c '%a' "$ETC/capabilities/telego.json")" = 644 ]

grep -R -Fqx 'old telego init' "$BACKUPS"
grep -R -Fqx 'old nginx init' "$BACKUPS"
grep -R -Fqx 'old capabilities' "$BACKUPS"

# No candidate is a no-op.
TELEGO_ETC_ROOT="$ETC" \
TELEGO_PACKAGE_BACKUP_ROOT="$BACKUPS" \
sh "$HELPER"

grep -Fqx 'new telego init' "$ETC/init.d/telego"

# Unsafe candidates are rejected and the active package-owned path is preserved.
ln -s /tmp/nowhere "$ETC/init.d/telego.apk-new"
if TELEGO_ETC_ROOT="$ETC" TELEGO_PACKAGE_BACKUP_ROOT="$BACKUPS" sh "$HELPER" 2>/dev/null; then
    echo 'unsafe symlink candidate was unexpectedly accepted' >&2
    exit 1
fi
grep -Fqx 'new telego init' "$ETC/init.d/telego"
rm -f "$ETC/init.d/telego.apk-new"

echo 'package-owned apk-new reconciliation tests passed'
