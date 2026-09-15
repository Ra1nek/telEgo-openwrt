#!/bin/bash
set -euo pipefail

work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT

cat >"$work/render" <<'SH'
#!/bin/sh
printf '%s\n' "$*" >>"$NGINX_TELEGO_TEST_LOG"
SH
chmod +x "$work/render"

export NGINX_TELEGO_RENDER="$work/render"
export NGINX_TELEGO_TEST_LOG="$work/render.log"
: >"$NGINX_TELEGO_TEST_LOG"

# shellcheck source=/dev/null
source package/nginx-telego/files/init.d/nginx-telego

triggers=''
procd_add_reload_trigger() {
	triggers="$*"
}

service_triggers
[[ "$triggers" == 'nginx_telego telego' ]]
[[ "$USE_PROCD" == 1 ]]

start_service
reload_service
stop_service

mapfile -t calls <"$NGINX_TELEGO_TEST_LOG"
[[ ${#calls[@]} == 2 ]]
[[ ${calls[0]} == apply ]]
[[ ${calls[1]} == apply ]]

echo 'nginx-telego service trigger tests passed'
