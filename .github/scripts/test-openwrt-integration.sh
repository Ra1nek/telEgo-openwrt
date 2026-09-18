#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../.."

bash -n scripts/install-on-router.sh
sh -n install.sh
sh -n scripts/verify-direct-https-router.sh
sh -n scripts/verify-direct-https-client.sh
python3 .github/scripts/check-doc-links.py
python3 -m py_compile .github/scripts/apply-upstream-patches.py .github/scripts/check-doc-links.py
python3 - <<'PY'
from pathlib import Path

text = Path('install.sh').read_text()

capture = '''    if [ "$SEL_NGINX" -eq 1 ] && [ -x /etc/init.d/nginx ] && /etc/init.d/nginx status >/dev/null 2>&1; then WAS_NGINX_RUNNING=1; fi'''
transaction = '''    if [ "$ALLOW_UNTRUSTED" -eq 1 ]; then apk add --allow-untrusted $DEPENDENCIES "$@"; else apk add $DEPENDENCIES "$@"; fi'''
restore = '''    if [ "$WAS_NGINX_RUNNING" -eq 1 ]; then
        [ -x /etc/init.d/nginx ] || fail 'Nginx работал до обновления, но его init-скрипт исчез после APK-транзакции.' 'Nginx was running before the update, but its init script disappeared after the APK transaction.'
        if ! /etc/init.d/nginx status >/dev/null 2>&1; then
            /etc/init.d/nginx start
            /etc/init.d/nginx status >/dev/null 2>&1 || fail 'Nginx работал до обновления, но не запустился после APK-транзакции.' 'Nginx was running before the update but could not be restored after the APK transaction.'
            status_ok 'Работавшая служба Nginx восстановлена после обновления' 'Previously running Nginx service restored after update'
        fi
    fi'''

assert 'WAS_NGINX_RUNNING=0' in text
assert 'WAS_TELEGO_RUNNING=0' in text
assert text.count(capture) == 1
assert text.count(transaction) == 1
assert text.count(restore) == 1
assert text.index(capture) < text.index(transaction) < text.index(restore)
# Starting nginx is allowed only inside the guarded restore path. A previously
# stopped administrator-managed nginx instance must remain stopped.
assert text.count('/etc/init.d/nginx start') == 1
assert '/etc/init.d/nginx start' in restore
print('installer nginx runtime-state preservation contract passed')
PY
bash -n .github/scripts/verify-nginx-telego-apk.sh
python3 .github/tests/test_router_installer.py
BUSYBOX="${BUSYBOX:-$(command -v busybox)}" python3 .github/tests/test_router_installer.py
sh -n package/telego-pkg/files/init.d/telego
sh -n package/telego-pkg/files/usr/libexec/telego-package-reconcile
sh -n package/nginx-telego/files/init.d/nginx-telego
sh -n package/nginx-telego/files/usr/libexec/nginx-telego-render
sh -n package/nginx-telego/files/usr/libexec/nginx-telego-files
sh -n package/nginx-telego/files/usr/libexec/nginx-telego-reconcile
sh -n package/nginx-telego/files/usr/libexec/nginx-telego-firewall
sh -n package/nginx-telego/files/usr/libexec/nginx-telego-cert
sh -n package/nginx-telego/files/etc/hotplug.d/acme/90-nginx-telego
sh -n package/nginx-telego/files/usr/libexec/nginx-telego-admin
sh -n package/nginx-telego/files/usr/libexec/nginx-telego-editor
bash .github/tests/nginx-telego.sh
bash .github/tests/nginx-telego-ownership.sh
bash .github/tests/nginx-telego-reconcile.sh
bash .github/tests/nginx-telego-firewall.sh
bash .github/tests/nginx-telego-cert.sh
bash .github/tests/nginx-telego-acme-hook.sh
bash .github/tests/nginx-telego-admin.sh
bash .github/tests/nginx-telego-editor.sh
bash .github/tests/nginx-telego-service.sh
sh .github/tests/service-account.sh
sh .github/tests/telego-config-render.sh
sh .github/tests/package-reconcile.sh
bash .github/tests/service-definition.sh
"${NODE:-node}" .github/tests/luci-config.cjs
"${NODE:-node}" .github/tests/luci-ingress.cjs
"${NODE:-node}" .github/tests/luci-nginx-files.cjs
python3 .github/tests/test_installer.py
python3 .github/scripts/check-luci-i18n.py

UCODE_REVISION=85922056ef7abeace3cca3ab28bc1ac2d88e31b1
UCODE_CACHE_ROOT="${UCODE_CACHE_ROOT:-${XDG_CACHE_HOME:-$HOME/.cache/telego/ucode}}"

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

	LD_LIBRARY_PATH="$runtime_dir${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" "$UCODE" .github/tests/rpcd-status.uc
	LD_LIBRARY_PATH="$runtime_dir${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" "$UCODE" .github/tests/rpcd-nginx.uc
else
	"$UCODE" .github/tests/rpcd-status.uc
	"$UCODE" .github/tests/rpcd-nginx.uc
fi
