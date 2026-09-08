# Installation

This guide covers the supported OpenWrt installation paths for `telEgo-openwrt`.

## Requirements

- OpenWrt `25.12.x` on `x86_64`.
- `root` access.
- Working OpenWrt package repositories and `apk`.
- At least 32 MiB free on `/tmp` and `/` for the interactive installer preflight.
- `uclient-fetch`, `wget` or `curl` for downloads.
- A free TCP port for MTProxy; the default project configuration is `0.0.0.0:443`.
- WAN firewall/NAT configuration when Internet clients must reach the router.

WEB Proxy additionally needs administrator-managed DNS, a public TLS certificate and Nginx server configuration. The project package does not provision those automatically.

## Choose an installation path

```mermaid
flowchart TD
    A[Need telEgo on OpenWrt?] --> B{Source}
    B -->|develop preview| P[Interactive install.sh\ndefault channel develop-latest]
    B -->|stable release| S[install.sh --release latest\nor explicit tag]
    B -->|downloaded CI artifact| C[scripts/install-on-router.sh\nor manual apk add]
    P --> T{Trusted APK signing key?}
    T -->|no| U[Explicit --allow-untrusted required]
    T -->|yes| I[Normal APK trust verification]
    S --> I
    C --> I
```

## Recommended: interactive installer

Run on the router as `root`:

```sh
wget -O /tmp/telego-install.sh \
  https://raw.githubusercontent.com/Ra1nek/telEgo-openwrt/develop/install.sh
sh /tmp/telego-install.sh
```

The installer is POSIX/OpenWrt `sh`; Bash and `jq` are not required on the router.

It always installs:

```text
telego-pkg
luci-app-telego
nginx-telego
nginx-ssl
```

The Russian LuCI translation `luci-i18n-telego-ru` is optional.

### Installer options

```text
--lang ru|en         UI language
--ru                 install Russian LuCI translation
--no-ru              skip Russian LuCI translation
--release TAG        release tag; default develop-latest
                     use latest for the latest stable release
--allow-untrusted    explicitly bypass APK signing-key trust checks
--yes                noninteractive confirmation
-h, --help           show help
```

Examples:

```sh
# Russian UI + translation, noninteractive preview install
sh /tmp/telego-install.sh \
  --lang ru --ru --yes --allow-untrusted

# English UI, no Russian translation
sh /tmp/telego-install.sh \
  --lang en --no-ru --yes --allow-untrusted

# Latest stable release, once published with a trusted signing path
sh /tmp/telego-install.sh \
  --lang en --no-ru --release latest --yes
```

> [!CAUTION]
> `--yes` does **not** imply `--allow-untrusted`. Preview packages without a trusted signing key require a separate explicit trust bypass.

## What the installer verifies

For the selected release channel it:

1. verifies OpenWrt `25.12.x` and `x86_64`;
2. checks required local tools and free space;
3. downloads `telego-install.sha256`;
4. selects exactly one matching APK for every requested project package;
5. verifies SHA-256 integrity;
6. performs an APK simulation/preflight;
7. installs the package set together;
8. preserves existing `/etc/config/telego` through the upgrade flow;
9. restarts required integration services where appropriate.

The `develop-latest` manifest is published only after the matching develop build succeeds. The preview publisher uploads the manifest after package assets so a racing installer fails integrity validation instead of silently mixing revisions.

## Package trust

There are two separate properties:

- **SHA-256 integrity** answers whether the downloaded bytes match the published manifest.
- **APK signature trust** answers whether the package signer is trusted by the router.

A matching checksum does not authenticate the publisher by itself.

For stable releases, install the publisher's APK public key through a trusted channel and verify its fingerprint independently before relying on signature trust. Never distribute or install the private signing key.

For a development artifact you have deliberately chosen to trust, `--allow-untrusted` is an explicit bypass. It is not the default.

## Install a downloaded artifact from your computer

The CI artifact contains the project feed. Pass the directory containing exactly one version of each project APK:

```bash
bash scripts/install-on-router.sh 192.168.1.1 ./x86_64/telego
```

For a deliberately trusted development artifact:

```bash
bash scripts/install-on-router.sh \
  --allow-untrusted 192.168.1.1 ./x86_64/telego
```

The helper:

- validates that exactly one APK exists for each of the four project packages;
- creates a private temporary directory on the router;
- copies only those APKs;
- runs `apk update` and installs all four together;
- restarts rpcd;
- removes the temporary files.

## Manual installation

Copy only the four project APKs into a private directory such as `/tmp/telego-install`:

```sh
cd /tmp/telego-install
apk update
apk add \
  ./telego-pkg-*.apk \
  ./luci-app-telego-*.apk \
  ./luci-i18n-telego-ru-*.apk \
  ./nginx-telego-*.apk
/etc/init.d/rpcd restart
```

For an explicitly trusted unsigned/untrusted development build:

```sh
apk add --allow-untrusted \
  ./telego-pkg-*.apk \
  ./luci-app-telego-*.apk \
  ./luci-i18n-telego-ru-*.apk \
  ./nginx-telego-*.apk
```

System dependencies should be resolved from the router's configured OpenWrt repositories; do not mix unrelated `base`, `luci`, `packages` feed APKs into the project install directory.

## First configuration

1. Open **Services → telEgo** in LuCI.
2. Add at least one user with a 32-hex-character secret.
3. Confirm the public MTProxy bind address/port does not conflict with another listener.
4. Configure TLS fronting as required.
5. Leave WEB Proxy disabled until Nginx/TLS is prepared.
6. Enable MTProxy.
7. Click **Save & Apply**.

The service then generates `/var/etc/telego.toml` and starts under procd/ujail as the unprivileged `telego` user.

## Verify the service

```sh
/etc/init.d/telego status
ubus call telego status
logread -e telego
```

Check the generated file metadata without exposing secrets:

```sh
ls -l /var/etc/telego.toml
```

Expected security properties are owner `telego:telego` and mode `0600` while the service is configured/running.

## WEB Proxy prerequisites

`nginx-telego` installs reusable integration files, not a complete public TLS site:

```text
/etc/nginx/conf.d/telego.conf
/etc/nginx/snippets/telego.locations
```

Inside the administrator-managed TLS `server {}` block, include:

```nginx
include /etc/nginx/snippets/telego.locations;
```

You are still responsible for:

- DNS for the configured WEB Proxy hostname;
- TLS certificate/private key;
- the public/private Nginx listener arrangement appropriate to your deployment;
- the ordinary-site fallback listener expected by the snippet if you use that path;
- WAN firewall/NAT rules.

See [ARCHITECTURE.md](ARCHITECTURE.md#web-proxy-and-nginx).

## Upgrade behavior

The interactive installer preserves existing `/etc/config/telego` and keeps a private backup under `/etc/telego-backups/`. If telEgo was running before an upgrade, the installer can restore normal service operation after package replacement.

Because runtime settings are converted to generated TOML, configuration ownership stays with UCI. Do not preserve/edit `/var/etc/telego.toml` as the source of configuration.

## Uninstall

Remove project packages with OpenWrt `apk` according to your desired component set. For example:

```sh
apk del luci-i18n-telego-ru luci-app-telego nginx-telego telego-pkg
```

Review `/etc/config/telego`, backups and any administrator-created Nginx/TLS configuration separately before deleting them; those may contain configuration you want to keep.

## Next steps

- [Configuration reference](CONFIGURATION.md)
- [Architecture](ARCHITECTURE.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [Security model](SECURITY.md)
