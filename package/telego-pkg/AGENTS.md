# telEgo OpenWrt package guidance

Scope: `package/telego-pkg/`.

- `package/telego-pkg/Makefile` and `files/` define the OpenWrt package/runtime integration.
- The production Go binary is built by CI from the pinned `telego-src/` submodule and copied into the package before the SDK packaging step.
- `telego-src/` is the sole authoritative Go source tree for the production binary. Do not recreate, vendor, or copy a second Go source tree under `package/telego-pkg/`.
- Preserve procd/ujail, dedicated-user, capability, and UCI-to-runtime-config behavior unless the task explicitly changes the security/runtime model.
- For service changes, run the focused shell/account/service-definition tests before broader integration validation.
- For Makefile dependency changes, verify against the OpenWrt 25.12+ APK/SDK metadata rather than guessing package names or versions.
