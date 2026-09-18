# Direct HTTPS hardware verification on OpenWrt

[Русский](DIRECT_HTTPS_TEST.md) · [**English**](DIRECT_HTTPS_TEST_EN.md) · [TLS certificate](TLS_CERTIFICATE_EN.md) · [Cloudflare Tunnel](CLOUDFLARE_EN.md)

This is the final hardware acceptance test for Direct HTTPS. It verifies the real port split:

```text
LAN client ── HTTPS :443 ──> uhttpd / LuCI

Internet client ── HTTPS :443 ──> firewall4 DNAT
                                   ↓
                             Nginx :18443
                                   ↓
                           telEgo WEB :8080
```

> [!IMPORTANT]
> The WAN test must originate from a **different network** such as mobile data, a VPS, or another external uplink. LAN hairpin/NAT-loopback traffic does not prove the real WAN path.

## 1. Prerequisites

You need OpenWrt 25.12.x x86_64, the telEgo/Nginx/LuCI packages, `telego.general.enabled=1`, an MTProxy listener on a port **other than TCP/443** (for example `0.0.0.0:9443`), a working WEB listener on `127.0.0.1:8080`, a valid certificate, Direct HTTPS enabled, and a WAN zone whose input policy is `REJECT` or `DROP`.

The Direct HTTPS hostname must resolve to the OpenWrt WAN address, not a Cloudflare Tunnel or proxied Cloudflare record. If Cloudflare hosts the DNS zone, use **DNS only** while testing Direct HTTPS.

If an `AAAA` record is published, test IPv6 separately. Managed Nginx creates both `0.0.0.0:18443` and `[::]:18443` while the redirect uses `family=any`; a successful IPv4 test alone still does not prove the real IPv6 WAN path.

## 2. Router-side preflight

On OpenWrt:

```sh
wget -O /tmp/verify-direct-https-router.sh \
  https://raw.githubusercontent.com/Ra1nek/telEgo-openwrt/develop/scripts/verify-direct-https-router.sh
sh /tmp/verify-direct-https-router.sh
```

The script is read-only. It checks profile ownership, firewall/certificate preflight, `nginx -t`, listeners, and generated configuration.

Manual equivalent:

```sh
/usr/libexec/nginx-telego-firewall status
/usr/libexec/nginx-telego-firewall preflight
/usr/libexec/nginx-telego-cert status
/usr/libexec/nginx-telego-cert preflight
nginx -t -c /etc/nginx/uci.conf
uci show firewall.telego_direct_https
netstat -lntp 2>/dev/null | grep -E ':443|:8080|:18443'
```

Expected managed redirect: source zone `wan`, TCP source port `443`, destination port `18443`, `family=any`, `target=DNAT`, `reflection=0`. Firewall status must also report no `foreign_wan443` and no `foreign_wan18443` entry; the latter protects the private backend from a separate WAN ACCEPT/redirect rule.

## 3. LAN :443 must remain uhttpd/LuCI

From a LAN client:

```sh
curl -k -I https://<router-lan-ip>/cgi-bin/luci/
```

Expect LuCI/uhttpd, commonly `Server: uhttpd` or its normal login/redirect response. Direct HTTPS must not take over LAN TCP/443.

## 4. WAN :443 must reach Nginx :18443

From a Linux/macOS/WSL client **outside the home network**, you can run the read-only helper:

```sh
wget -O /tmp/verify-direct-https-client.sh \
  https://raw.githubusercontent.com/Ra1nek/telEgo-openwrt/develop/scripts/verify-direct-https-client.sh
sh /tmp/verify-direct-https-client.sh web.example.com <EXPECTED_WAN_IP>
```

For a separate IPv6 check:

```sh
IP_FAMILY=6 sh /tmp/verify-direct-https-client.sh web.example.com <EXPECTED_WAN_IPV6>
```

The helper verifies public TLS validation, HTTP/2, the actual remote IP, and WAN TCP/18443 reachability. It cannot replace Telegram Desktop, LAN LuCI, or reboot checks.

Manual check from a client outside the home network:

```sh
nslookup web.example.com
curl -sS --http2 -o /dev/null \
  -w 'remote=%{remote_ip} http=%{http_code} version=%{http_version}\n' \
  https://web.example.com/
```

