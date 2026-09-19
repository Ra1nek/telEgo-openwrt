# Direct HTTPS hardware verification on OpenWrt

[Русский](DIRECT_HTTPS_TEST.md) · [**English**](DIRECT_HTTPS_TEST_EN.md) · [TLS certificate](TLS_CERTIFICATE_EN.md) · [Cloudflare Tunnel](CLOUDFLARE_EN.md)

This is the P12.6/P12.7 Direct HTTPS hardware acceptance runbook. Nginx owns TCP/443 directly, LuCI/uhttpd uses a separate HTTPS management port, firewall4 does not DNAT/REDIRECT, and P12.7 additionally verifies the TLS baseline, staged HSTS, version disclosure, and fallback-only headers. LuCI plain HTTP `:80` deliberately remains administrator-managed.

```text
LAN WEB client
    │ split DNS: web.example.com → router LAN IPv4
    ▼
Nginx :443 ───────────────► telEgo WEB 127.0.0.1:8080

LAN administrator
    ▼
uhttpd / LuCI :10443
uhttpd / LuCI :80 (optional, administrator-managed)

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
- LuCI plain HTTP `:80` may remain enabled: P12.7 does not manage `listen_http` or disable it;
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

The helper is read-only. It checks Direct HTTPS ownership, firewall/certificate preflight, `nginx -t`, listeners, generated Nginx configuration, TLS 1.0/1.1 rejection, TLS 1.2/1.3 acceptance, unknown-SNI rejection, staged HSTS, `server_tokens off`, the unchanged `200 OK` fallback, and fallback-only headers.

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
netstat -lntp 2>/dev/null | grep -E ':443|:10443|:8080|:80'
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

Expect LuCI/uhttpd. `<router-lan-ip>:443` belongs to Direct HTTPS Nginx and must not expose LuCI. If the administrator retained plain HTTP LuCI, `http://<router-lan-ip>/` on `:80` must also keep working; the package does not change that listener.

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

The helper verifies public TLS, HTTP/2, the actual remote IP, HSTS with the expected `max-age` (default `604800`), absence of an Nginx version in the `Server` header, and that the LuCI HTTPS management port is not published on WAN. After promotion to one-year HSTS, run it with `HSTS_MAX_AGE=31536000`.

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

## 8. ACME renewal/reload acceptance

When OpenWrt ACME manages the certificate, separately exercise the preflight hook and the stock Nginx reload without forcing issuance of a new certificate:

```sh
/usr/libexec/nginx-telego-cert preflight
ACTION=renewed sh /etc/hotplug.d/acme/90-nginx-telego
logread -e nginx-telego-acme
/etc/init.d/nginx reload
/usr/libexec/nginx-telego-cert status
nginx -t -c /etc/nginx/uci.conf
```

PASS means the hook runs certificate/config preflight, `nginx reload` passes `nginx -t`, Direct HTTPS remains on `:443`, and certificate/key/hostname still match. After the next real ACME renewal, repeat certificate status, the external TLS curl, and the HSTS check; the renewed certificate must be served without manually changing the configured paths.

If the certificate is administrator-managed and OpenWrt ACME is not used, this check is not applicable.

## 9. Reboot persistence

Perform a controlled reboot and then re-run:

```sh
/usr/libexec/nginx-telego-platform status
/usr/libexec/nginx-telego-firewall status
/usr/libexec/nginx-telego-cert status
nginx -t -c /etc/nginx/uci.conf
netstat -lntp 2>/dev/null | grep -E ':443|:10443|:8080|:80'
```

Repeat the LAN WEB, LAN LuCI, and external WAN checks. This proves persistence across UCI, uhttpd, dnsmasq, Nginx, and firewall4.

## 10. Roll back to Cloudflare

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
- if P12.6 originally moved uhttpd HTTPS away from 443, only that package-owned original listener is restored;
- LuCI `listen_http`/`:80` is unchanged during both apply and rollback;
- pre-existing LuCI `:10443` or split-DNS state remains administrator-owned and is not removed automatically.

## 11. PASS criteria

| Check | PASS |
|---|---|
| Platform preflight | LuCI port/split DNS reconcile safely; no pending UCI drift |
| Firewall preflight | WAN zone is safe and no foreign TCP/443 owner exists |
| LAN WEB | WEB hostname reaches Nginx :443 directly |
| LAN LuCI | LuCI is reachable on the configured management port |
| WAN TCP/443 | reaches Nginx :443 through the managed INPUT allow |
| WAN management port | not published by the package |
| Legacy :18443 | listener/redirect absent |
| TLS | TLS 1.0/1.1 rejected; TLS 1.2/1.3 accepted; unknown SNI rejected; certificate/key/hostname match |
| HSTS | `max-age` matches UCI; no `includeSubDomains`/`preload` |
| Nginx disclosure | `Server` contains no Nginx version |
| Fallback | remains `200 OK`; only `nosniff`, `no-referrer`, `no-store`; no CSP/Permissions-Policy |
| LuCI HTTP :80 | package does not change it; if administrator-enabled, it persists |
| HTTP/2 | public endpoint negotiates HTTP/2 |
| Telegram | a real WEB session works |
| ACME renewal | preflight hook + safe Nginx reload pass; after a real renewal the renewed certificate is served from the same paths |
| Reboot | topology persists |
| Rollback | WAN allow and Nginx :443 are removed; only package-owned platform state is restored |

The hardware milestone is complete only after all applicable checks actually pass on the router and an external client.
