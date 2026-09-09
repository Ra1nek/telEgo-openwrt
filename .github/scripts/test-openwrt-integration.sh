#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../.."

bash -n scripts/install-on-router.sh
sh -n install.sh
python3 .github/tests/test_router_installer.py
BUSYBOX="${BUSYBOX:-$(command -v busybox)}" python3 .github/tests/test_router_installer.py
sh -n package/telego-pkg/files/init.d/telego
sh .github/tests/service-account.sh
bash .github/tests/service-definition.sh
"${NODE:-node}" .github/tests/luci-config.cjs
python3 .github/tests/test_installer.py
python3 .github/scripts/check-luci-i18n.py

# Match the ucode revision shipped by the target OpenWrt SDK. Cache the small
# runtime set (ucode + libucode) instead of the whole source/build tree.
# Set UCODE explicitly to bypass this cache and use another interpreter.
UCODE_REVISION=85922056ef7abeace3cca3ab28bc1ac2d88e31b1
UCODE_CACHE_ROOT="${UCODE_CACHE_ROOT:-${XDG_CACHE_HOME:-$HOME/.cache}/telego/ucode}"

if [[ -z ${UCODE:-} ]]; then
	runtime_dir="$UCODE_CACHE_ROOT/$UCODE_REVISION"
	UCODE="$runtime_dir/ucode"

	if [[ ! -x "$UCODE" || ! -e "$runtime_dir/libucode.so.0" ]]; then
		test_dir=$(mktemp -d)
		trap 'rm -rf -- "$test_dir"' EXIT
		git clone --quiet https://github.com/jow-/ucode.git "$test_dir/ucode"
		git -C "$test_dir/ucode" checkout --quiet --detach "$UCODE_REVISION"
		cmake -S "$test_dir/ucode" -B "$test_dir/build" -DCMAKE_C_FLAGS=-Wno-error=discarded-qualifiers
		cmake --build "$test_dir/build" --target ucode -j2

		rm -rf "$runtime_dir"
		mkdir -p "$runtime_dir"
		install -m 0755 "$test_dir/build/ucode" "$UCODE"
		cp -a "$test_dir/build"/libucode.so* "$runtime_dir/"
	fi

	LD_LIBRARY_PATH="$runtime_dir${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" \
		"$UCODE" .github/tests/rpcd-status.uc
else
	"$UCODE" .github/tests/rpcd-status.uc
fi