The remote address must be the direct WAN A/AAAA rather than Cloudflare anycast, TLS must validate, and `version=2` is required for `https-lanes`. A normal curl request may legitimately end at the ordinary fallback site because it is not a Telegram carrier.

Optional ALPN check:

```sh
openssl s_client -connect web.example.com:443 \
  -servername web.example.com -alpn h2 </dev/null 2>/dev/null | \
  grep -E 'ALPN protocol|subject=|issuer='
```

Expect `ALPN protocol: h2`.

## 5. WAN :18443 must not be directly exposed

From the external client:

```sh
curl -k --connect-timeout 5 https://web.example.com:18443/
```

A secure baseline is that direct WAN TCP/18443 is unreachable. Only WAN TCP/443 should be published through the package-owned redirect.

## 6. Real Telegram WEB clients: Desktop and Android

Open **Services → telEgo → Status** and note the WEB runtime values.

### Telegram Desktop

Connect Desktop through the configured WEB Proxy and generate real traffic for several minutes.

### Telegram Android WEB Proxy

Android uses the same server-side WEB protocol but a different client boundary: a private Android System WebView with the origin-scoped `TelegramWebProxy` object. The current Android proof of concept requires the WebView features `WEB_MESSAGE_LISTENER`, `WEB_MESSAGE_ARRAY_BUFFER`, and `DOCUMENT_START_SCRIPT`; if any feature is missing, the client fails closed instead of falling back to a direct Telegram path.

Before testing:

- update Android System WebView/the active provider;
- keep Telegram in the foreground;
- use the same canonical hostname and the same 16-byte/`dd` MTProxy secret;
- do not add `https://`, a port, or a path to the Server field;
- WEB always uses HTTPS/443.

Watch Active WEB Sessions/Streams while enabling it. If Desktop works but Android remains unavailable, follow [Troubleshooting](TROUBLESHOOTING_EN.md#android-web-proxy-is-unavailable-while-desktop-works).

PASS for each active client requires a stable connection, non-zero Active WEB Sessions, stream activity, no endless Carrier Retry growth, no runaway Backpressure Events, and no repeating TLS/upstream errors in telEgo/Nginx logs.

For `https-lanes`, the public HTTP/2 test above is mandatory.

## 7. Reboot persistence

Perform a controlled reboot, then re-run firewall status, certificate status, `nginx -t`, listener checks, and a short LAN/WAN curl test. This verifies UCI/procd/firewall4 persistence rather than only the post-reload state.

## 8. Roll back to Cloudflare

```sh
uci set nginx_telego.direct_https.enabled='0'
uci set nginx_telego.shared.enabled='0'
uci set nginx_telego.cloudflare.enabled='1'
uci set nginx_telego.cloudflare.hostname='web.example.com'
uci commit nginx_telego
/etc/init.d/nginx-telego reload
```

Verify that `firewall.telego_direct_https` and the `:18443` listener are gone, `127.0.0.1:18080` is present, WEB remains on `127.0.0.1:8080`, LAN :443 still reaches LuCI/uhttpd, and the Cloudflare Published Application targets `http://127.0.0.1:18080`.

If DNS was changed from a Tunnel route to direct A/AAAA for the Direct HTTPS test, restore the Cloudflare route before the external test.

See [Cloudflare Tunnel](CLOUDFLARE_EN.md) for the complete rollback target.

## 9. PASS criteria

| Check | PASS |
|---|---|
| Router preflight | telEgo enabled, MTProxy not on :443, firewall + certificate + `nginx -t` succeed |
| LAN TCP/443 | LuCI/uhttpd |
| WAN TCP/443 | Direct HTTPS through the managed redirect |
| WAN TCP/18443 | not directly exposed |
| TLS | certificate/key/hostname match |
| HTTP/2 | public endpoint negotiates HTTP/2 |
| Telegram Desktop | real WEB session works |
| Telegram Android | WEB session works in foreground with a current Android System WebView |
| Reboot | topology persists |
| Rollback | redirect/:18443 removed and Cloudflare :18080 restored |

The hardware milestone is complete only after these checks actually pass on the router and an external client.
