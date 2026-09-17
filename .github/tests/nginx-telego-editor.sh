#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

EDITOR=package/nginx-telego/files/usr/libexec/nginx-telego-editor
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT

root=$work/root
mkdir -p "$root/etc/nginx/conf.d" "$root/etc/nginx" "$root/etc/init.d" "$root/usr/bin" "$root/usr/libexec" "$root/usr/share/nginx-telego" "$root/var/lock"
cp "$EDITOR" "$root/usr/libexec/nginx-telego-editor"
chmod 0755 "$root/usr/libexec/nginx-telego-editor"

cat >"$root/usr/libexec/nginx-telego-files" <<'EOF'
#!/bin/sh
case "$1" in
  validate) exit 0 ;;
  status)
    printf '/etc/nginx/conf.d/20-telego-core.conf\tcore\tpackage\trequired\tok\t/usr/share/nginx-telego/templates/20-telego-core.conf\n'
    printf '/etc/nginx/conf.d/80-telego-ingress.conf\tingress\tgenerated\tconditional\tforeign\trenderer\n'
    printf '/etc/nginx/conf.d/85-telego-fallback.conf\tfallback\tgenerated\tconditional\tmanaged\trenderer\n'
    ;;
  *) exit 2 ;;
esac
EOF
chmod 0755 "$root/usr/libexec/nginx-telego-files"
ln -s "$(command -v flock)" "$root/usr/bin/flock"
printf 'events {}\n' >"$root/etc/nginx/uci.conf"

cat >"$root/nginx" <<'EOF'
#!/bin/sh
[ "${NGINX_TEST_MODE:-ok}" = fail ] && exit 1
exit 0
EOF
chmod 0755 "$root/nginx"

cat >"$root/etc/init.d/nginx" <<'EOF'
#!/bin/sh
case "$1" in
  status) exit 0 ;;
  reload)
    [ "${NGINX_RELOAD_MODE:-ok}" = fail ] && exit 1
    printf 'reload\n' >>"${NGINX_RELOAD_LOG:?}"
    exit 0
    ;;
  *) exit 0 ;;
esac
EOF
chmod 0755 "$root/etc/init.d/nginx"

export NGINX_TELEGO_ROOT="$root"
export NGINX_BIN="$root/nginx"
export NGINX_RELOAD_LOG="$work/reloads.log"
run_editor() { "$root/usr/libexec/nginx-telego-editor" "$@"; }

# P9 inspect/replace regression.
printf '# custom\nserver {}\n' >"$root/etc/nginx/conf.d/50-custom.conf"
chmod 0640 "$root/etc/nginx/conf.d/50-custom.conf"
original_revision=$(sha256sum "$root/etc/nginx/conf.d/50-custom.conf" | awk '{print $1}')
inspect=$(run_editor inspect 50-custom.conf)
[[ "$inspect" == "$original_revision"$'\t19\n# custom\nserver {}' ]]
[[ $(stat -c '%a' "$root/etc/nginx/conf.d/50-custom.conf") == 640 ]]

printf '# changed\nserver {}\n' | run_editor replace 50-custom.conf "$original_revision" | grep -qx updated
[[ $(stat -c '%a' "$root/etc/nginx/conf.d/50-custom.conf") == 640 ]]
[[ $(wc -l <"$work/reloads.log") -eq 1 ]]
changed_revision=$(sha256sum "$root/etc/nginx/conf.d/50-custom.conf" | awk '{print $1}')
cat "$root/etc/nginx/conf.d/50-custom.conf" | run_editor replace 50-custom.conf "$changed_revision" | grep -qx unchanged
[[ $(wc -l <"$work/reloads.log") -eq 1 ]]

set +e
printf '# stale\n' | run_editor replace 50-custom.conf "$original_revision" >/dev/null 2>&1
rc=$?
set -e
[[ "$rc" -eq 3 ]]

# P10 create: new foreign files only, reserved/managed targets denied.
printf '# created by P10\n' | run_editor create 55-created.conf | grep -qx created
[[ -f "$root/etc/nginx/conf.d/55-created.conf" ]]
grep -qx '# created by P10' "$root/etc/nginx/conf.d/55-created.conf"
[[ $(stat -c '%a' "$root/etc/nginx/conf.d/55-created.conf") == 644 ]]
[[ $(wc -l <"$work/reloads.log") -eq 2 ]]

