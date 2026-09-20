#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
HELPER="$ROOT_DIR/package/telego-pkg/files/usr/libexec/telego-package-reconcile"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT HUP INT TERM

ETC="$TMP/etc"
BACKUPS="$TMP/backups"
UCI_STATE="$TMP/uci-sections"
UCI_LOG="$TMP/uci-batch.log"
FAKE_UCI="$TMP/uci"
mkdir -p "$ETC/init.d" "$ETC/capabilities" "$ETC/config"
printf '%s\n' 'general' 'tls_fronting' >"$UCI_STATE"
: >"$UCI_LOG"
cat >"$FAKE_UCI" <<'EOF'
#!/bin/sh
set -eu
[ "${1:-}" = -c ] && shift 2
[ "${1:-}" = -q ] && shift
cmd=${1:-}
shift || true
case "$cmd" in
    get)
        key=${1:-}
        section=${key#telego.}
        grep -Fqx "$section" "$TELEGO_FAKE_UCI_STATE" || exit 1
        printf '%s\n' "$section"
        ;;
    batch)
        while IFS= read -r line; do
            printf '%s\n' "$line" >>"$TELEGO_FAKE_UCI_LOG"
            case "$line" in
                "set telego."*=*)
                    section=${line#set telego.}
                    section=${section%%=*}
                    grep -Fqx "$section" "$TELEGO_FAKE_UCI_STATE" ||
                        printf '%s\n' "$section" >>"$TELEGO_FAKE_UCI_STATE"
                    ;;
            esac
        done
        ;;
    commit) ;;
    *) exit 1 ;;
esac
EOF
chmod 0755 "$FAKE_UCI"
printf '%s\n' "config general 'general'" >"$ETC/config/telego"

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
TELEGO_UCI_BIN="$FAKE_UCI" \
TELEGO_UCI_CONFIG_DIR="$ETC/config" \
TELEGO_FAKE_UCI_STATE="$UCI_STATE" \
TELEGO_FAKE_UCI_LOG="$UCI_LOG" \
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

# Missing fixed UCI sections are created with defaults, while existing sections
# are never rewritten.
for section in web_proxy middle_end performance upstream metrics; do
    grep -Fqx "$section" "$UCI_STATE"
    grep -Fq "set telego.$section=$section" "$UCI_LOG"
done
! grep -Fq 'set telego.general=' "$UCI_LOG"
! grep -Fq 'set telego.tls_fronting=' "$UCI_LOG"
grep -Fq "add_list telego.web_proxy.trusted_proxy_cidrs='127.0.0.1/32'" "$UCI_LOG"

# Re-running migration is idempotent.
: >"$UCI_LOG"

# No candidate is a no-op.
TELEGO_ETC_ROOT="$ETC" \
TELEGO_PACKAGE_BACKUP_ROOT="$BACKUPS" \
TELEGO_UCI_BIN="$FAKE_UCI" \
TELEGO_UCI_CONFIG_DIR="$ETC/config" \
TELEGO_FAKE_UCI_STATE="$UCI_STATE" \
TELEGO_FAKE_UCI_LOG="$UCI_LOG" \
sh "$HELPER"

grep -Fqx 'new telego init' "$ETC/init.d/telego"
[ ! -s "$UCI_LOG" ]

# Unsafe candidates are rejected and the active package-owned path is preserved.
ln -s /tmp/nowhere "$ETC/init.d/telego.apk-new"
if TELEGO_ETC_ROOT="$ETC" TELEGO_PACKAGE_BACKUP_ROOT="$BACKUPS" \
    TELEGO_UCI_BIN="$FAKE_UCI" TELEGO_UCI_CONFIG_DIR="$ETC/config" \
    TELEGO_FAKE_UCI_STATE="$UCI_STATE" TELEGO_FAKE_UCI_LOG="$UCI_LOG" \
    sh "$HELPER" 2>/dev/null; then
    echo 'unsafe symlink candidate was unexpectedly accepted' >&2
    exit 1
fi
grep -Fqx 'new telego init' "$ETC/init.d/telego"
rm -f "$ETC/init.d/telego.apk-new"

echo 'package-owned apk-new reconciliation tests passed'
