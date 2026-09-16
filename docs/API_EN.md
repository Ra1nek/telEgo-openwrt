# Local Integration and Telemetry API

`telEgo-openwrt` exposes a **local OpenWrt integration surface**, not a public REST management API.

> [!IMPORTANT]
> The current fork does **not** implement the historical `/api/v1/status`, `/users`, `/config/reload` or port-`9091` management API previously described in this repository. Configuration is managed through UCI/LuCI/procd. Service telemetry and scoped Nginx file administration are exposed through local `ubus`/rpcd; runtime counters are also available through Prometheus metrics.

## Surfaces

| Interface | Purpose | Scope |
|---|---|---|
| `ubus call telego status` | Read service state + selected counters | Local OpenWrt rpcd, read-only |
| `ubus call telego.nginx inventory` | Inventory managed/foreign/quarantined Nginx files | Local OpenWrt rpcd, read-only |
| `telego.nginx managed_content` | Read package-owned active/canonical content for diff | Local OpenWrt rpcd, read-only |
| `telego.nginx quarantine/restore/delete_*` | Explicit guarded operations on foreign/custom `.conf` files | Local OpenWrt rpcd, write |
| `telego.nginx repair` | Delegate managed-state repair to the P7 reconciler | Local OpenWrt rpcd, write |
| UCI `telego` | Read/write main configuration | Local OpenWrt config |
| UCI `nginx_telego` | Desired state for managed Nginx ingress/fallback | Local OpenWrt config |
| Prometheus metrics endpoint | Detailed runtime metrics | HTTP endpoint configured by `metrics.bind_to`/`metrics.path` |
| `service.list` | procd service instance state | Local ubus |

## `ubus` status method

Call:

```sh
ubus call telego status
```

Example shape:

```json
{
  "running": true,
  "pid": 1234,
  "uptime": 3600,
  "connections": 12,
  "ips_active": 5,
  "ips_tracked": 8,
  "ips_blocked": 0,
  "rx_bytes": 12345678,
  "tx_bytes": 87654321
}
```

### Fields

| Field | Type | Meaning |
|---|---|---|
| `running` | boolean | Whether a `telego` procd instance is running |
| `pid` | integer | Running process PID, or `0` |
| `uptime` | integer | Approximate process uptime in seconds |
| `connections` | integer | Active connection metric accumulated by the backend |
| `ips_active` | integer | Active IP count |
| `ips_tracked` | integer | Tracked IP count |
| `ips_blocked` | integer | Blocked IP count |
| `rx_bytes` | integer | Total inbound traffic bytes exposed to LuCI |
| `tx_bytes` | integer | Total outbound traffic bytes exposed to LuCI |

The rpcd implementation is `package/luci-app-telego/root/usr/share/rpcd/ucode/telego`.

## How status is assembled

```mermaid
flowchart LR
    C[ubus call telego status] --> RPC[rpcd ucode telego]
    RPC --> S[ubus service.list\nname=telego]
    RPC --> P[/proc/PID/stat + /proc/uptime]
    RPC --> M[local Prometheus endpoint]
    S --> O[status JSON]
    P --> O
    M --> O
```

Service state/PID come from `service.list`; process uptime is calculated from `/proc`; counters are parsed from the configured metrics endpoint.

## Nginx file API: `telego.nginx`

P8 exposes a separate local ubus object:

```text
telego.nginx
```

The backend lives at:

```text
package/luci-app-telego/root/usr/share/rpcd/ucode/telego-nginx
```

It does **not perform direct filesystem mutations**. All privileged Nginx file operations are delegated to the fixed helper:

```text
/usr/libexec/nginx-telego-admin
```

Browser/rpcd input supplies only constrained method arguments to the helper, never an arbitrary absolute path. See [NGINX_FILES_EN.md](NGINX_FILES_EN.md) for the complete ownership and administration contract.

### `inventory`

Call:

```sh
ubus call telego.nginx inventory
```

Response shape:

```json
{
  "ok": true,
  "files": [
    {
      "kind": "managed",
      "name": "20-telego-core.conf",
      "path": "/etc/nginx/conf.d/20-telego-core.conf",
      "role": "core",
      "ownership": "package",
      "state": "ok",
      "source": "/usr/share/nginx-telego/templates/20-telego-core.conf"
    }
  ],
  "unsafe_count": 0,
  "error": ""
}
```

`kind` can be `managed`, `foreign`, or `quarantined`. `unsafe_count` reports entries that the helper intentionally does not expose as actionable because of unsafe names/path types.

### `managed_content`

This method exists only for package-owned diff display in LuCI.

```sh
ubus call telego.nginx managed_content '{"role":"core","side":"source"}'
ubus call telego.nginx managed_content '{"role":"core","side":"active"}'
```

Parameters:

- `role`: only `core` or `locations`;
- `side`: only `active` or `source`.

Successful response:

```json
{
  "ok": true,
  "content": "...",
  "error": ""
}
```

Generated `ingress`/`fallback` roles are not readable through this method.

### Mutation methods

All mutation methods accept a logical file name, not a path:

```sh
ubus call telego.nginx quarantine '{"name":"50-custom.conf"}'
ubus call telego.nginx restore '{"name":"50-custom.conf"}'
ubus call telego.nginx delete_active '{"name":"50-custom.conf"}'
ubus call telego.nginx delete_quarantined '{"name":"50-custom.conf"}'
```

