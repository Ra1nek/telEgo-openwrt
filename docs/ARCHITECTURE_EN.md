# Architecture

This document describes the current `develop` architecture of `telEgo-openwrt`: a pinned upstream `Scratch-net/telego` core wrapped in native OpenWrt 25.12.x packaging, service management, LuCI, rpcd telemetry, Nginx integration, and APK delivery.

> [!NOTE]
> `telego-src/` is the production Go source. OpenWrt-specific integration lives around it; this repository does not maintain a second independent Go fork.

## Scope

```mermaid
flowchart LR
    SRC["telego-src/<br/>pinned upstream"] --> PATCH["OpenWrt-only source patch"]
    PATCH --> BIN["/usr/bin/telego<br/>Go static PIE"]
    BIN --> PKG["telego-pkg"]
    PKG --> ROUTER["OpenWrt 25.12.x<br/>x86_64"]
    ROUTER --> PROCD["procd + ujail"]
    ROUTER --> LUCI["LuCI JS + rpcd ucode"]
    ROUTER --> NGINX["Nginx WEB integration"]
```

## Repository boundaries

| Area | Responsibility | Authoritative files |
|---|---|---|
| Upstream application | MTProxy/WEB Proxy core, FakeTLS, Middle-End, metrics, Go runtime | `telego-src/` |
| OpenWrt source delta | Small patch applied to pinned upstream before build | `.github/scripts/apply-upstream-patches.py` |
| Daemon package | Binary install, UCI defaults, procd/ujail runtime, capability profile | `package/telego-pkg/` |
| LuCI | Configuration UI and status view | `package/luci-app-telego/htdocs/` |
| Local telemetry | Read-only `ubus` method backed by service state + Prometheus metrics | `package/luci-app-telego/root/usr/share/rpcd/` |
| Translation | Russian LuCI translation | `package/luci-i18n-telego-ru/` |
| WEB Proxy edge | Nginx `http {}` definitions and reusable location snippet | `package/nginx-telego/` |
| CI/release | Validation, Go build, OpenWrt SDK APK build, feed/release publishing | `.github/workflows/` |
| Installation | Preview/stable download, integrity/trust checks, router installation | `install.sh`, `scripts/install-on-router.sh` |

## System overview

The product is split into a **control plane** and a **data plane**.

| Plane | Components | Purpose |
|---|---|---|
| Control plane | LuCI JS, UCI, init script, procd, rpcd | Configure, start/stop, generate runtime state, expose local status |
| Data plane | telEgo Go/gnet core, FakeTLS, WEB frontend, Middle-End/direct DC routes | Carry Telegram traffic |
| Edge integration | Nginx TLS + `telego.locations` | Real TLS termination, WEB ingress, ordinary-site fallback |

```mermaid
flowchart TB
    ADMIN["Administrator"] --> UI["LuCI JavaScript"]
    UI --> UCI["/etc/config/telego"]
    UCI --> INIT["/etc/init.d/telego"]
    INIT --> TOML["/var/etc/telego.toml<br/>0600 · telego:telego"]
    INIT --> PROCD["procd / ujail"]
    PROCD --> CORE["/usr/bin/telego<br/>Go + gnet"]

    CLIENT["Telegram clients"] --> CORE
    CORE --> DIRECT["Direct Telegram DC"]
    CORE --> ME["Telegram Middle-End"]
    WEB["Nginx real TLS"] --> WEBL["127.0.0.1:8080<br/>WEB listener"]
    WEBL --> CORE
```

## Build pipeline

```mermaid
flowchart TD
    C["Checkout repository + submodule"] --> I["Run integration checks"]
    C --> V["Determine PKG_VERSION"]
    V --> GO["Setup Go 1.27"]
    GO --> P["Apply OpenWrt source patch"]
    P --> T["gofmt / go vet / go test"]
    T --> B["Build x86_64 static PIE"]
    B --> E["Verify musl interpreter<br/>/lib/ld-musl-x86_64.so.1"]
    E --> SDK["OpenWrt SDK 25.12.5"]
    SDK --> A1["telego-pkg.apk"]
    SDK --> A2["luci-app-telego.apk"]
    SDK --> A3["luci-i18n-telego-ru.apk"]
    SDK --> A4["nginx-telego.apk"]
    SDK --> IDX["packages.adb"]
    A1 --> VERIFY["Verify complete feed"]
    A2 --> VERIFY
    A3 --> VERIFY
    A4 --> VERIFY
    IDX --> VERIFY
```

