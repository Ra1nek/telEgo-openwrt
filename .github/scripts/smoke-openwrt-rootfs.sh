#!/usr/bin/env bash
set -euo pipefail

FEED_ROOT=${1:-bin/packages}
OPENWRT_VERSION=${OPENWRT_VERSION:-25.12.5}
OPENWRT_ARCH=${OPENWRT_ARCH:-x86_64}
OPENWRT_TARGET=${OPENWRT_TARGET:-x86/64}
OPENWRT_ROOTFS_FILENAME=${OPENWRT_ROOTFS_FILENAME:-openwrt-${OPENWRT_VERSION}-x86-64-rootfs.tar.gz}
OPENWRT_RELEASE_BASE=${OPENWRT_RELEASE_BASE:-https://downloads.openwrt.org/releases/${OPENWRT_VERSION}/targets/${OPENWRT_TARGET}}
OPENWRT_ROOTFS_URL=${OPENWRT_ROOTFS_URL:-${OPENWRT_RELEASE_BASE}/${OPENWRT_ROOTFS_FILENAME}}
OPENWRT_SHA256SUMS_URL=${OPENWRT_SHA256SUMS_URL:-${OPENWRT_RELEASE_BASE}/sha256sums}
OPENWRT_ROOTFS_SHA256=${OPENWRT_ROOTFS_SHA256:-}

case "$OPENWRT_VERSION" in
  25.12.*) ;;
  *)
    printf 'Unsupported smoke-test release: %s (expected 25.12.x)\n' "$OPENWRT_VERSION" >&2
    exit 1
    ;;
esac

TELEGO_FEED=${FEED_ROOT}/${OPENWRT_ARCH}/telego
EXPECTED=(telego-pkg nginx-telego luci-app-telego luci-i18n-telego-ru)
APKS=()

