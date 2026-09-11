# Cloudflare Tunnel on OpenWrt

[Русский](CLOUDFLARE.md) · **English**

This document describes installing and operating `cloudflared` on OpenWrt 25.12.x for the `telEgo-openwrt` WEB Proxy.

> [!NOTE]
> This guide was verified against Cloudflare and the official OpenWrt feeds on **September 11, 2026**. New deployments use a **remotely-managed Tunnel**, which Cloudflare recommends for most production use cases.

Prepare the domain first using **[DOMAIN_EN.md](DOMAIN_EN.md)**.

## 1. Architecture

Current Cloudflare WEB path:

```text
Internet client
      |
      | HTTPS :443
      v
Cloudflare Edge
      |
      | Cloudflare Tunnel
      v
cloudflared (OpenWrt)
      |
      | HTTP loopback
      v
127.0.0.1:18080  Nginx adapter
      |
      v
127.0.0.1:8080   telEgo WEB listener
      |
      v
telEgo core
      |
      v
127.0.0.1:15301  Forkop/sing-box SOCKS5
```

The fallback site remains a separate local backend on `127.0.0.1:8090` and is handled by the Nginx adapter according to the WEB fallback contract.

Key properties:

- Cloudflare Tunnel is used **only for WEB Proxy**;
- native MTProxy is not moved into the Tunnel;
- public HTTPS/443 is served by Cloudflare Edge;
- inbound WAN TCP/443 is not required on OpenWrt for WEB Proxy;
- the Tunnel is established with outbound connections from OpenWrt;
- the Cloudflare local origin is `http://127.0.0.1:18080`;
- the public hostname certificate is not stored on OpenWrt;
- Tunnel credentials belong to `cloudflared`, not `telego`.

## 2. Why remotely-managed Tunnel

Cloudflare recommends remotely-managed tunnels for most use cases. Their ingress/routes are stored and managed in Cloudflare Dashboard/API, while the OpenWrt connector only needs the Tunnel token to run.

This fits the project better than locally-managed `cert.pem` + YAML:

- less local state;
- no account origin certificate on the router;
- centralized published-application configuration;
- simpler token rotation;
- native OpenWrt UCI/procd packaging.

> [!IMPORTANT]
> For a normal installation, do not create a local Tunnel with `cloudflared tunnel login` / `cloudflared tunnel create` and do not copy `cert.pem` unless you have a specific requirement for the legacy/local-management workflow.

## 3. OpenWrt 25.12.x package state

`cloudflared` and its LuCI frontend are available from the official OpenWrt 25.12.x feeds.

At the time of verification for OpenWrt 25.12.5 / x86_64:

```text
cloudflared                  2026.7.3-r1
luci-app-cloudflared         1.2-r1
luci-i18n-cloudflared-ru     available in the official LuCI feed
```

There is no need to download a `cloudflared` binary manually from GitHub Releases or maintain a custom init script.

## 4. Create the Tunnel in Cloudflare

In the current Cloudflare Dashboard:

1. Open **Networking -> Tunnels**.
2. Select **Create a tunnel**.
3. Enter a descriptive Tunnel name.
4. Create the Tunnel.
5. Open the new Tunnel.
6. On Overview, use **Add a replica** / the installation command to obtain the Tunnel token.

The Tunnel token is a long string that commonly starts with `eyJ...`.

> [!CAUTION]
> The Tunnel token is a secret. Anyone who obtains it can start a connector for your Tunnel. Never commit a real token to GitHub or paste it into documentation, issues, or screenshots.

Cloudflare may show the Tunnel as `Inactive` until `cloudflared` connects from OpenWrt. That is expected.

## 5. Install packages on OpenWrt

Connect to OpenWrt over SSH and refresh package indexes:

```sh
apk update
```

Install the official packages:

```sh
apk add cloudflared luci-app-cloudflared luci-i18n-cloudflared-ru
```

If the Russian LuCI translation is not needed:

```sh
apk add cloudflared luci-app-cloudflared
```

Verify the installation:

```sh
cloudflared --version
apk info cloudflared
```

## 6. Configure through LuCI

After installation, open:

**VPN -> Cloudflare Zero Trust Tunnel -> Configuration**

For a remotely-managed Tunnel:

1. Enable **Enable**.
2. Paste the Tunnel token into **Token**.
3. Leave **Config file path** and **Certificate of Origin** unused for the token-based Tunnel.
4. Keep the logging level at `info` for normal operation.
5. Save and apply.

Additional LuCI pages:

- **Tunnels** — tunnel information;
- **Log** — `cloudflared` log view.

