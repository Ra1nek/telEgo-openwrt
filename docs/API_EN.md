# Local Integration and Telemetry API

`telEgo-openwrt` exposes a **local OpenWrt integration surface**, not a public REST management API.

> [!IMPORTANT]
> The current fork does **not** implement the historical `/api/v1/status`, `/users`, `/config/reload` or port-`9091` management API previously described in this repository. Configuration is managed through UCI/LuCI/procd. Status is exposed through local `ubus`/rpcd and Prometheus metrics.

## Surfaces

| Interface | Purpose | Scope |
|---|---|---|
| `ubus call telego status` | Read service state + selected counters | Local OpenWrt rpcd |
| UCI `telego` | Read/write configuration | Local OpenWrt config |
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

`luci-app-telego` grants the web UI the following logical permissions:

```json
{
  "read": {
    "uci": ["telego"],
    "ubus": {
      "service": ["list"],
      "telego": ["status"]
    }
  },
  "write": {
    "uci": ["telego"]
  }
}
```

The status RPC method itself is read-only; configuration changes are persisted through UCI.

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

For complete option mapping see [CONFIGURATION.md](CONFIGURATION.md).

## procd service information

The underlying OpenWrt service information can also be inspected directly:

```sh
ubus call service list '{"name":"telego"}'
```

Use `ubus call telego status` for the stable project-facing summary; the raw `service.list` structure is OpenWrt/procd-specific.

## Error/failure behavior

The LuCI page is designed to remain usable for configuration if telemetry cannot be read. Typical outcomes:

- rpcd backend missing/restart required → status call fails;
- daemon stopped → `running=false`, `pid=0`;
- metrics endpoint unavailable → service state may still be returned, counters fall back to zero;
- non-loopback metrics address → rpcd refuses the fetch by design.

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md#luci-status-or-telemetry-is-unavailable).

## Security notes

- Do not expose ubus/rpcd directly to the Internet.
- Do not add write operations to `telego.status`; configuration belongs to UCI and existing LuCI ACL controls.
- Do not replace the loopback-only metrics fetch guard with arbitrary URL fetching.
- Do not publish `uci show telego` output because secret values are stored in UCI.
