# Direct HTTPS hardware verification on OpenWrt

[Русский](DIRECT_HTTPS_TEST.md) · [**English**](DIRECT_HTTPS_TEST_EN.md) · [TLS certificate](TLS_CERTIFICATE_EN.md) · [Cloudflare Tunnel](CLOUDFLARE_EN.md)

This is the P12.6 hardware acceptance runbook. In the dedicated-port topology Nginx owns TCP/443 directly, LuCI/uhttpd uses a separate HTTPS management port, and firewall4 no longer DNATs/REDIRECTs public 443 to a private backend.

```text
LAN WEB client
    │ split DNS: web.example.com → router LAN IPv4
    ▼
Nginx :443 ───────────────► telEgo WEB 127.0.0.1:8080

LAN administrator
    ▼
uhttpd / LuCI :10443

Internet client
    │ WAN TCP/443
    ▼
firewall4 INPUT ACCEPT
    ▼
Nginx :443 ───────────────► telEgo WEB 127.0.0.1:8080
```

The final topology has no Direct HTTPS `:18443` listener, LAN hairpin NAT, or firewall redirect from `443 → 18443`.

> [!IMPORTANT]
> The WAN test must originate from a different network such as mobile data, a VPS, or another external uplink. A successful LAN split-DNS request proves the LAN path, not that a WAN TCP/443 SYN reaches the router.

## 1. Prerequisites

You need:

- OpenWrt 25.12.x x86_64;
- `telego-pkg`, `nginx-telego`, and `luci-app-telego`;
- `telego.general.enabled=1`;
- an MTProxy listener on a port other than TCP/443, for example `0.0.0.0:9443`;
- WEB Proxy on `127.0.0.1:8080`;
- a valid TLS certificate for the WEB hostname;
- Direct HTTPS enabled;
- WAN input policy `REJECT` or `DROP`;
- TCP/443 available for Nginx;
- LuCI/uhttpd on the management port, default `:10443`, when LuCI is installed;
- a router LAN IPv4 in `nginx_telego.direct_https.split_dns_address` if package-managed split DNS is desired.

The public A/AAAA record must point to the OpenWrt WAN endpoint rather than Cloudflare Tunnel/Proxy. If Cloudflare hosts the zone, use **DNS only** for direct ingress.

When an `AAAA` record is published, verify IPv6 separately. Managed Nginx creates both `0.0.0.0:443` and `[::]:443`; the firewall rule uses `family=any`.

## 2. Router-side preflight

On OpenWrt:

```sh
wget -O /tmp/verify-direct-https-router.sh \
  https://raw.githubusercontent.com/Ra1nek/telEgo-openwrt/develop/scripts/verify-direct-https-router.sh
sh /tmp/verify-direct-https-router.sh
```

The helper is read-only. It checks Direct HTTPS ownership, firewall/certificate preflight, `nginx -t`, listeners, generated Nginx configuration, and the configured split-DNS target.

Manual equivalent:

```sh
/usr/libexec/nginx-telego-platform status
/usr/libexec/nginx-telego-platform preflight
/usr/libexec/nginx-telego-firewall status
/usr/libexec/nginx-telego-firewall preflight
/usr/libexec/nginx-telego-cert status
/usr/libexec/nginx-telego-cert preflight
nginx -t -c /etc/nginx/uci.conf

uci show firewall.telego_direct_https
uci -q show uhttpd.main
uci -q show dhcp.@dnsmasq[0] | grep -F 'web.example.com' || true
netstat -lntp 2>/dev/null | grep -E ':443|:10443|:8080'
```

Expected package-owned firewall section:

```text
firewall.telego_direct_https=rule
name='telEgo Direct HTTPS (managed)'
src='wan'
proto='tcp'
dest_port='443'
family='any'
target='ACCEPT'
enabled='1'
```

Package-owned `src_dport=443`, `dest_port=18443`, `target=DNAT`, or `reflection=0` indicates the legacy P12.5 topology.

## 3. LAN WEB must reach Nginx :443 directly

With split DNS enabled, from a LAN client:

```sh
nslookup web.example.com
curl -v https://web.example.com/
```

Expected:

- the hostname resolves to the configured router LAN IPv4 rather than the public WAN IPv4;
- the TCP connection goes to `<router-lan-ip>:443`;
- the certificate validates for the hostname;
- the response comes from Nginx;
- no public-IP hairpin path is used.

If `split_dns_address` is empty, DNS remains administrator-managed. Use `curl --resolve` when you need to prove the direct LAN endpoint explicitly.

## 4. LuCI must use the management port

From a LAN client:

```text
https://<router-lan-ip>:10443/cgi-bin/luci/
```

or use the configured `luci_https_port`.

With curl:

```sh
curl -k -I https://<router-lan-ip>:10443/cgi-bin/luci/
```

Expect LuCI/uhttpd. `<router-lan-ip>:443` belongs to Direct HTTPS Nginx and must not expose LuCI.

## 5. WAN :443 must reach Nginx directly

From Linux/macOS/WSL outside the home network:

