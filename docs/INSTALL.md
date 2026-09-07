# Installing telEgo on OpenWrt

## Requirements

- OpenWrt 25.12.5 x86_64 (the CI build target), with `apk` and working official repositories.
- SSH access as root and enough free space for the packages and dependencies.
- A free TCP listening port for MTProxy. The default is 443; check for an existing LuCI/uhttpd or Nginx listener before enabling it.
- For inbound Internet connections, an appropriate WAN firewall rule and, if needed, upstream NAT forwarding.

Plain MTProxy does not require a domain of your own or port 80. WEB Proxy additionally requires a public domain and a TLS certificate, plus the Nginx server configuration described in [README](../README.md#nginx-integration).

## Obtain the packages

Download a matching set from [GitHub Releases](https://github.com/Ra1nek/telEgo-openwrt/releases), when a release is available. For a development build, download and extract the `telEgo-openwrt-apk-feed` artifact from a successful [Build telEgo Packages run](https://github.com/Ra1nek/telEgo-openwrt/actions/workflows/build-telego.yaml).

Use the four files in the artifact's `x86_64/telego/` directory:

- `telego-pkg-0.6.1-r6.apk`
- `luci-app-telego-0.6.1-r7.apk`
- `luci-i18n-telego-ru-0.6.1-r2.apk`
- `nginx-telego-0.6.1-r3.apk`

Versions above describe this revision; future builds may increment them. Filenames use hyphens, not underscores. Keep exactly one version of each package in the installation directory. Do not mix in the artifact's `base`, `luci` or `packages` directories; resolve system dependencies from the router's configured repositories.

## Package trust

For signed releases, obtain the publisher's APK public key through a trusted channel, verify its fingerprint independently, and install it into `/etc/apk/keys/` before running `apk add`. A checksum alone does not establish who published a package. Do not substitute the private signing key.

Development workflow artifacts may use a temporary signing key that the router does not trust. Only for a build you have verified and chosen to trust, explicitly opt into `--allow-untrusted`. The installer does not bypass signature verification by default. If a release has no verifiable public key available, its trusted installation path is not yet ready.

## Install from your computer

From a Bash shell with SSH and SCP, pass the directory containing the four files:

```sh
bash scripts/install-on-router.sh 192.168.1.1 ./x86_64/telego
```

For a deliberately trusted development artifact:

```sh
bash scripts/install-on-router.sh --allow-untrusted 192.168.1.1 ./x86_64/telego
```

The script validates the local files, copies them to a private temporary directory, installs them together, and restarts rpcd. Dependency installation is handled by APK. Any failed transfer, installation or rpcd restart makes the script fail instead of reporting success.

## Manual installation on the router

Create `/tmp/telego-install`, copy only the four selected APKs into it, then run:

```sh
cd /tmp/telego-install
apk update
apk add ./telego-pkg-*.apk ./luci-app-telego-*.apk ./luci-i18n-telego-ru-*.apk ./nginx-telego-*.apk
/etc/init.d/rpcd restart
```

For an explicitly trusted development build, add `--allow-untrusted` to that `apk add` command.

## Configure and check

1. Open **Services → telEgo** in LuCI.
2. Generate a secret, choose an available listening address/port, and enable MTProxy.
3. Leave WEB Proxy disabled unless you have configured its domain, certificate and Nginx listeners. Its hostname is required only when WEB Proxy is enabled.
4. Click **Save & Apply**. Changed runtime settings restart the daemon, including secret changes; current connections will be interrupted. Disabling MTProxy stops the daemon, including its WEB listener.
5. Enable autostart if required: `/etc/init.d/telego enable`.

Check on the router:

```sh
/etc/init.d/telego status
ubus call telego status
logread -e telego
```

Connect Telegram from a separate network. After changing a secret, verify a new connection with the new secret succeeds and a new connection with the old secret fails. Test disabling, enabling and rebooting before relying on the service.

If the LuCI telemetry backend is unavailable, the configuration page should still open with a status error. Check rpcd logs and the installed `ucode-mod-*` dependencies. If the daemon fails to start, check port conflicts, valid secrets and the required `procd-ujail` package. The installer does not automatically configure a public Nginx TLS server or WAN firewall rules.
