# Contributing to telEgo OpenWrt

Thank you for contributing to `telEgo-openwrt`.

This repository packages a pinned upstream [`Scratch-net/telego`](https://github.com/Scratch-net/telego) core for **OpenWrt 25.12.x / x86_64** and adds native APK packaging, UCI/procd/ujail integration, LuCI JavaScript, rpcd telemetry, Nginx integration, installers, tests, and release automation.

> [!IMPORTANT]
> The normal contribution target is the **`develop` branch**. Production Go source lives in the `telego-src/` git submodule; do not copy upstream code into a second local source tree.

## Development principles

A good contribution is:

- focused on one coherent problem;
- compatible with OpenWrt 25.12.x and native `apk` packaging;
- conservative about runtime privileges and exposed network surfaces;
- covered by the narrowest relevant automated checks;
- documented when it changes user-visible behavior or configuration;
- free of real credentials, proxy secrets, private keys, and production hostnames.

## Clone the repository correctly

The upstream telEgo source is a git submodule, so clone recursively:

```bash
git clone --recurse-submodules -b develop \
  https://github.com/Ra1nek/telEgo-openwrt.git
cd telEgo-openwrt
```

For an existing checkout:

```bash
git switch develop
git pull --ff-only
git submodule update --init --recursive
```

Before starting work, create a focused branch from the current `develop` head:

```bash
git switch -c feature/my-change
```

Use `fix/…`, `feature/…`, `docs/…`, or another short descriptive prefix when helpful.

## Repository map

| Area | Responsibility |
|---|---|
| `package/telego-pkg/` | daemon APK, UCI defaults, procd/ujail service, capability profile |
| `package/luci-app-telego/` | LuCI JavaScript UI and rpcd/ucode telemetry backend |
| `package/luci-i18n-telego-ru/` | Russian LuCI translation |
| `package/nginx-telego/` | Nginx WEB Proxy integration |
| `.github/workflows/` | build, release, security, and lint automation |
| `.github/scripts/` | deterministic CI/build helpers |
| `.github/tests/` | integration and focused behavior tests |
| `install.sh`, `scripts/` | router installation flows |
| `docs/` | Russian and English technical documentation |
| `telego-src/` | pinned upstream Go source submodule |

For detailed architecture, start with [`docs/ARCHITECTURE_EN.md`](docs/ARCHITECTURE_EN.md) or [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Local prerequisites

For the lightweight checks, a typical Linux development environment needs:

- Git;
- Node.js 22 or another modern Node.js release capable of running the project tests;
- Python 3;
- POSIX `sh` and Bash;
- standard Unix tools used by the integration scripts.

The full production APK build is intentionally performed through the pinned OpenWrt SDK workflow in GitHub Actions rather than a hand-built local replacement.

## Fast quality checks

Run these before opening a pull request when the touched files are relevant.

### LuCI JavaScript syntax — ESLint

```bash
npx --yes eslint@10.10.0 \
  --config .github/eslint.config.mjs \
  --max-warnings=0 \
  package/luci-app-telego/htdocs/resources/view/telego/*.js
```

This is a lightweight syntax gate for the LuCI JavaScript files. LuCI view modules intentionally use framework-specific top-level `return` semantics, so the repository ESLint configuration parses them as scripts with `globalReturn` enabled rather than pretending they are ordinary browser ES modules.

### LuCI behavior smoke test

```bash
node .github/tests/luci-config.cjs
```

The test executes the LuCI view against a small framework stub and verifies critical behavior including configuration rendering, WEB hostname dependency semantics, telemetry rendering, and graceful rpcd failure handling.

### OpenWrt Makefile structure

```bash
python3 .github/scripts/check-openwrt-makefiles.py
```

The checker catches inexpensive authoring failures before the SDK build, including:

- malformed `define` / `endef` structure;
- missing `BuildPackage` evaluation;
- CRLF/trailing whitespace;
- spaces used where GNU make requires a literal TAB in OpenWrt command blocks.

It is **not** a substitute for the OpenWrt SDK package build.

### Installer syntax

```bash
sh -n install.sh
bash -n scripts/install-on-router.sh
```

`install.sh` must remain compatible with BusyBox ash / POSIX `sh`; do not introduce Bash-only syntax into it.

## Full OpenWrt integration suite

For changes to packaging, installers, LuCI, rpcd, UCI/procd integration, i18n, or related scripts:

```bash
bash .github/scripts/test-openwrt-integration.sh
```

This is the main repository-level local validation entry point.

> [!TIP]
> Run the narrowest relevant test first. A documentation-only edit should not require upstream Go tests or a full SDK build; a package/runtime change usually should receive broader validation.

## Working on LuCI

The LuCI application is implemented in JavaScript rather than a project-specific Lua backend.

Primary view:

```text
package/luci-app-telego/htdocs/resources/view/telego/config.js
```

When changing the UI:

1. keep option names aligned with `/etc/config/telego`;
2. preserve the UCI → TOML mapping implemented by `/etc/init.d/telego`;
3. keep menu, ACL, rpcd method names, and JavaScript RPC declarations consistent;
4. add or update assertions in `.github/tests/luci-config.cjs` for behavior changes;
5. update Russian translation strings in `package/luci-i18n-telego-ru/` when user-visible text changes;
6. update `docs/CONFIGURATION.md` and `docs/CONFIGURATION_EN.md` when the configuration surface changes.

### Testing a LuCI controller/view change

At minimum:

```bash
npx --yes eslint@10.10.0 \
  --config .github/eslint.config.mjs \
  --max-warnings=0 \
  package/luci-app-telego/htdocs/resources/view/telego/*.js
node .github/tests/luci-config.cjs
python3 .github/scripts/check-luci-i18n.py
```

If rpcd behavior changes, also run the focused ucode test used by the integration suite.

## Working on UCI / procd / runtime packaging

The authoritative files are:

```text
package/telego-pkg/files/config/telego
package/telego-pkg/files/init.d/telego
package/telego-pkg/files/capabilities/telego.json
package/telego-pkg/Makefile
```

Preserve the current security model unless the purpose of the change is explicitly to redesign it:

- dedicated `telego:telego` service identity;
- required `ujail` execution;
- `no_new_privs`;
- capability set limited to `CAP_NET_BIND_SERVICE`;
- generated `/var/etc/telego.toml` owned by `telego:telego` with mode `0600`;
- UCI remains the configuration source of truth.

Package dependencies belong in the relevant OpenWrt `Makefile`, not in installer-only workarounds.

## Working on WEB Proxy / Nginx

The reusable Nginx integration lives under:

```text
package/nginx-telego/files/
```

Keep the distinction between these layers clear:

- Nginx terminates real TLS and provides the public WEB edge;
- telEgo authenticates and handles WEB carrier sessions;
- Middle-End is an optional upstream route after a session enters the telEgo core.

Do not remove the `419` sanitized fallback contract merely to simplify a custom Nginx configuration; it protects carrier credentials and forwarded metadata from reaching the ordinary-site fallback.

## Working on upstream Go behavior

Only touch `telego-src/` or the OpenWrt source patch when the task genuinely involves upstream Go behavior.

The normal flow is:

1. review the exact upstream commit/tag;
2. move the submodule pointer deliberately;
3. re-evaluate `.github/scripts/apply-upstream-patches.py`;
4. apply the repository patch;
5. run upstream Go validation;
6. run OpenWrt integration tests;
7. build the APK set through the production workflow.

Relevant Go validation:

```bash
python3 .github/scripts/apply-upstream-patches.py
cd telego-src
gofmt -w ./cmd/telego/main.go
go vet ./...
go test ./...
```

Do not recursively inspect or modify the upstream submodule for a LuCI-only, documentation-only, or installer-only contribution.

## Documentation

User-facing technical documentation is bilingual:

- Russian: `docs/*.md`;
- English: matching `docs/*_EN.md` files.

When a technical change affects both audiences, keep the corresponding document pair semantically aligned. Preserve literal command names, UCI option names, file paths, protocol identifiers, and code examples instead of translating identifiers.

## Commit quality

Keep commits reviewable and coherent.

Preferred examples:

```text
fix(luci): validate WEB proxy hostname
ci: add package metadata check
docs: clarify Middle-End lifecycle
package: tighten telego runtime dependency
```

Avoid mixing unrelated formatting, documentation rewrites, package changes, and runtime refactors in the same commit.

## Pull request checklist

Before opening a PR:

- [ ] Rebase or update your branch from the current `develop` branch.
- [ ] Run the narrowest relevant local checks.
- [ ] Run `bash .github/scripts/test-openwrt-integration.sh` when integration behavior changed.
- [ ] Confirm no secrets, private keys, real proxy credentials, or sensitive logs are included.
- [ ] Update documentation for user-visible behavior/configuration changes.
- [ ] Explain compatibility or migration impact when UCI/runtime behavior changes.
- [ ] Keep the PR focused on one coherent change.

## Open the pull request against `develop`

Push your branch:

```bash
git push -u origin feature/my-change
```

Create the pull request with:

```text
base: develop
head: feature/my-change
```

The PR description should state:

1. the problem being solved;
2. the implementation approach;
3. user-visible or compatibility impact;
4. exact validation performed;
5. screenshots for meaningful LuCI visual changes;
6. any follow-up work intentionally left out of scope.

Do not target `main` for ordinary development work unless the maintainers explicitly request a release-specific change.

## CI expectations

A PR to `develop` should pass the lightweight lint workflow. Package/runtime changes are also expected to remain compatible with the existing integration and production APK workflows.

A green CI result is not sufficient if an expected package, test, or verification gate was accidentally skipped. The repository treats missing expected APK output as a build failure.

## Security reports

Do not publish working user secrets, private APK signing keys, TLS private keys, or exploit credentials in an issue or pull request.

If a report requires sensitive reproduction data, disclose the minimum necessary information through an appropriate private maintainer/security channel when one is available.

---

Useful references:

- [Documentation index](docs/README_EN.md)
- [Architecture](docs/ARCHITECTURE_EN.md)
- [Build and release](docs/BUILD_EN.md)
- [Security model](docs/SECURITY_EN.md)
- [Troubleshooting](docs/TROUBLESHOOTING_EN.md)
