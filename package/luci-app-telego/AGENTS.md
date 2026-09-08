# LuCI guidance

Scope: `package/luci-app-telego/`.

- This package contains the JavaScript LuCI UI plus a read-only rpcd ucode backend.
- Use the standard LuCI package layout and `$(TOPDIR)/feeds/luci/luci.mk`; keep `htdocs/`, `root/`, and `po/` as the canonical package inputs instead of duplicating manual install rules.
- Start with the specific view/backend file named by the bug; do not inspect the upstream Go submodule for UI-only tasks.
- Keep LuCI ACL/menu/backend behavior consistent when adding or renaming RPC methods.
- Preserve client-side secret validation/generation behavior unless the task explicitly changes it.
- Use `.github/tests/luci-config.cjs` and `.github/tests/rpcd-status.uc` as focused validation where applicable.
- Russian translations live in `po/ru/telego.po`; `luci.mk` generates the `luci-i18n-telego-ru` package automatically.
