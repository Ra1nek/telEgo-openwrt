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

# Match the ucode revision shipped by the target OpenWrt SDK.
# Set UCODE to an existing matching interpreter to avoid building a host tool.
if [[ -z ${UCODE:-} ]]; then
	test_dir=$(mktemp -d)
	trap 'rm -rf -- "$test_dir"' EXIT
	git clone --quiet https://github.com/jow-/ucode.git "$test_dir/ucode"
	git -C "$test_dir/ucode" checkout --quiet --detach 85922056ef7abeace3cca3ab28bc1ac2d88e31b1
	cmake -S "$test_dir/ucode" -B "$test_dir/build" -DCMAKE_C_FLAGS=-Wno-error=discarded-qualifiers
	cmake --build "$test_dir/build" --target ucode -j2
	UCODE="$test_dir/build/ucode"
fi
"$UCODE" .github/tests/rpcd-status.uc