## 7. Equivalent UCI configuration

For automation or SSH, configure the same official package directly:

```sh
uci set cloudflared.config.enabled='1'
uci set cloudflared.config.token='<TUNNEL_TOKEN>'
uci set cloudflared.config.protocol='auto'
uci set cloudflared.config.loglevel='info'
uci commit cloudflared

/etc/init.d/cloudflared enable
/etc/init.d/cloudflared restart
```

Replace `<TUNNEL_TOKEN>` with the real token and do not preserve commands containing the token in public shell transcripts.

The OpenWrt configuration is stored at:

```text
/etc/config/cloudflared
```

The service init script is:

```text
/etc/init.d/cloudflared
```

For remotely-managed mode, the OpenWrt package launches the equivalent of:

```text
cloudflared tunnel --no-autoupdate ... run --token <TOKEN>
```

The package uses `procd`, enables `respawn`, and watches the `wan` interface by default. On an `interface.*.up` event it restarts `cloudflared`.

> [!IMPORTANT]
> `enabled=1` in UCI permits the service instance to run, while `/etc/init.d/cloudflared enable` adds it to the OpenWrt boot lifecycle. Persistent operation requires both states.

## 8. Protocol and firewall

Keep:

```text
protocol = auto
```

unless you have a confirmed reason to force `quic` or `http2`.

Cloudflare Tunnel establishes connections **outbound from OpenWrt**. Cloudflare requires outbound port `7844` for Tunnel operation:

- UDP/7844 — QUIC;
- TCP/7844 — HTTP/2.

A normal OpenWrt firewall permits outbound WAN traffic, so an additional rule is usually unnecessary.

If strict egress filtering is enabled, allow the required Cloudflare Tunnel destinations on TCP/UDP 7844 according to Cloudflare's current documentation.

Do not open inbound WAN 7844 and do not port-forward 7844 to the router.

## 9. Verify the local origin before Cloudflare

First confirm that the local chain works without the Tunnel.

Check listeners:

```sh
netstat -lntp 2>/dev/null | grep -E ':18080|:8080|:8090'
```

Check Nginx:

```sh
nginx -t
```

Check the local HTTP origin:

```sh
wget -S -O- http://127.0.0.1:18080/ 2>&1 | head -n 40
```

If `curl` is installed:

```sh
curl -v --max-time 10 http://127.0.0.1:18080/
```

A Tunnel does not repair a broken local origin. If `127.0.0.1:18080` is not working correctly, fix Nginx/telEgo first.

## 10. First start and connector verification

Check the service:

```sh
/etc/init.d/cloudflared status
```

Additional checks:

```sh
ubus call service list '{"name":"cloudflared"}'
ps w | grep '[c]loudflared'
```

Read the system log:

```sh
logread -e cloudflared
```

The stock OpenWrt configuration also sets the logfile to:

```text
/var/log/cloudflared.log
```

So this is useful as well:

```sh
tail -n 100 /var/log/cloudflared.log
```

> [!CAUTION]
> Do not publish the complete output of `uci show cloudflared`; it may contain the Tunnel token.

## 11. Verify the Tunnel in Cloudflare

Return to **Networking -> Tunnels**.

After the connector connects successfully, the Tunnel should become **Healthy**.

Cloudflare status meanings:

| Status | Meaning |
|---|---|
| `Healthy` | Connector is connected and the Tunnel is serving traffic |
| `Inactive` | Tunnel exists but a connector has never connected |
| `Down` | Connector was previously connected but is currently offline |
| `Degraded` | Tunnel is serving traffic but some Cloudflare connections have failed |

`Healthy` confirms the `cloudflared <-> Cloudflare` path, but it does not prove that the local origin is healthy. Verify `127.0.0.1:18080` separately.

## 12. Published application for telEgo WEB

Once the Tunnel is Healthy:

1. Open the Tunnel.
2. Open **Routes**.
3. Select **Add route**.
4. Select **Published application**.
5. Enter the hostname, for example:

```text
web.example.com
```

6. Set **Service URL** to the local HTTP adapter:

```text
http://127.0.0.1:18080
```

7. Save the route.

Cloudflare automatically creates/associates the DNS record for the hostname with the Tunnel.

For this architecture, do not use:

```text
https://127.0.0.1:18080
https://web.example.com
http://<WAN-IP>:18080
```

The required origin is:

```text
http://127.0.0.1:18080
```

## 13. End-to-end verification

From an external network, open:

```text
https://web.example.com
```

Or inspect the response headers:

```sh
curl -vkI https://web.example.com/
```

