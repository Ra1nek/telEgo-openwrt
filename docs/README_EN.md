# telEgo OpenWrt documentation

[Русский](README.md) · **English**

This directory contains the technical documentation for the `develop` branch of `telEgo-openwrt`. The documentation is organized by task so you can go directly to installation, configuration, troubleshooting, or system internals without reading the whole repository.

> [!NOTE]
> `telEgo-openwrt` integrates a pinned version of [`Scratch-net/telego`](https://github.com/Scratch-net/telego) with OpenWrt. The Go core lives in the `telego-src/` submodule; this repository adds APK packaging, LuCI, UCI/procd/ujail integration, local rpcd telemetry, Nginx integration, the installer, and CI/CD.

## Where to start

| Goal | Open |
|---|---|
| Install telEgo on OpenWrt | **[Installation](INSTALL_EN.md)** |
| Register a domain and configure DNS | **[Domain and DNS](DOMAIN_EN.md)** |
| Install and configure Cloudflare Tunnel | **[Cloudflare Tunnel](CLOUDFLARE_EN.md)** |
| Configure MTProxy, FakeTLS, WEB Proxy, or Middle-End | **[Configuration and LuCI](CONFIGURATION_EN.md)** |
| Understand traffic flow and system design | **[Architecture](ARCHITECTURE_EN.md)** |
| Work with `ubus`, rpcd, or Prometheus | **[Local API and telemetry](API_EN.md)** |
| Diagnose a failure | **[Troubleshooting](TROUBLESHOOTING_EN.md)** |
| Review isolation and network hardening | **[Security](SECURITY_EN.md)** |
| Build APKs or prepare a release | **[Build and release](BUILD_EN.md)** |

## Documentation sections

### [Architecture](ARCHITECTURE_EN.md)

How the project is assembled and how traffic moves through the system:

- boundaries between the upstream core and the OpenWrt integration;
- Go → OpenWrt SDK → APK build pipeline;
- UCI → `/var/etc/telego.toml` → procd/ujail runtime lifecycle;
- MTProxy traffic path;
- Telegram Middle-End, Link Repair, and Link Refresh;
- Native WEB Proxy, Nginx, Lanes, and the `418/419` fallback contract.

### [Installation](INSTALL_EN.md)

Supported installation and upgrade paths:

- OpenWrt 25.12.x / x86_64 requirements;
- interactive `install.sh` workflow;
- preview and stable channels;
- SHA-256 integrity checks and APK signature trust;
- `--allow-untrusted`;
- manual package installation;
- first verification after installation.

### [Domain and DNS](DOMAIN_EN.md)

A standalone guide to choosing, registering, and configuring a domain:

- choosing a TLD and registrar;
- international and country-code domain requirements;
- considerations for users in Russia and ESIA verification for `.RU/.РФ/.SU`;
- a step-by-step `.ru` registration example using Timeweb;
- authoritative nameservers, delegation, and NS verification;
- DNSSEC and registrar-account security;
- a minimal example of connecting an existing domain to Cloudflare DNS.

### [Cloudflare Tunnel](CLOUDFLARE_EN.md)

Practical OpenWrt 25.12.x runbook:

- remotely-managed Tunnel and Tunnel token;
- official `cloudflared`/`luci-app-cloudflared` APK packages;
- LuCI and UCI/procd setup;
- outbound TCP/UDP 7844 with no inbound port-forward;
- Published application → `http://127.0.0.1:18080`;
- health checks, logs, token rotation, and troubleshooting;
- credential boundary between `cloudflared` and telEgo.

### [Configuration and LuCI](CONFIGURATION_EN.md)

The main administrator guide:

- all UCI sections and defaults;
- UCI-to-generated-TOML mapping;
- step-by-step explanation of every LuCI field;
- MTProxy and FakeTLS;
- DRS and Split-TLS;
- users and 128-bit secrets;
- WEB Proxy carriers: `https`, `https-lanes`, `websocket`, `websocket-lanes`;
- Telegram Middle-End;
- performance, upstream SOCKS5, and metrics.

### [Local API and telemetry](API_EN.md)

The local OpenWrt integration surface:

- `ubus call telego status`;
- rpcd/ucode backend;
- LuCI status fields;
- local Prometheus endpoint;
- application ACL;
- loopback restrictions for metrics access.

> [!IMPORTANT]
> The current fork does not expose a public management REST API on port `9091`. Configuration is managed through UCI/LuCI/procd; service state is read through local `ubus`/rpcd and Prometheus.

### [Build and release](BUILD_EN.md)

For developers and maintainers:

- Go 1.27 and the pinned upstream submodule;
- OpenWrt integration validation;
- static PIE build;
- OpenWrt SDK 25.12.5;
- APK feed and `packages.adb` generation;
- develop preview publishing;
- signed stable releases;
- upstream `telego-src/` synchronization.

### [Troubleshooting](TROUBLESHOOTING_EN.md)

Focused diagnostic paths for common failures:

- service enabled but not running;
- LuCI page missing;
- `ubus` or telemetry unavailable;
- MTProxy unreachable from the Internet;
- WEB Proxy or Nginx fallback problems;
- APK installation failures;
- GitHub Actions not producing an expected package.

### [Security](SECURITY_EN.md)

The OpenWrt security model and upstream telEgo network hardening:

- dedicated `telego:telego` service account;
- mandatory `ujail` and `no_new_privs`;
- narrow `CAP_NET_BIND_SERVICE` capability;
- generated runtime configuration with mode `0600`;
- DRS, Split-TLS, and profile matching;
- `X25519MLKEM768` key-share parity;
- replay/probe handling;
- Nginx `419` sanitization;
- APK and signing-key trust boundaries.

## Implementation references

When you need to verify how a feature is implemented, start with the corresponding project files:

| Area | Primary files |
|---|---|
| Build and releases | `.github/workflows/build-telego.yaml`, `.github/workflows/release.yaml` |
| Package metadata | `package/*/Makefile` |
| Default UCI configuration | `package/telego-pkg/files/config/telego` |
| UCI → TOML conversion and service startup | `package/telego-pkg/files/init.d/telego` |
| LuCI interface | `package/luci-app-telego/htdocs/resources/view/telego/config.js` |
| Local telemetry | `package/luci-app-telego/root/usr/share/rpcd/ucode/telego` |
| LuCI permissions | `package/luci-app-telego/root/usr/share/rpcd/acl.d/luci-app-telego.json` |
| Nginx integration | `package/nginx-telego/files/` |
| telEgo Go core | `telego-src/` submodule |

## Supported platform

| Component | Current state |
|---|---|
| OpenWrt | `25.12.x` |
| CI target | `25.12.5` |
| Architecture | `x86_64` |
| Package manager | `apk` |
| Go in the production workflow | `1.27` |
| Upstream telEgo | pinned `v0.6.2` |
| License | Apache-2.0 |

The project builds four APK packages:

```text
telego-pkg
luci-app-telego
luci-i18n-telego-ru
nginx-telego
```

Return to the project overview: **[README_EN.md](../README_EN.md)**.