The production workflow is `.github/workflows/build-telego.yaml`. Releases repeat the relevant checks and build a signed feed in `.github/workflows/release.yaml`.

## Runtime configuration lifecycle

The administrator edits OpenWrt UCI state. The daemon never reads UCI directly.

```mermaid
sequenceDiagram
    participant Admin as LuCI / uci
    participant UCI as /etc/config/telego
    participant procd as procd / rc.common
    participant Init as /etc/init.d/telego
    participant TOML as /var/etc/telego.toml
    participant Core as /usr/bin/telego

    Admin->>UCI: modify + commit
    Admin->>procd: Save & Apply / reload
    procd->>Init: rebuild service instance
    Init->>TOML: generate temporary TOML
    Init->>TOML: chown telego:telego + chmod 0600 + atomic mv
    procd->>Core: run --config /var/etc/telego.toml
    Note over procd,Core: changed runtime config restarts the process
```

Important lifecycle behavior:

- `general.enabled=0` means no running procd instance.
- A changed generated runtime config restarts the daemon; secrets/listeners are not treated as hot-reloadable by the OpenWrt integration.
- `/var/etc/telego.toml` is generated state and must not be edited manually.
- The generated file is owned by `telego:telego` and mode `0600`.

## Service security boundary

```mermaid
flowchart LR
    PROCD["procd"] --> J["ujail<br/>requirejail"]
    J --> UID["telego:telego"]
    J --> NNP["no_new_privs"]
    J --> CAP["CAP_NET_BIND_SERVICE only"]
    J --> M1["/etc/ssl/certs/ca-certificates.crt"]
    J --> M2["/etc/resolv.conf + /etc/hosts"]
    J --> M3["/dev/urandom"]
    J --> RW["/var/etc<br/>read-write"]
```

The binary is deliberately built as a static PIE. The service does not request ujail `ronly` dependency discovery because that mechanism expects dynamic ELF dependency metadata. The jail, namespace/filesystem isolation, UID/GID drop, `no_new_privs`, and capability bounding remain active.

See [SECURITY.md](SECURITY.md).

## MTProxy traffic path

The public telEgo listener accepts both upstream MTProxy client variants on the same port and auto-detects the transport from the client handshake.

```mermaid
flowchart LR
    C["Telegram client"] --> L["Public telEgo listener<br/>for example :443"]
    L --> MODE{"Detected client mode"}
    MODE -->|"ee"| FTLS["FakeTLS-wrapped<br/>Obfuscated2"]
    MODE -->|"dd"| RAW["Raw Obfuscated2"]
    FTLS --> AUTH["Authenticated telEgo session core"]
    RAW --> AUTH
    AUTH --> ROUTE{"Selected route"}
    ROUTE -->|"direct"| DC["Telegram DC"]
    ROUTE -->|"Middle-End"| ME["ME link pool"]
    ME --> DC
```

The route is selected after authentication. An existing public TCP connection is not migrated from direct mode to Middle-End later; reconnecting allows a new route decision.

## Telegram Middle-End (ME)

Middle-End is an optional upstream transport. It is **not** the same thing as WEB Proxy and it is **not** provided by Nginx. Nginx only handles the WEB TLS edge; once a WEB or native MTProxy stream enters the shared telEgo session core, the route can be direct DC or Middle-End.

### Persistent link topology

Pinned upstream keeps **four physical gnet links for each signed Telegram DC** in the active generation.

```mermaid
flowchart LR
    SESSION["Authenticated session"] --> SELECT["Least-loaded healthy link"]
    SELECT --> L1["DC n · link 1"]
    SELECT --> L2["DC n · link 2"]
    SELECT --> L3["DC n · link 3"]
    SELECT --> L4["DC n · link 4"]
    L1 --> DC["Signed Telegram DC"]
    L2 --> DC
    L3 --> DC
    L4 --> DC
```

A binding stays on the physical link selected for it until that binding closes. This avoids silently moving an established binding between different ME link identities.