set +e
printf '# duplicate\n' | run_editor create 55-created.conf >/dev/null 2>&1
rc=$?
set -e
[[ "$rc" -eq 5 ]]
grep -qx '# created by P10' "$root/etc/nginx/conf.d/55-created.conf"

set +e
printf '# forbidden\n' | run_editor create 20-telego-core.conf >/dev/null 2>&1
rc=$?
set -e
[[ "$rc" -eq 6 ]]
set +e
printf '# forbidden\n' | run_editor create 80-telego-ingress.conf >/dev/null 2>&1
rc=$?
set -e
[[ "$rc" -eq 6 ]]

export NGINX_TEST_MODE=fail
set +e
printf '# invalid create\n' | run_editor create 56-invalid-create.conf >/dev/null 2>&1
rc=$?
set -e
unset NGINX_TEST_MODE
[[ "$rc" -eq 1 ]]
[[ ! -e "$root/etc/nginx/conf.d/56-invalid-create.conf" ]]

export NGINX_RELOAD_MODE=fail
set +e
printf '# reload create\n' | run_editor create 56-reload-create.conf >/dev/null 2>&1
rc=$?
set -e
unset NGINX_RELOAD_MODE
[[ "$rc" -eq 1 ]]
[[ ! -e "$root/etc/nginx/conf.d/56-reload-create.conf" ]]

set +e
python3 - <<'PY' | run_editor create 56-too-large.conf >/dev/null 2>&1
import sys
sys.stdout.write('x' * 65537)
PY
rc=$?
set -e
[[ "$rc" -eq 4 ]]
[[ ! -e "$root/etc/nginx/conf.d/56-too-large.conf" ]]

# P10 rename: active foreign source, absent unmanaged target, optimistic revision.
create_revision=$(sha256sum "$root/etc/nginx/conf.d/55-created.conf" | awk '{print $1}')
run_editor rename 55-created.conf 56-renamed.conf "$create_revision" | grep -qx renamed
[[ ! -e "$root/etc/nginx/conf.d/55-created.conf" ]]
[[ -f "$root/etc/nginx/conf.d/56-renamed.conf" ]]
grep -qx '# created by P10' "$root/etc/nginx/conf.d/56-renamed.conf"

printf '# occupied target\n' >"$root/etc/nginx/conf.d/57-target.conf"
rename_revision=$(sha256sum "$root/etc/nginx/conf.d/56-renamed.conf" | awk '{print $1}')
set +e
run_editor rename 56-renamed.conf 57-target.conf "$rename_revision" >/dev/null 2>&1
rc=$?
set -e
[[ "$rc" -eq 5 ]]
[[ -f "$root/etc/nginx/conf.d/56-renamed.conf" ]]

set +e
run_editor rename 56-renamed.conf 20-telego-core.conf "$rename_revision" >/dev/null 2>&1
rc=$?
set -e
[[ "$rc" -eq 6 ]]

printf '# external change\n' >>"$root/etc/nginx/conf.d/56-renamed.conf"
set +e
run_editor rename 56-renamed.conf 58-stale.conf "$rename_revision" >/dev/null 2>&1
rc=$?
set -e
[[ "$rc" -eq 3 ]]
[[ -f "$root/etc/nginx/conf.d/56-renamed.conf" ]]
[[ ! -e "$root/etc/nginx/conf.d/58-stale.conf" ]]
rename_revision=$(sha256sum "$root/etc/nginx/conf.d/56-renamed.conf" | awk '{print $1}')

export NGINX_TEST_MODE=fail
set +e
run_editor rename 56-renamed.conf 58-invalid-rename.conf "$rename_revision" >/dev/null 2>&1
rc=$?
set -e
unset NGINX_TEST_MODE
[[ "$rc" -eq 1 ]]
[[ -f "$root/etc/nginx/conf.d/56-renamed.conf" ]]
[[ ! -e "$root/etc/nginx/conf.d/58-invalid-rename.conf" ]]

export NGINX_RELOAD_MODE=fail
set +e
run_editor rename 56-renamed.conf 58-reload-rename.conf "$rename_revision" >/dev/null 2>&1
rc=$?
set -e
unset NGINX_RELOAD_MODE
[[ "$rc" -eq 1 ]]
[[ -f "$root/etc/nginx/conf.d/56-renamed.conf" ]]
[[ ! -e "$root/etc/nginx/conf.d/58-reload-rename.conf" ]]

