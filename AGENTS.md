# Codex project guide

## Project

telEgo OpenWrt packages the pinned upstream telEgo source for OpenWrt 25.12+ / x86_64.
The repository adds OpenWrt packaging, UCI/procd integration, LuCI/rpcd, Nginx integration, installers, tests, and CI.

`telego-src/` is a pinned git submodule pointing at the upstream Go project. Treat it as external source unless the task explicitly concerns upstream Go behavior, the source patch, or submodule synchronization.

## Repository map

- `package/telego-pkg/` — daemon package, UCI config, procd/ujail service and capabilities.
- `package/luci-app-telego/` — LuCI JavaScript UI and rpcd ucode backend.
- `package/luci-i18n-telego-ru/` — Russian LuCI translation package.
- `package/nginx-telego/` — Nginx integration.
- `.github/workflows/` — authoritative CI and release workflows.
- `.github/scripts/` and `.github/tests/` — build/integration helpers and tests.
- `install.sh` and `scripts/` — router installation flows.
- `docs/` — user/build/install documentation.
- `telego-src/` — pinned upstream source; do not recursively inspect for OpenWrt/LuCI/installer-only tasks.

## Sources of truth

- Current build behavior: `.github/workflows/build-telego.yaml` and `.github/workflows/release.yaml`.
- Package metadata and dependencies: `package/*/Makefile`.
- OpenWrt service behavior: `package/telego-pkg/files/init.d/telego`.
- LuCI behavior: `package/luci-app-telego/`.
- Upstream Go source: `telego-src/` plus `.github/scripts/apply-upstream-patches.py` for the OpenWrt-only delta.

When documentation conflicts with executable CI/package definitions, verify the executable source before acting and update stale documentation when appropriate.

## Context discipline

Context is scarce. Start with the smallest set of files that can answer the request.

- Do not inventory or dump the whole repository unless the user explicitly requests a repository-wide audit.
- Do not recursively inspect `telego-src/` unless the task requires upstream Go source.
- Prefer targeted `rg`, focused file ranges, and `git diff --stat` before full-file/full-diff dumps.
- For CI failures, identify the failed job/step and exact error first; read only the surrounding log window unless more context is required.
- When several checks are known to be independent, read-only, and conflict-free, batch or parallelize them in one tool/exec round where possible instead of returning to the model after every individual check.
- Keep dependent, state-changing, writing, and approval-sensitive operations serial.
- Do not repeat a completed check unless new evidence invalidates it.
- Do not repeatedly poll long-running commands; use an appropriate wait interval.
- Stop repository exploration once the root cause or required edit is established.

## Change discipline

- Make the smallest coherent change that solves the requested problem.
- Do not refactor unrelated areas while fixing a focused issue.
- Preserve OpenWrt 25.12+ APK packaging and x86_64 assumptions unless the task explicitly changes the target.
- Do not edit generated/build artifacts as a substitute for fixing their source.
- Before modifying the submodule pointer or upstream source, confirm the task actually requires an upstream change.

## Validation

Use the narrowest relevant validation first.

- Integration: `bash .github/scripts/test-openwrt-integration.sh`
- Go (when upstream Go is touched): from `telego-src/`, run `go vet ./...` and `go test ./...` after applying the repository patch when required by the workflow.
- LuCI/i18n: use the existing `.github/tests/` and `.github/scripts/check-luci-i18n.py` checks relevant to the change.
- Packaging/CI changes: validate the affected workflow/package metadata; use the full GitHub Actions build when package output must be proven.

Do not run every expensive validation step for documentation-only or clearly isolated edits unless requested.
