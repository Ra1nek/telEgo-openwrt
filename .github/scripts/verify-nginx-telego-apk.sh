#!/usr/bin/env bash
set -euo pipefail

FEED_ROOT=${1:-bin/packages}
mapfile -t matches < <(find "$FEED_ROOT" -type f -name 'nginx-telego-*.apk' -print | sort)
if [[ ${#matches[@]} -ne 1 ]]; then
  printf 'Expected exactly one nginx-telego APK below %s, found %d\n' "$FEED_ROOT" "${#matches[@]}" >&2
  exit 1
fi
apk_file=$(realpath "${matches[0]}")

docker image inspect sdk >/dev/null
work=$(mktemp -d)
cleanup() { sudo rm -rf -- "$work"; }
trap cleanup EXIT
mkdir -p "$work/root"

docker run --rm --user 0:0 --entrypoint /bin/bash \
  -v "$apk_file:/tmp/nginx-telego.apk:ro" -v "$work:/verify" sdk -lc '
    set -euo pipefail
    apk_host=/builder/staging_dir/host/bin/apk
    test -x "$apk_host"
    "$apk_host" --allow-untrusted extract --destination /verify/root /tmp/nginx-telego.apk
  '

root=$work/root
assert_regular() {
  local path=$1
  local mode=$2
  local full="$root$path"
  [[ -f "$full" && ! -L "$full" ]] || { printf 'Expected regular file in nginx-telego APK: %s\n' "$path" >&2; exit 1; }
  [[ $(stat -c '%a' "$full") == "$mode" ]] || { printf 'Unexpected mode for %s\n' "$path" >&2; exit 1; }
  [[ $(stat -c '%u:%g' "$full") == '0:0' ]] || { printf 'Unexpected owner for %s\n' "$path" >&2; exit 1; }
}
assert_absent() {
  local path=$1
  [[ ! -e "$root$path" && ! -L "$root$path" ]] || { printf 'Unexpected legacy/generated path in nginx-telego APK: %s\n' "$path" >&2; exit 1; }
}

assert_regular /etc/nginx/conf.d/20-telego-core.conf 644
assert_regular /etc/nginx/snippets/telego.locations 644
assert_regular /usr/share/nginx-telego/templates/20-telego-core.conf 644
assert_regular /usr/share/nginx-telego/templates/telego.locations 644
assert_regular /usr/share/nginx-telego/ownership.tsv 644
assert_regular /usr/libexec/nginx-telego-files 755
assert_regular /usr/libexec/nginx-telego-render 755
assert_regular /usr/libexec/nginx-telego-reconcile 755
assert_regular /usr/libexec/nginx-telego-admin 755
assert_regular /usr/libexec/nginx-telego-editor 755

assert_absent /etc/nginx/conf.d/telego.conf
assert_absent /etc/nginx/conf.d/80-telego-ingress.conf
assert_absent /etc/nginx/conf.d/85-telego-fallback.conf
assert_absent /etc/nginx/conf.d/zz-telego-managed.conf
assert_absent /usr/share/nginx-telego/templates/telego.conf
assert_absent /etc/nginx-telego/quarantine

printf 'nginx-telego final P6/P7/P8/P9 APK layout verified: %s\n' "$apk_file"
