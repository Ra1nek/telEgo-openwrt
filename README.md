# telEgo OpenWrt

Production packaging fork of [Scratch-net/telego](https://github.com/Scratch-net/telego) for **OpenWrt 25.12+ / x86_64**.

The Go application is tracked as a pinned git submodule:

```text
telego-src/ -> Scratch-net/telego @ 9ee01e6746b246ee9cc4912dceed30906ce2422c (v0.6.1)
```

The fork adds OpenWrt UCI/procd integration, LuCI, rpcd telemetry and Nginx integration without duplicating the upstream Go source tree.

## Architecture

```text
Scratch-net/telego v0.6.1
        |
        +-- upstream Go source
        |
        +-- OpenWrt-specific source patch
        |
        v
     Go 1.27
        |
        v
   /usr/bin/telego
        |
        +-- procd / ujail
        +-- UCI -> TOML bridge
        +-- LuCI JavaScript UI
        +-- rpcd telemetry
        +-- Prometheus metrics
        |
        v
    OpenWrt SDK
        |
        v
 APK packages + packages.adb
```

GitHub Actions builds the Go binary with Go 1.27 and then packages it with the OpenWrt SDK. The router does not need a Go compiler at runtime.

## Packages

The feed contains:

- `telego-pkg` — telEgo daemon, UCI configuration, procd service and capability profile.
- `luci-app-telego` — JavaScript-only LuCI interface and read-only rpcd telemetry backend.
- `luci-i18n-telego-ru` — Russian LuCI translation.
- `nginx-telego` — reusable Nginx HTTP-context definitions and WEB Proxy location snippet.

## Clone

The repository uses a git submodule, so clone recursively:

```bash
git clone --recurse-submodules https://github.com/Ra1nek/telEgo-openwrt.git
cd telEgo-openwrt
```

For an existing checkout:

```bash
git submodule update --init --recursive
```

## GitHub Actions build

Pull requests and branch pushes run the package build workflow.

The workflow checks out the pinned upstream source, applies the OpenWrt-specific patch, runs Go formatting/vet/tests, builds a Linux x86_64 static PIE binary, packages the OpenWrt components as APK, generates `packages.adb` and uploads the complete feed as an artifact.

Release builds are tag-driven. A `vX.Y.Z` tag must match `PKG_VERSION` before the feed and GitHub Release are published.

## OpenWrt installation

OpenWrt 25.12+ uses `apk`.

Follow the [installation guide](docs/INSTALL.md) to obtain a matching set and
configure trust in the publisher's APK signing key. From the directory containing
only the four selected packages, install them together:

```sh
apk update
apk add ./telego-pkg-*.apk ./luci-app-telego-*.apk ./luci-i18n-telego-ru-*.apk ./nginx-telego-*.apk
/etc/init.d/rpcd restart
```

The package post-install creates the unprivileged `telego` service account. The procd service runs the daemon as that user and grants only `CAP_NET_BIND_SERVICE`.

## LuCI

The application provides one JavaScript LuCI page with two top-level tabs:

- **Configuration** — MTProxy, TLS fronting, WEB Proxy, Middle-End, performance, metrics and dynamic user secrets.
- **Status** — live service state, PID, daemon uptime, active connections, active IPs and traffic counters through the local rpcd telemetry provider.

Secrets are generated client-side with `crypto.getRandomValues()` and validated as exactly 32 hexadecimal characters before UCI is committed.

WEB Proxy's hostname is required only while WEB Proxy is enabled. Configuration
remains accessible if the telemetry backend is unavailable.

Save & Apply uses procd to restart the daemon when its generated configuration
changes, including changes to secrets and listeners. Existing connections are
interrupted. Disabling the main service stops it; enabling it starts it again.

## UCI -> TOML

`/etc/init.d/telego` reads `/etc/config/telego` and atomically generates:

```text
/var/etc/telego.toml
```

The generated configuration is owned by `telego:telego` with mode `0600`.

Anonymous UCI sections are supported, including `secret`, `tls_fronting`, `web_proxy`, `middle_end`, `performance`, `upstream` and `metrics`.

## Security model

The service uses:

- a dedicated `telego` user and group;
- a procd jail with `requirejail`;
- `no_new_privs`;
- only `CAP_NET_BIND_SERVICE` from the capability profile;
- loopback-only WEB and metrics listeners by default;
- atomic `0600` runtime configuration generation;
- a read-only rpcd telemetry method exposed to LuCI through ACL;
- sanitized Nginx fallback requests with carrier credentials removed.

The binary is built with `CGO_ENABLED=0` as a static PIE. The service jail therefore does not use `ronly`, because ujail read-only dependency discovery cannot resolve a static ELF's dynamic dependency section. Filesystem/jail isolation, UID/GID dropping, `no_new_privs` and the capability bounding set remain enabled.

## Nginx integration

`nginx-telego` installs:

```text
/etc/nginx/conf.d/telego.conf
/etc/nginx/snippets/telego.locations
```

`telego.conf` is safe in the Nginx `http {}` context and provides the `map` and `upstream` definitions required by the WEB proxy.

The public TLS `server {}` configuration must include:

```nginx
include /etc/nginx/snippets/telego.locations;
```

The snippet keeps the private telEgo WEB listener on HTTP/1.1, forwards WebSocket upgrade headers and handles the upstream fallback statuses `418` and `419`. The package intentionally does not hard-code the public certificate or an ordinary website because those are deployment-specific.

The upstream telEgo WEB contract uses a private WEB listener on `127.0.0.1:8080`. The TLS splice endpoint and certificate source are separate Nginx listeners.

## Upstream synchronization

`telego-src` points to an exact upstream commit. Updating telEgo means changing the submodule pointer, reviewing the OpenWrt patch against the new source, updating package versions/releases and passing the complete CI build before publication.

## License

This fork is distributed under Apache License 2.0. The upstream Scratch-net/telego source is also Apache-2.0 and retains its own copyright and license notices in the `telego-src` submodule.
