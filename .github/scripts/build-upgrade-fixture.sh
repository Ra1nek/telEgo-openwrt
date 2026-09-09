#!/usr/bin/env bash
set -euo pipefail

OUTPUT_DIR=${1:-upgrade-fixture}
OUTPUT_NAME=telego-upgrade-fixture-0.6.0-r1.apk

mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR=$(cd "$OUTPUT_DIR" && pwd)

# openwrt/gh-action-sdk loads the exact SDK image used for the package build as
# the local Docker image `sdk`. Use its non-minimal host apk-tools to create the
# legacy package fixture; target OpenWrt intentionally ships a minimal apk that
# cannot create packages.
docker image inspect sdk >/dev/null

docker run --rm \
  --user 0:0 \
  --entrypoint /bin/bash \
  -v "$OUTPUT_DIR:/fixture-out" \
  sdk -lc '
    set -euo pipefail

    apk_host=/builder/staging_dir/host/bin/apk
    fixture_root=/tmp/telego-upgrade-fixture
    output=/fixture-out/telego-upgrade-fixture-0.6.0-r1.apk

    test -x "$apk_host"
    rm -rf "$fixture_root"
    mkdir -p "$fixture_root/etc/config" "$fixture_root/usr/bin"

    cat >"$fixture_root/etc/config/telego" <<"EOF"
config general '\''general'\''
	option enabled '\''0'\''
	option bind_to '\''127.0.0.1:1443'\''
	option log_level '\''debug'\''

config secret '\''legacy'\''
	option name '\''legacy'\''
	option secret '\''0123456789abcdef0123456789abcdef'\''
EOF

    cat >"$fixture_root/usr/bin/telego" <<"EOF"
#!/bin/sh
echo legacy
EOF
    chmod 0755 "$fixture_root/usr/bin/telego"

    "$apk_host" mkpkg \
      --info "name:telego-pkg" \
      --info "version:0.6.0-r1" \
      --info "arch:x86_64" \
      --info "description:telEgo installer upgrade fixture" \
      --info "license:MIT" \
      --info "origin:telego-upgrade-fixture" \
      --files "$fixture_root" \
      --output "$output"

    test -s "$output"
  '

sudo chown "$(id -u):$(id -g)" "$OUTPUT_DIR/$OUTPUT_NAME"
test -s "$OUTPUT_DIR/$OUTPUT_NAME"
printf 'Created installer upgrade fixture: %s\n' "$OUTPUT_DIR/$OUTPUT_NAME"
