#!/bin/bash
# Usage: ./install-on-router.sh [--allow-untrusted] <router_host> [packages_dir]
# packages_dir must contain one version of each of the four telEgo APKs.
set -euo pipefail

ALLOW_UNTRUSTED=0
if [[ ${1:-} == --allow-untrusted ]]; then
	ALLOW_UNTRUSTED=1
	shift
fi

if [[ $# -lt 1 || $# -gt 2 || ! $1 =~ ^[A-Za-z0-9][A-Za-z0-9._:-]*$ ]]; then
	echo "Usage: $0 [--allow-untrusted] <router_host> [packages_dir]" >&2
	exit 2
fi

ROUTER_HOST=$1
PACKAGES_DIR=${2:-./packages}
shopt -s nullglob
packages=()
for name in telego-pkg luci-app-telego luci-i18n-telego-ru nginx-telego; do
	matches=("$PACKAGES_DIR/$name-"[0-9]*.apk)
	if [[ ${#matches[@]} != 1 ]]; then
		echo "Expected exactly one $name APK in $PACKAGES_DIR" >&2
		exit 1
	fi
	packages+=("${matches[0]}")
done

# Use a private remote directory; never install or remove unrelated /tmp APKs.
remote_dir=$(ssh "root@$ROUTER_HOST" 'mktemp -d /tmp/telego-install.XXXXXXXX')
if [[ ! $remote_dir =~ ^/tmp/telego-install\.[A-Za-z0-9]+$ ]]; then
	echo 'Router returned an unexpected temporary directory' >&2
	exit 1
fi

cleanup() {
	ssh "root@$ROUTER_HOST" "rm -f '$remote_dir'/*.apk; rmdir '$remote_dir'" || true
}
trap cleanup EXIT

scp_host=$ROUTER_HOST
[[ $scp_host != *:* ]] || scp_host="[$scp_host]"
scp -- "${packages[@]}" "root@$scp_host:$remote_dir/"
ssh "root@$ROUTER_HOST" "sh -s -- '$remote_dir' '$ALLOW_UNTRUSTED'" <<'EOF'
set -eu
cd "$1"
apk update
if [ "$2" = 1 ]; then
	apk add --allow-untrusted ./telego-pkg-*.apk ./luci-app-telego-*.apk ./luci-i18n-telego-ru-*.apk ./nginx-telego-*.apk
else
	apk add ./telego-pkg-*.apk ./luci-app-telego-*.apk ./luci-i18n-telego-ru-*.apk ./nginx-telego-*.apk
fi
/etc/init.d/rpcd restart
EOF

echo 'Installation complete. Configure a secret and enable telEgo in LuCI.'
