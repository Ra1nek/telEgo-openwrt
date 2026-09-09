#!/usr/bin/env bash
set -euo pipefail

FEED_ROOT=${1:-bin/packages}
LEGACY_APK=${2:-${FEED_ROOT}/upgrade-fixture/telego-pkg-0.6.0-r1.apk}
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
preview_dir=$workdir/preview
server_pid=''
mounts=()
cleanup() {
  local i
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  for ((i=${#mounts[@]} - 1; i >= 0; i--)); do
    sudo umount -l -- "${mounts[$i]}" 2>/dev/null || true
  done
  sudo rm -rf -- "$workdir"
}
trap cleanup EXIT
mkdir -p "$rootfs" "$preview_dir"

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
  cp -- "$apk" "$preview_dir/"
done

if [[ -f "$LEGACY_APK" ]]; then
  sudo cp -- "$LEGACY_APK" "$rootfs/tmp/telego-pkg-legacy.apk"
  printf 'Legacy installer upgrade fixture: %s\n' "$LEGACY_APK"
else
  printf 'Legacy installer upgrade fixture not provided; old-to-new installer test will be skipped.\n'
fi

(
  cd "$preview_dir"
  sha256sum ./*.apk | sed 's#  \./#  #' > telego-install.sha256
)

# Exercise the real installer against the just-built packages without relying on
# the mutable public develop-latest release. Only the download base is replaced
# in this test copy; selection, verification and apk transaction logic is intact.
cp install.sh "$workdir/telego-install.sh"
python3 - "$workdir/telego-install.sh" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
old = '''    if [ "$RELEASE" = 'latest' ]; then BASE_URL="https://github.com/$REPOSITORY/releases/latest/download"
    else BASE_URL="https://github.com/$REPOSITORY/releases/download/$RELEASE"
    fi'''
new = '''    BASE_URL="http://127.0.0.1:18080"'''
if text.count(old) != 1:
    raise SystemExit('Could not patch installer release URL for smoke test')
path.write_text(text.replace(old, new))
PY
sudo cp -- "$workdir/telego-install.sh" "$rootfs/tmp/telego-install.sh"
sudo chmod 0755 "$rootfs/tmp/telego-install.sh"

python3 -m http.server 18080 --bind 127.0.0.1 --directory "$preview_dir" \
  >"$workdir/preview-http.log" 2>&1 &
server_pid=$!
for _ in {1..20}; do
  if curl --fail --silent http://127.0.0.1:18080/telego-install.sha256 >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done
curl --fail --silent --show-error http://127.0.0.1:18080/telego-install.sha256 >/dev/null

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
  # OpenWrt's minimal BusyBox does not enable the stat applet by default.
  # Its find implementation does support exact permission matching.
  find /var/etc/telego.toml -perm 0600 -print | grep -qx '/var/etc/telego.toml'
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

# Refresh the official package indexes once. Installer invocations below refresh
# them again by design; direct lifecycle checks reuse the same indexes.
apk update

# True old -> new installer smoke. The legacy APK is built on the CI host using
# the same SDK host apk-tools as OpenWrt packaging. The target apk is minimal and
# intentionally cannot create packages itself.
if [ -f /tmp/telego-pkg-legacy.apk ]; then
  apk add --allow-untrusted /tmp/telego-pkg-legacy.apk
  legacy_config_hash=$(sha256sum /etc/config/telego | awk '{print $1}')

  /bin/sh /tmp/telego-install.sh --lang en --yes --allow-untrusted --no-color
  apk info -e telego-pkg >/dev/null
  for pkg in nginx-telego luci-app-telego luci-i18n-telego-ru; do
    if apk info -e "$pkg" >/dev/null 2>&1; then
      echo "Noninteractive core-only upgrade unexpectedly installed: $pkg" >&2
      exit 1
    fi
  done
  new_config_hash=$(sha256sum /etc/config/telego | awk '{print $1}')
  test "$new_config_hash" = "$legacy_config_hash"
  grep -q "option bind_to '127.0.0.1:1443'" /etc/config/telego
  /usr/bin/telego version >/tmp/upgraded-version.txt 2>&1
  test -s /tmp/upgraded-version.txt
  ! grep -qx legacy /tmp/upgraded-version.txt

  # Reset the legacy fixture before testing a clean full installation.
  apk del telego-pkg
  rm -f /etc/config/telego /var/etc/telego.toml
fi

install_telego
assert_installed

# A noninteractive component change must also remove packages that are explicitly
# deselected. rpcd is stubbed because this rootfs is not a booted procd system.
cp /etc/init.d/rpcd /tmp/rpcd.real
cat >/etc/init.d/rpcd <<'EOF'
#!/bin/sh
exit 0
EOF
chmod 0755 /etc/init.d/rpcd
config_hash=$(sha256sum /etc/config/telego | awk '{print $1}')
/bin/sh /tmp/telego-install.sh --lang en --no-ru --yes --allow-untrusted --no-color
for pkg in telego-pkg nginx-telego luci-app-telego; do
  apk info -e "$pkg" >/dev/null
done
if apk info -e luci-i18n-telego-ru >/dev/null 2>&1; then
  echo 'Deselected Russian translation remained installed' >&2
  exit 1
fi
test "$(sha256sum /etc/config/telego | awk '{print $1}')" = "$config_hash"

/bin/sh /tmp/telego-install.sh --lang en --ru --yes --allow-untrusted --no-color
mv /tmp/rpcd.real /etc/init.d/rpcd
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

printf 'OpenWrt %s APK installer-upgrade/runtime/remove/reinstall smoke test passed.\n' "$(cat /etc/openwrt_version)"
CHROOT