The deployment is considered valid when all of the following are true:

- the hostname resolves through Cloudflare;
- Cloudflare Tunnel reports `Healthy`;
- `cloudflared` is running under `procd`;
- local origin `127.0.0.1:18080` responds;
- the public HTTPS hostname responds through Cloudflare;
- inbound WAN TCP/443 is not opened for this WEB path.

## 14. Reboot and WAN reconnect behavior

The official OpenWrt package integrates with `procd`:

- the service starts at boot after `/etc/init.d/cloudflared enable`;
- failed processes are handled with `respawn`;
- the init script restarts `cloudflared` when the configured WAN interface comes up;
- `--no-autoupdate` disables the built-in `cloudflared` self-updater.

On OpenWrt, update `cloudflared` through the package manager rather than the built-in updater:

```sh
apk update
apk upgrade cloudflared
```

After an update, verify the service and Tunnel health again.

## 15. Token rotation

Cloudflare recommends rotating Tunnel tokens periodically.

After rotating the token in Cloudflare Dashboard:

1. Obtain the new token from Tunnel / Add a replica.
2. Replace the token in LuCI or UCI.
3. Restart the service:

```sh
/etc/init.d/cloudflared restart
```

4. Confirm that the Tunnel returns to `Healthy`.

UCI example without exposing a real token:

```sh
uci set cloudflared.config.token='<NEW_TUNNEL_TOKEN>'
uci commit cloudflared
/etc/init.d/cloudflared restart
```

If a token is compromised, rotate it immediately and, when necessary, force-disconnect existing Cloudflare connections.

## 16. Troubleshooting

### Tunnel remains Inactive

Check:

```sh
/etc/init.d/cloudflared status
logread -e cloudflared
tail -n 100 /var/log/cloudflared.log
```

Common causes:

- incorrect or expired/rotated token;
- DNS resolution failure on OpenWrt;
- outbound TCP/UDP 7844 blocked;
- service disabled in UCI;
- service not running.

### Tunnel is Healthy but the site does not work

This is usually no longer a Tunnel transport problem. Check the local origin:

```sh
nginx -t
wget -S -O- http://127.0.0.1:18080/ 2>&1 | head -n 40
netstat -lntp 2>/dev/null | grep -E ':18080|:8080|:8090'
```

Then verify that the Published application points exactly to:

```text
http://127.0.0.1:18080
```

### QUIC does not connect

Do not force another protocol blindly. First check outbound UDP/7844. In `auto` mode, `cloudflared` can select an appropriate transport; TCP/7844 is required for HTTP/2.

### Tunnel does not start after an OpenWrt update

Verify package and UCI state:

```sh
apk info cloudflared
ls -l /etc/config/cloudflared
/etc/init.d/cloudflared status
```

After `sysupgrade`, also confirm that the Tunnel token remained only in the expected `cloudflared` configuration and did not leak into public backup/log artifacts.

## 17. Security boundary

Cloudflare credentials are not part of telEgo configuration.

Never store the Tunnel token in:

```text
/etc/config/telego
/var/etc/telego.toml
GitHub Actions logs
GitHub issues
README examples
```

The stock OpenWrt integration stores the token in `/etc/config/cloudflared`. Treat that file as secret operational router state and protect administrative and backup access accordingly.

## 18. What is not required

This Cloudflare WEB mode does not require:

- `cloudflared tunnel login`;
- `cert.pem`;
- locally-managed Tunnel YAML for a normal installation;
- a Cloudflare API token on the router;
- inbound WAN TCP/443 for WEB Proxy;
- inbound WAN UDP/TCP 7844;
- an ACME/Let's Encrypt certificate on OpenWrt for the public WEB hostname;
- manual binary downloads from GitHub Releases;
- a custom `cloudflared` init.d script.

## 19. Official references

- Create a remotely-managed Tunnel: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/
- Tunnel routing / Published applications: https://developers.cloudflare.com/tunnel/routing/
- Tunnel tokens: https://developers.cloudflare.com/tunnel/advanced/tunnel-tokens/
- Tunnel with firewall: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-with-firewall/
- Monitoring: https://developers.cloudflare.com/tunnel/monitoring/
- Troubleshooting: https://developers.cloudflare.com/tunnel/troubleshooting/
- OpenWrt `cloudflared` package: https://github.com/openwrt/packages/tree/master/net/cloudflared
- OpenWrt `luci-app-cloudflared`: https://github.com/openwrt/luci/tree/master/applications/luci-app-cloudflared

Related document: **[Domain and DNS](DOMAIN_EN.md)**.
