#!/usr/bin/env bash
set -euo pipefail

FEED_ROOT=${1:-bin/packages}
mapfile -t matches < <(find "$FEED_ROOT" -type f -name 'nginx-telego-*.apk' -print | sort)
if [[ ${#matches[@]} -ne 1 ]]; then
  printf 'Expected exactly one nginx-telego APK below %s, found %d\n' \
    "$FEED_ROOT" "${#matches[@]}" >&2
  exit 1
fi
apk_file=$(realpath "${matches[0]}")

docker image inspect sdk >/dev/null
work=$(mktemp -d)
cleanup() {
  sudo rm -rf -- "$work"
}
trap cleanup EXIT
mkdir -p "$work/root"

docker run --rm \
  --user 0:0 \
  --entrypoint /bin/bash \
  -v "$apk_file:/tmp/nginx-telego.apk:ro" \
  -v "$work:/verify" \
  sdk -lc '
    set -euo pipefail
    apk_host=/builder/staging_dir/host/bin/apk
    test -x "$apk_host"
    "$apk_host" --allow-untrusted extract \
      --destination /verify/root \
      /tmp/nginx-telego.apk
  '

root=$work/root

assert_regular() {
  local path=$1
  local mode=$2
  local full="$root$path"

  if [[ ! -f "$full" || -L "$full" ]]; then
    printf 'Expected regular file in nginx-telego APK: %s\n' "$path" >&2
    exit 1
  fi
  if [[ $(stat -c '%a' "$full") != "$mode" ]]; then
    printf 'Unexpected mode for %s: got %s, expected %s\n' \
      "$path" "$(stat -c '%a' "$full")" "$mode" >&2
    exit 1
  fi
  if [[ $(stat -c '%u:%g' "$full") != '0:0' ]]; then
    printf 'Unexpected owner for %s: got %s, expected 0:0\n' \
      "$path" "$(stat -c '%u:%g' "$full")" >&2
    exit 1
  fi
}

assert_regular /etc/nginx/conf.d/telego.conf 644
assert_regular /etc/nginx/snippets/telego.locations 644
assert_regular /usr/share/nginx-telego/templates/telego.conf 644
assert_regular /usr/share/nginx-telego/templates/telego.locations 644
assert_regular /usr/share/nginx-telego/ownership.tsv 644
assert_regular /usr/libexec/nginx-telego-files 755
assert_regular /usr/libexec/nginx-telego-render 755

printf 'nginx-telego APK ownership layout verified: %s\n' "$apk_file"
