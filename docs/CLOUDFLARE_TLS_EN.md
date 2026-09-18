# Cloudflare WEB TLS — ownership boundaries

[Русский](CLOUDFLARE_TLS.md) · [**English**](CLOUDFLARE_TLS_EN.md) · [Full Cloudflare Tunnel setup](CLOUDFLARE_EN.md)

This document defines the ownership boundary between Cloudflare WEB ingress, Direct HTTPS, and local Native Shared-Port TLS.

## Target Cloudflare flow

Public TLS for WEB Proxy belongs to Cloudflare Edge:

```text
Telegram Desktop
    ↓ HTTPS / WSS :443
Cloudflare Edge
    ↓ Cloudflare Tunnel
cloudflared
    ↓ HTTP
Nginx 127.0.0.1:18080
    ↓ HTTP/1.1
telEgo WEB 127.0.0.1:8080
```

The Cloudflare WEB path does not require a local WEB certificate, ACME/Let's Encrypt/certbot renewal, or a separate HTTPS origin on OpenWrt. The Published Application must use `http://127.0.0.1:18080`.

## Runtime invariant

When both conditions are true:

```text
nginx_telego.cloudflare.enabled = 1
nginx_telego.shared.enabled != 1
```

the `/var/etc/telego.toml` generator does not emit these Native Shared-Port endpoints into the active runtime:

```text
cert-host
cert-port
splice-host
splice-port
```

This applies only to endpoint fields that connect telEgo to the local Native Shared-Port TLS listeners. Other `tls-fronting` settings, including `mask-host`, `mask-port`, FakeTLS/DRS/Split-TLS and their runtime controls, are not removed when the ingress profile changes.

## Why UCI values are preserved

The integration does not delete the stored values:

```text
telego.tls_fronting.cert_host
telego.tls_fronting.cert_port
telego.tls_fronting.splice_host
telego.tls_fronting.splice_port
```

They may remain in `/etc/config/telego`, but they are inactive while Cloudflare is the exclusive managed ingress profile. This makes it possible to switch back to `Native Shared-Port` without re-entering advanced settings.

After switching back to:

```text
nginx_telego.cloudflare.enabled = 0
nginx_telego.shared.enabled = 1
```

the preserved endpoint values are emitted into the runtime TOML again and are validated by the normal Native Shared-Port contract.

## LuCI

On the main telEgo configuration page, while the exclusive Cloudflare profile is active, these fields are not shown:

- `Certificate Host`;
- `Certificate Port`;
- `Fallback Host`;
- `Fallback Port`.

This is a UI representation of the runtime contract, not deletion of UCI data.

In `Services → telEgo → WEB Ingress / Nginx Integration`, the Cloudflare profile still shows the local origin:

```text
http://127.0.0.1:18080
```

`TLS Certificate` and `TLS Private Key` belong only to `Native Shared-Port` mode.

## Reload contract

`/etc/init.d/telego` registers a reload trigger for `nginx_telego` when that UCI package exists. Switching ingress profile therefore rebuilds the telEgo runtime configuration as well as reconciling Nginx.

In other words, switching:

```text
Native Shared-Port → Cloudflare Tunnel
```

removes local certificate/splice endpoints from the active `telego.toml`, while switching back restores the preserved values.

## What The integration intentionally does not do

The integration does not:

- delete administrator certificate/key files;
- clear Native Shared-Port UCI fields;
- manage ACME or `cloudflared` credentials;
- turn `nginx-telego` into a certificate file manager;
- change the P7/P8/P9/P10 ownership model;
- allow both managed `cloudflare` and `shared` profiles to be active at the same time.

A conflict between the two managed ingress profiles remains an error rejected by the Nginx reconciliation contract.

## Verification

CI covers:

1. ordinary/advanced TLS-fronting runtime keeps `cert-*` and `splice-*`;
2. exclusive Cloudflare mode omits the four local endpoint fields from runtime TOML;
3. switching back to Native Shared-Port restores the preserved values;
4. LuCI hides the four endpoint fields in Cloudflare mode and shows them in the other modes;
5. APK builds and OpenWrt 25.12.x smoke tests.

For hardware verification after installing the preview, compare `/var/etc/telego.toml` in Cloudflare and Native Shared-Port modes and confirm that the Cloudflare chain remains `cloudflared → Nginx :18080 → telEgo WEB :8080` with no local WEB TLS listener.