for pkg in "${EXPECTED[@]}"; do
  mapfile -t matches < <(find "$TELEGO_FEED" -maxdepth 1 -type f -name "${pkg}-*.apk" -print | sort)
  if [[ ${#matches[@]} -ne 1 ]]; then
    printf 'Expected exactly one %s APK in %s, found %d\n' "$pkg" "$TELEGO_FEED" "${#matches[@]}" >&2
    exit 1
  fi
  APKS+=("${matches[0]}")
done

workdir=$(mktemp -d)
rootfs=$workdir/rootfs
mounts=()
cleanup() {
  local i
  for ((i=${#mounts[@]} - 1; i >= 0; i--)); do
    sudo umount -l -- "${mounts[$i]}" 2>/dev/null || true
  done
  sudo rm -rf -- "$workdir"
}
trap cleanup EXIT
mkdir -p "$rootfs"

mount_into_chroot() {
  local source=$1
  local target=$rootfs$1
  sudo mkdir -p "$target"
  sudo mount --bind "$source" "$target"
  mounts+=("$target")
}

resolve_rootfs_sha256() {
  if [[ -n "$OPENWRT_ROOTFS_SHA256" ]]; then
    printf '%s' "$OPENWRT_ROOTFS_SHA256"
    return 0
  fi

  curl --fail --location --silent --show-error --retry 3 --retry-delay 2 \
    "$OPENWRT_SHA256SUMS_URL" -o "$workdir/sha256sums"

  local hash
  hash=$(awk -v filename="$OPENWRT_ROOTFS_FILENAME" '
    $2 == filename || $2 == "*" filename { print $1 }
  ' "$workdir/sha256sums")

  if [[ ! "$hash" =~ ^[0-9a-fA-F]{64}$ ]]; then
    printf 'Could not resolve a unique SHA-256 for %s from %s\n' \
      "$OPENWRT_ROOTFS_FILENAME" "$OPENWRT_SHA256SUMS_URL" >&2
    exit 1
  fi

  printf '%s' "$hash"
}

printf 'Smoke testing telEgo APKs on OpenWrt %s (%s).\n' "$OPENWRT_VERSION" "$OPENWRT_ARCH"
curl --fail --location --silent --show-error --retry 3 --retry-delay 2 \
  "$OPENWRT_ROOTFS_URL" -o "$workdir/rootfs.tar.gz"
rootfs_sha256=$(resolve_rootfs_sha256)
printf '%s  %s\n' "$rootfs_sha256" "$workdir/rootfs.tar.gz" | sha256sum -c -
sudo tar -xzf "$workdir/rootfs.tar.gz" -C "$rootfs"

sudo mkdir -p "$rootfs/tmp/telego-apks"
for apk in "${APKS[@]}"; do
  sudo cp -- "$apk" "$rootfs/tmp/telego-apks/"
done

# OpenWrt's /etc/resolv.conf points into /tmp. Give apk working DNS inside chroot.
sudo cp /etc/resolv.conf "$rootfs/tmp/resolv.conf"

# A release rootfs is a filesystem payload, not a booted system. Bind the host
# kernel pseudo-filesystems so TLS, apk hooks and runtime probes have the
# devices/interfaces they normally get during boot (notably /dev/urandom).
mount_into_chroot /dev
mount_into_chroot /proc
mount_into_chroot /sys

# Do not use `sh -u` here. OpenWrt's own /lib/functions.sh intentionally reads
# unset variables such as IPKG_INSTROOT and treats them as empty. A booted
# OpenWrt also has volatile runtime directories under /var; the tar rootfs does
# not, so create the lock directory before package hooks are executed.
sudo chroot "$rootfs" /bin/sh -e <<'CHROOT'
export HOME=/root
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
mkdir -p /var/lock

install_telego() {
  apk update
  apk add --allow-untrusted \
    /tmp/telego-apks/telego-pkg-*.apk \
    /tmp/telego-apks/nginx-telego-*.apk \
    /tmp/telego-apks/luci-app-telego-*.apk \
    /tmp/telego-apks/luci-i18n-telego-ru-*.apk
}

assert_installed() {
  for pkg in telego-pkg nginx-telego luci-app-telego luci-i18n-telego-ru; do
    apk info -e "$pkg" >/dev/null
  done

  test -x /usr/bin/telego
  /usr/bin/telego version >/tmp/telego-version.txt 2>&1
  test -s /tmp/telego-version.txt

  test -x /etc/init.d/telego
  test -s /etc/config/telego
  test -s /etc/capabilities/telego.json
  uci -q show telego >/dev/null

  grep -q '^telego:' /etc/passwd
  grep -q '^telego:' /etc/group

  # Exercise the installed init script's real UCI -> TOML conversion using
  # OpenWrt's own /lib/functions.sh, uci and account helpers.
  . /lib/functions.sh
  . /etc/init.d/telego
  ensure_service_account
  generate_config
  test -s /var/etc/telego.toml
  test "$(stat -c '%a' /var/etc/telego.toml)" = 600
  grep -q '^\[general\]$' /var/etc/telego.toml
  grep -q '^bind-to = "0.0.0.0:443"$' /var/etc/telego.toml
  grep -q '^\[tls-fronting\]$' /var/etc/telego.toml
  grep -q '^\[secrets\]$' /var/etc/telego.toml

  test -s /www/luci-static/resources/view/telego/config.js
  test -s /usr/share/luci/menu.d/telego.menu.json
  test -s /usr/share/rpcd/acl.d/luci-app-telego.json
  test -x /usr/share/rpcd/ucode/telego
  test -s /usr/share/luci/i18n/telego.ru.lmo

  test -s /etc/nginx/conf.d/telego.conf
  test -s /etc/nginx/snippets/telego.locations
}

install_telego
assert_installed

# Package lifecycle smoke: the set must be removable and installable again
# without a dirty OpenWrt image or hand-written cleanup steps.
apk del luci-i18n-telego-ru luci-app-telego nginx-telego telego-pkg
for pkg in telego-pkg nginx-telego luci-app-telego luci-i18n-telego-ru; do
  if apk info -e "$pkg" >/dev/null 2>&1; then
    echo "Package still installed after apk del: $pkg" >&2
    exit 1
  fi
done
rm -f /var/etc/telego.toml

install_telego
assert_installed

printf 'OpenWrt %s APK install/runtime/remove/reinstall smoke test passed.\n' "$(cat /etc/openwrt_version)"
CHROOT