run_editor rename 56-renamed.conf 58-final.conf "$rename_revision" | grep -qx renamed
[[ ! -e "$root/etc/nginx/conf.d/56-renamed.conf" ]]
[[ -f "$root/etc/nginx/conf.d/58-final.conf" ]]

# Reserved generated source is editable/renameable only while explicitly foreign.
printf '# foreign reserved\n' >"$root/etc/nginx/conf.d/80-telego-ingress.conf"
reserved_revision=$(sha256sum "$root/etc/nginx/conf.d/80-telego-ingress.conf" | awk '{print $1}')
printf '# edited reserved\n' | run_editor replace 80-telego-ingress.conf "$reserved_revision" >/dev/null
reserved_revision=$(sha256sum "$root/etc/nginx/conf.d/80-telego-ingress.conf" | awk '{print $1}')
run_editor rename 80-telego-ingress.conf 81-reserved-moved.conf "$reserved_revision" | grep -qx renamed
[[ ! -e "$root/etc/nginx/conf.d/80-telego-ingress.conf" ]]
[[ -f "$root/etc/nginx/conf.d/81-reserved-moved.conf" ]]

printf '# managed package\n' >"$root/etc/nginx/conf.d/20-telego-core.conf"
package_revision=$(sha256sum "$root/etc/nginx/conf.d/20-telego-core.conf" | awk '{print $1}')
set +e
printf '# forbidden\n' | run_editor replace 20-telego-core.conf "$package_revision" >/dev/null 2>&1
rc=$?
set -e
[[ "$rc" -eq 1 ]]
set +e
run_editor rename 20-telego-core.conf 70-forbidden.conf "$package_revision" >/dev/null 2>&1
rc=$?
set -e
[[ "$rc" -eq 1 ]]

printf '# managed generated\n' >"$root/etc/nginx/conf.d/85-telego-fallback.conf"
managed_revision=$(sha256sum "$root/etc/nginx/conf.d/85-telego-fallback.conf" | awk '{print $1}')
set +e
printf '# forbidden\n' | run_editor replace 85-telego-fallback.conf "$managed_revision" >/dev/null 2>&1
rc=$?
set -e
[[ "$rc" -eq 1 ]]

set +e
run_editor inspect missing.conf >/dev/null 2>&1
rc=$?
set -e
[[ "$rc" -eq 1 ]]
ln -s 50-custom.conf "$root/etc/nginx/conf.d/60-link.conf"
set +e
run_editor inspect 60-link.conf >/dev/null 2>&1
rc=$?
set -e
[[ "$rc" -eq 1 ]]

# P9 replace rollback remains intact.
revision=$(sha256sum "$root/etc/nginx/conf.d/50-custom.conf" | awk '{print $1}')
export NGINX_TEST_MODE=fail
set +e
printf '# invalid edit\n' | run_editor replace 50-custom.conf "$revision" >/dev/null 2>&1
rc=$?
set -e
unset NGINX_TEST_MODE
[[ "$rc" -eq 1 ]]
grep -q '^# changed$' "$root/etc/nginx/conf.d/50-custom.conf"

revision=$(sha256sum "$root/etc/nginx/conf.d/50-custom.conf" | awk '{print $1}')
export NGINX_RELOAD_MODE=fail
set +e
printf '# reload failure\n' | run_editor replace 50-custom.conf "$revision" >/dev/null 2>&1
rc=$?
set -e
unset NGINX_RELOAD_MODE
[[ "$rc" -eq 1 ]]
grep -q '^# changed$' "$root/etc/nginx/conf.d/50-custom.conf"

revision=$(sha256sum "$root/etc/nginx/conf.d/50-custom.conf" | awk '{print $1}')
set +e
python3 - <<'PY' | run_editor replace 50-custom.conf "$revision" >/dev/null 2>&1
import sys
sys.stdout.write('x' * 65537)
PY
rc=$?
set -e
[[ "$rc" -eq 4 ]]

# P7/P8/P9/P10 all serialize on the same lock.
"$root/usr/bin/flock" "$root/var/lock/nginx-telego-reconcile.lock" -c 'sleep 2' &
locker=$!
sleep 0.1
set +e
printf '# locked\n' | run_editor create 70-lock-test.conf >/dev/null 2>&1
rc=$?
set -e
wait "$locker"
[[ "$rc" -eq 1 ]]
[[ ! -e "$root/etc/nginx/conf.d/70-lock-test.conf" ]]
run_editor inspect 50-custom.conf >/dev/null

printf 'nginx-telego P9/P10 restricted lifecycle tests passed\n'