### Link Repair — replace one failed slot, not the whole pool

Every physical ME link is probed periodically. Upstream sends probes every **5 seconds** and treats a link as failed when no valid response arrives within **100 seconds**.

An ordinary slot failure triggers **in-place repair of that slot**:

```mermaid
flowchart LR
    FAIL["One physical link fails"] --> CLOSE["Bindings on failed slot close"]
    FAIL --> KEEP["Other slots / DC pools stay in place"]
    FAIL --> REPAIR["Prepare replacement for same slot"]
    REPAIR --> READY["Handshake + startup succeeds"]
    READY --> ADMIT["New bindings may use repaired slot"]
```

This is important operationally: one failing physical link does not force a full generation rebuild and does not relocate healthy bindings on neighboring links or other DC pools.

> [!NOTE]
> Bindings that were on the failed slot still terminate; telEgo does not claim lossless migration of an already-broken physical transport. The resilience property is **fault isolation**, not transparent session teleportation.

### Link Refresh — proactive turnover of unused links

Unused physical links become eligible for refresh after a staggered **45–60 second** idle period.

The replacement is prepared **before** the current link is retired:

```mermaid
sequenceDiagram
    participant Old as Current idle link
    participant M as ME manager
    participant New as Candidate link

    M->>New: create candidate after 45–60 s unused
    New->>New: complete ME handshake
    New->>New: receive matching RPC pong
    alt client binds to old link during preparation
        M-->>New: cancel candidate
        M-->>Old: preserve current binding
    else candidate is healthy and queues are empty
        M-->>New: publish replacement
        M-->>Old: retire old link
    end
```

Candidate preparation has a **10-second deadline**. A failed candidate leaves the current link unchanged and retries later with bounded delay. Each manager limits refresh reservations to avoid uncontrolled connection churn.

### Generation rotation

Telegram artifacts are refreshed periodically. When artifact content changes, telEgo builds and probes a candidate generation while the active generation continues admitting bindings. A successful candidate is published atomically; the previous generation drains for up to **90 seconds**.

> [!TIP]
> For capacity planning, treat Middle-End as a persistent connection pool with bounded queues and explicit FD/memory requirements, not as a stateless toggle.

## LuCI and telemetry

The LuCI application is JavaScript-only. Configuration writes go through UCI; status is read through a local rpcd ucode method.

```mermaid
flowchart LR
    UI["LuCI config.js"] -->|"read/write"| UCI["UCI telego"]
    UI -->|"rpc telego.status"| RPC["rpcd ucode backend"]
    RPC -->|"service.list"| PROCD["ubus service state"]
    RPC -->|"HTTP loopback"| MET["Prometheus metrics"]
    PROCD --> RPC
    MET --> RPC
```

`telego.status` returns service state, PID, process uptime, and selected counters. The rpcd backend intentionally refuses to fetch an administrator-supplied remote metrics endpoint: for LuCI telemetry, the configured metrics address must be literal loopback (`127.0.0.1` or `[::1]`).

See [API.md](API.md).

## Native WEB Proxy and Nginx

The `nginx-telego` package provides reusable integration, not a complete public website/TLS deployment.

Installed files:

```text
/etc/nginx/conf.d/telego.conf
/etc/nginx/snippets/telego.locations
```

`telego.conf` is included from Nginx `http {}` and defines:

- the WebSocket `Connection` mapping;
- `upstream telego_web` → `127.0.0.1:8080` with keepalive.

`telego.locations` must be included inside the administrator-managed TLS `server {}` block.

### Shared-port topology

The most capable topology lets telEgo own public `:443` for MTProxy/FakeTLS while ordinary TLS is spliced to a private Nginx TLS listener. Nginx then forwards decrypted WEB requests to the private telEgo WEB listener.

```mermaid
flowchart LR
    CLIENT["Telegram / HTTPS client"] --> PUB["Public telEgo TCP listener<br/>:443"]
    PUB -->|"authenticated MTProxy"| CORE["Shared telEgo session core"]
    PUB -->|"ordinary TLS splice"| TLS["Private Nginx TLS<br/>for example :8443"]
    TLS --> LOC["telego.locations"]
    LOC -->|"HTTP/1.1"| WEB["127.0.0.1:8080<br/>telEgo WEB listener"]
    WEB --> CORE
    CORE --> ROUTE{"Route"}
    ROUTE --> DIRECT["Direct Telegram DC"]
    ROUTE --> ME["Middle-End pools"]
```