```sh
wget -O /tmp/verify-direct-https-client.sh \
  https://raw.githubusercontent.com/Ra1nek/telEgo-openwrt/develop/scripts/verify-direct-https-client.sh
sh /tmp/verify-direct-https-client.sh web.example.com <EXPECTED_WAN_IP>
```

For IPv6:

```sh
IP_FAMILY=6 sh /tmp/verify-direct-https-client.sh web.example.com <EXPECTED_WAN_IPV6>
```

The helper verifies public TLS, HTTP/2, the actual remote IP, and that the LuCI management port is not published on WAN.

Manual test:

```sh
nslookup web.example.com
curl -sS --http2 -o /dev/null \
  -w 'remote=%{remote_ip} http=%{http_code} version=%{http_version}\n' \
  https://web.example.com/
```

The remote address must be the direct WAN A/AAAA rather than Cloudflare anycast, TLS must validate, and `version=2` is required for `https-lanes`. A normal curl request may legitimately end at the minimal ordinary fallback because it is not a Telegram carrier.

ALPN check:

```sh
openssl s_client -connect web.example.com:443 \
  -servername web.example.com -alpn h2 </dev/null 2>/dev/null | \
  grep -E 'ALPN protocol|subject=|issuer='
```

Expect `ALPN protocol: h2` when HTTP/2 is required.

> [!NOTE]
> If TCP/443 SYN packets are filtered before they reach the OpenWrt physical WAN interface, this external test fails regardless of a correct P12.6 configuration. Router listener/firewall correctness and upstream reachability are separate layers.

## 6. WAN management port must remain closed

From the external client:

```sh
curl -k --connect-timeout 5 https://web.example.com:10443/
```

The normal baseline is no TCP connection. P12.6 does not create a WAN allow rule for the LuCI management port.

If that port is reachable from WAN, an administrator-owned firewall exposure exists outside the Direct HTTPS WEB ingress contract.

## 7. Real Telegram WEB clients

Open **Services → telEgo → Status** and note the WEB runtime values.

For Telegram Desktop, generate real traffic for several minutes.

For Telegram Android, use the same canonical hostname and the same 16-byte/`dd` MTProxy secret. Do not add `https://`, a port, or a path to the Server field. WEB always uses HTTPS/443.

PASS for an active client requires a stable connection, non-zero Active WEB Sessions, stream activity, no endless Carrier Retry growth, no runaway Backpressure Events, and no repeating TLS/upstream errors in telEgo/Nginx logs.

## 8. Reboot persistence

Perform a controlled reboot and then re-run:

```sh
/usr/libexec/nginx-telego-platform status
/usr/libexec/nginx-telego-firewall status
/usr/libexec/nginx-telego-cert status
nginx -t -c /etc/nginx/uci.conf
netstat -lntp 2>/dev/null | grep -E ':443|:10443|:8080'
```

Repeat the LAN WEB, LAN LuCI, and external WAN checks. This proves persistence across UCI, uhttpd, dnsmasq, Nginx, and firewall4.

## 9. Roll back to Cloudflare

When leaving Direct HTTPS, ordering is:

```text
remove WAN TCP/443 allow
        ↓
release Nginx :443
        ↓
restore only package-owned LuCI/split-DNS state
        ↓
activate the next ingress profile
```

Configure the next profile:

```sh
uci set nginx_telego.direct_https.enabled='0'
uci set nginx_telego.shared.enabled='0'
uci set nginx_telego.cloudflare.enabled='1'
uci set nginx_telego.cloudflare.hostname='web.example.com'
uci commit nginx_telego
/etc/init.d/nginx-telego reload
```

Verify:

```sh
/usr/libexec/nginx-telego-platform status
/usr/libexec/nginx-telego-firewall status
uci -q show firewall.telego_direct_https || true
netstat -lntp 2>/dev/null | grep -E ':443|:10443|:18080|:8080'
nginx -t -c /etc/nginx/uci.conf
```

Expected:

- package-owned `firewall.telego_direct_https` is absent;
- Direct HTTPS Nginx `:443` is absent;
- Cloudflare ingress listens on `127.0.0.1:18080`;
- telEgo WEB remains on `127.0.0.1:8080`;
- if P12.6 originally moved uhttpd away from 443, only that package-owned original listener is restored;
- pre-existing LuCI `:10443` or split-DNS state remains administrator-owned and is not removed automatically.

## 10. PASS criteria

| Check | PASS |
|---|---|
| Platform preflight | LuCI port/split DNS reconcile safely; no pending UCI drift |
| Firewall preflight | WAN zone is safe and no foreign TCP/443 owner exists |
| LAN WEB | WEB hostname reaches Nginx :443 directly |
| LAN LuCI | LuCI is reachable on the configured management port |
| WAN TCP/443 | reaches Nginx :443 through the managed INPUT allow |
| WAN management port | not published by the package |
| Legacy :18443 | listener/redirect absent |
| TLS | certificate/key/hostname match |
| HTTP/2 | public endpoint negotiates HTTP/2 |
| Telegram | a real WEB session works |
| Reboot | topology persists |
| Rollback | WAN allow and Nginx :443 are removed; only package-owned platform state is restored |

The hardware milestone is complete only after all applicable checks actually pass on the router and an external client.
