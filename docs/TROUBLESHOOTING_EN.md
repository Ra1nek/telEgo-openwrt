# Troubleshooting

Use the smallest diagnostic path that matches the symptom. Avoid dumping full configuration or long logs unless necessary; `/etc/config/telego` contains secrets.

## Quick triage

```sh
uci -q get telego.general.enabled
/etc/init.d/telego status
ubus call telego status
logread -e telego
```

## Service is enabled but not running

Check:

```sh
uci -q get telego.general.enabled
/etc/init.d/telego status
logread -e telego
```

Common causes:

| Symptom | Likely area | Check |
|---|---|---|
| `missing /usr/bin/telego` | package install | `ls -l /usr/bin/telego` |
| `/sbin/ujail is required` | missing dependency | `ls -l /sbin/ujail` and installed package state |
| missing capability file | package integrity | `ls -l /etc/capabilities/telego.json` |
| failed to generate TOML | invalid UCI/secret | `logread -e telego`; inspect only the relevant UCI section |
| bind/listen failure | port conflict | inspect current listeners and configured `general.bind_to` |
| immediate restart loop | runtime/config/network failure | `logread -e telego` and focused upstream error |

### Secret validation failure

Secrets must be exactly 32 hexadecimal characters. Check only metadata when possible; do not paste the value into an issue.

List section names without printing secret values:

```sh
uci show telego | sed -n 's/^telego\.\([^.=]*\)\.name=.*/\1/p'
```

If you must inspect a secret, do it locally and do not share the output.

## LuCI page is missing

Verify the package and restart rpcd:

```sh
apk list -I | grep '^luci-app-telego'
/etc/init.d/rpcd restart
```

Check that the installed application files exist under:

```text
/www/luci-static/resources/view/telego/
/usr/share/luci/menu.d/
/usr/share/rpcd/acl.d/
/usr/share/rpcd/ucode/
```

Browser cache can preserve old LuCI assets after an upgrade; reload the page after rpcd/package changes.

## LuCI status or telemetry is unavailable

First test the project RPC directly:

```sh
ubus call telego status
```

If the object/method is missing:

```sh
/etc/init.d/rpcd restart
logread -e rpcd
```

If service state appears but counters remain zero, check metrics configuration without exposing secrets:

```sh
uci -q get telego.metrics.bind_to
uci -q get telego.metrics.path
```

The rpcd adapter only fetches literal loopback addresses. With defaults:

```sh
uclient-fetch -q -T 2 -O - http://127.0.0.1:9090/metrics
```

If this fails, check whether telEgo is running and whether the metrics listener/path was changed.

## `ubus call telego status` returns zero counters

Zero counters are valid when there is no traffic. If traffic is known to exist:

1. Confirm `running=true`.
2. Fetch the metrics endpoint directly.
3. Confirm the configured bind is `127.0.0.1:<port>` or `[::1]:<port>` for LuCI telemetry.
4. Check that the endpoint exposes the metric families consumed by the adapter:

```text
telego_connections_active
telego_ips_active
telego_ips_tracked
telego_ips_blocked
telego_traffic_in_bytes_total
telego_traffic_out_bytes_total
```

## MTProxy is unreachable from the Internet

Check the layers separately:

```mermaid
flowchart LR
    C[Client] --> F[WAN firewall/NAT]
    F --> L[general.bind_to]
    L --> J[procd/ujail]
    J --> D[telego daemon]
```

Verify:

- `general.enabled=1`;
- configured `general.bind_to`;
- no conflicting local listener;
- WAN firewall rule;
- upstream NAT/port forwarding if the router is behind another router;
- service logs after an external connection attempt.

The installer does not create WAN firewall rules.

## WEB Proxy does not work

Treat the path as separate stages:

```mermaid
flowchart LR
    C[Client] --> T[Public TLS path]
    T --> N[Nginx TLS server]
    N --> S[telego.locations]
    S --> W[127.0.0.1:8080]
    W --> D[telEgo WEB handler]
```

Check:

1. `uci -q get telego.web_proxy.enabled`
2. `uci -q get telego.web_proxy.bind_to`
3. `uci -q get telego.web_proxy.hostname`
4. Nginx configuration syntax: `nginx -t` when available.
5. The TLS `server {}` includes `/etc/nginx/snippets/telego.locations`.
6. DNS/certificate match the configured hostname.
7. The ordinary-site fallback target expected by the snippet exists if that path is used.
8. Nginx and telEgo logs around a single failed request.

Do not expose the private telEgo WEB listener directly to the Internet.

## Nginx fallback behaves unexpectedly

`telego.locations` distinguishes:

- `418` → ordinary website traffic;
- `419` → unauthenticated carrier-shaped request, sanitized before fallback.

If fallback fails, inspect the surrounding server and ordinary-site listener. Do not remove the header sanitization as a shortcut; it exists to prevent carrier credentials from being forwarded to the ordinary site.

## APK installation fails

Start with:

```sh
apk update
```

Then distinguish dependency and trust failures.

### Signature/trust failure

Preview APKs may require explicit trust bypass:

```sh
apk add --allow-untrusted ./telego-pkg-*.apk ...
```

Use this only for an artifact you have deliberately chosen to trust. A SHA-256 match proves integrity against the manifest, not publisher identity.

### Missing dependency

Do not manually copy random APKs from a CI artifact's unrelated feed directories. The router should resolve normal system dependencies from its configured OpenWrt repositories.

Confirm the router is OpenWrt `25.12.x` x86_64 and its repositories match the firmware.

## CI build failure

For GitHub Actions:

1. Open the failed job.
2. Find the failed step.
3. Extract the exact error plus a short surrounding range.
4. Check the directly relevant package Makefile/workflow/source.
5. After a fix, inspect the **new commit's run**.
6. Verify all four APKs and `packages.adb` exist in the final artifact.

Do not infer success from a green SDK step if an expected package was skipped; the project verification gate is designed to catch that.

## Safe diagnostic summary

This command set avoids printing user secrets:

```sh
printf 'enabled='; uci -q get telego.general.enabled || true
printf 'bind='; uci -q get telego.general.bind_to || true
printf 'web='; uci -q get telego.web_proxy.enabled || true
printf 'metrics='; uci -q get telego.metrics.bind_to || true
/etc/init.d/telego status || true
ubus call telego status || true
logread -e telego | tail -n 80
```

Before sharing logs, review them for public IPs, hostnames, proxy tags, credentials and secrets.

## Related documentation

- [Configuration](CONFIGURATION.md)
- [Local telemetry API](API.md)
- [Architecture](ARCHITECTURE.md)
- [Security](SECURITY.md)