This distinction matters: **Nginx terminates real TLS; telEgo owns carrier authentication/session routing; Middle-End is only one possible upstream route after that point.**

## WEB carrier modes and Lanes

The upstream WEB frontend supports four transport carriers:

| Carrier | Transport shape | Operational profile |
|---|---|---|
| `https` | One serialized fetch + long-poll carrier | Lowest Nginx feature requirement |
| `https-lanes` | Independent fetch/long-poll lane per Telegram stream | Conservative upstream recommendation; public HTTP/2 required |
| `websocket` | One multiplexed WebSocket for the WEB session | Requires forwarded HTTP/1.1 `Upgrade` / `Connection` headers |
| `websocket-lanes` | One WebSocket per active Telegram stream | Official lane-style WebSocket option |

### Lanes in plain language

A Telegram Desktop WEB session can contain multiple logical streams. A non-lane carrier multiplexes several streams through one carrier. A lane carrier gives each logical stream an independent transport lane.

```mermaid
flowchart LR
    APP["Telegram Desktop session"] --> S1["Logical stream A"]
    APP --> S2["Logical stream B"]
    APP --> S3["Logical stream C"]
    S1 --> L1["Lane A"]
    S2 --> L2["Lane B"]
    S3 --> L3["Lane C"]
    L1 --> WEB["telEgo WEB frontend"]
    L2 --> WEB
    L3 --> WEB
```

The commercial value is isolation at the carrier-scheduling layer: one logical stream does not have to share the exact same carrier sequence with every other stream. This should not be marketed as a guaranteed latency improvement; comparative performance still depends on the network and client behavior.

## Seamless ordinary-site fallback: 418 / 419

Every request for the WEB hostname is expected to pass through the telEgo WEB classifier. That allows the same hostname to present a normal website when a request is not an authenticated carrier request.

```mermaid
flowchart TD
    REQ["HTTPS request after Nginx TLS termination"] --> WEB["telEgo WEB classifier"]
    WEB -->|"valid carrier"| SESSION["Authenticated WEB session"]
    WEB -->|"418"| ORD["Ordinary request fallback"]
    WEB -->|"419"| SAN["Sanitized unauthenticated-carrier fallback"]
    ORD --> SITE["Ordinary site<br/>default target 127.0.0.1:8090"]
    SAN --> SITE
```

- **418** preserves an ordinary website request and routes it to the ordinary site.
- **419** is used for a carrier-shaped request that failed authentication. Nginx removes carrier credentials, body/content metadata, forwarded-address headers, and WebSocket/session headers before issuing a safe fallback request.

> [!IMPORTANT]
> The `419` sanitization is a security/privacy boundary. A custom Nginx deployment should preserve it instead of routing failed carrier requests directly to the ordinary site.

## Package relationships

```mermaid
flowchart TD
    T["telego-pkg"] --> CA["ca-bundle"]
    T --> UJ["procd-ujail"]
    L["luci-app-telego"] --> T
    L --> LB["luci-base"]
    L --> RPC["rpcd-mod-ucode"]
    L --> UCODE["ucode modules"]
    L --> FETCH["uclient-fetch"]
    RU["luci-i18n-telego-ru"] --> L
    NG["nginx-telego"] --> NGINX["nginx runtime dependency"]
```

Exact package dependency names and revisions belong to `package/*/Makefile`; this diagram intentionally avoids duplicating all version constraints.

## Upstream synchronization

Updating telEgo is not a normal copy-and-paste source replacement. The expected flow is:

1. Move the `telego-src` submodule pointer to the intended upstream commit/tag.
2. Re-evaluate `.github/scripts/apply-upstream-patches.py` against that exact source.
3. Update package versions/releases as required.
4. Run repository integration checks and upstream Go tests.
5. Build all four APKs through the OpenWrt SDK and verify `packages.adb`.
6. Only then publish/update a release channel.

See [BUILD.md](BUILD.md).