Successful mutations share this response shape:

```json
{
  "ok": true,
  "message": "...",
  "error": ""
}
```

When the helper rejects an operation:

```json
{
  "ok": false,
  "message": "",
  "error": "nginx-telego-admin: ..."
}
```

The security boundary remains in `nginx-telego-admin`: safe direct-child `*.conf` names, ownership preflight, package-owned mutation protection, shared kernel `flock(2)`, `nginx -t`, reload-if-running, and rollback for active-tree changes.

### `repair`

```sh
ubus call telego.nginx repair
```

`repair` does not implement a second repair engine. The helper delegates to the existing P7 path:

```text
/usr/libexec/nginx-telego-reconcile apply
```

This preserves one ownership model, one lock boundary, and one reconciliation contract.

## Metrics endpoint

Default UCI configuration:

```text
config metrics 'metrics'
    option bind_to '127.0.0.1:9090'
    option path '/metrics'
    option diagnostics '0'
```

Direct check:

```sh
uclient-fetch -q -T 2 -O - http://127.0.0.1:9090/metrics
```

The LuCI/rpcd backend consumes these metric names when present:

```text
telego_connections_active
telego_ips_active
telego_ips_tracked
telego_ips_blocked
telego_traffic_in_bytes_total
telego_traffic_out_bytes_total
```

The upstream daemon may expose additional metrics. This document only lists the counters consumed by the OpenWrt telemetry adapter.

### rpcd fetch restrictions

For safety, the local telemetry backend does not fetch arbitrary administrator-supplied URLs. It accepts only:

- `127.0.0.1:<valid-port>`; or
- `[::1]:<valid-port>`;
- a path beginning with `/` and limited to URL-safe characters accepted by the implementation.

The fetch uses `uclient-fetch` with a short timeout.

Consequences:

- leaving metrics on default loopback gives LuCI live counters;
- moving the daemon metrics listener to a non-loopback address can make the daemon endpoint reachable elsewhere, but the LuCI rpcd adapter intentionally refuses to fetch it and returns zero counters;
- service state/PID can still be reported even when metrics are unavailable.

## LuCI ACL

`luci-app-telego` grants the web UI these logical permissions:

```json
{
  "read": {
    "uci": ["telego", "nginx_telego"],
    "ubus": {
      "service": ["list"],
      "telego": ["status"],
      "telego.nginx": ["inventory", "managed_content"]
    }
  },
  "write": {
    "uci": ["telego", "nginx_telego"],
    "ubus": {
      "telego.nginx": ["quarantine", "restore", "delete_active", "delete_quarantined", "repair"]
    }
  }
}
```

`telego.status` remains read-only. `telego.nginx` deliberately separates read and write methods. Normal configuration is persisted through UCI; P8 write methods are only for explicit Nginx file-administration operations.

## Configuration through UCI

Read a non-secret value:

```sh
uci -q get telego.general.enabled
```

Change and apply:

```sh
uci set telego.general.log_level='debug'
uci commit telego
/etc/init.d/telego reload
```

Managed Nginx desired state is stored separately in `/etc/config/nginx_telego` and applied through `/etc/init.d/nginx-telego reload`, which invokes the P7 reconciler.

For complete option mapping see [CONFIGURATION_EN.md](CONFIGURATION_EN.md); for ownership/reconciliation/administration semantics see [NGINX_FILES_EN.md](NGINX_FILES_EN.md).

## procd service information

The underlying OpenWrt service information can also be inspected directly:

```sh
ubus call service list '{"name":"telego"}'
```

Use `ubus call telego status` for the stable project-facing summary; the raw `service.list` structure is OpenWrt/procd-specific.

## Error/failure behavior

The LuCI page is designed to remain usable for configuration if telemetry cannot be read. Typical outcomes:

- rpcd telemetry backend missing/restart required → status call fails;
- daemon stopped → `running=false`, `pid=0`;
- metrics endpoint unavailable → service state may still be returned, counters fall back to zero;
- non-loopback metrics address → rpcd refuses the fetch by design;
- `nginx-telego-admin` unavailable → `telego.nginx` returns `ok=false` / `admin-helper-unavailable`;
- unsafe/owned/colliding Nginx target → the helper rejects the operation and returns its diagnostic through `error`;
- `nginx -t` or reload failure after an active-tree mutation → the helper rolls the filesystem state back and returns an error.

See [TROUBLESHOOTING_EN.md](TROUBLESHOOTING_EN.md#luci-status-or-telemetry-is-unavailable) and [NGINX_FILES_EN.md](NGINX_FILES_EN.md).

## Security notes

- Do not expose ubus/rpcd directly to the Internet.
- Do not add write operations to `telego.status`; configuration belongs to UCI and existing LuCI ACL controls.
- Do not add arbitrary-path filesystem access to `telego.nginx`; the root mutation boundary must remain in `nginx-telego-admin`.
- Do not bypass ownership checks, shared flock, `nginx -t`, and P8 rollback with direct `rm`/`mv` from rpcd/LuCI.
- Do not replace the loopback-only metrics fetch guard with arbitrary URL fetching.
- Do not publish `uci show telego` output because secret values are stored in UCI.
