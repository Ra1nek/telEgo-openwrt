# LuCI guidance

Scope: `package/luci-app-telego/`.

- This package contains the JavaScript LuCI UI plus rpcd ucode backends. `telego` is telemetry-oriented; `telego.nginx` is the scoped P8 Nginx inventory/admin API.
- Start with the specific view/backend file named by the bug; do not inspect the upstream Go submodule for UI-only tasks.
- Keep LuCI ACL/menu/backend behavior consistent when adding or renaming RPC methods.
- P8 Nginx filesystem mutations must stay behind `/usr/libexec/nginx-telego-admin`; rpcd and browser-side code must not manipulate `/etc/nginx/conf.d` directly.
- Keep `nginx-telego-files` read-only and delegate managed-state repair to `nginx-telego-reconcile` rather than duplicating P7 ownership/reconciliation logic.
- Preserve client-side secret validation/generation behavior unless the task explicitly changes it.
- Use `.github/tests/luci-config.cjs`, `.github/tests/luci-ingress.cjs`, `.github/tests/luci-nginx-files.cjs`, `.github/tests/rpcd-status.uc`, and `.github/tests/rpcd-nginx.uc` as focused validation where applicable.
- Translation changes belong in `package/luci-i18n-telego-ru/`; P8 strings live in the dedicated `nginx-files.po` catalog.
- Restricted arbitrary Nginx editing is outside the current P8 contract unless a later task explicitly introduces and threat-models it.
