# TLS certificate for Direct HTTPS with ACME DNS-01

[Русский](TLS_CERTIFICATE.md) · **English** · [Direct HTTPS test](DIRECT_HTTPS_TEST_EN.md)

this integration makes Direct HTTPS and Native Shared-Port ready for OpenWrt ACME certificates without handing public ports 80/443 to the ACME client.

## Target topology

DNS-01 is recommended for Direct HTTPS:

```text
DNS provider API
      ↑
OpenWrt ACME (DNS-01)
      ↓
/etc/ssl/acme/<hostname>.fullchain.crt
/etc/ssl/acme/<hostname>.key
      ↓
Nginx :18443
      ↓
telEgo WEB 127.0.0.1:8080
```

DNS-01 proves domain control through a TXT record, so ACME does not need to bind WAN TCP/80 or TCP/443 and does not change LuCI/uhttpd ownership or the Direct HTTPS firewall redirect.

## Packages

On OpenWrt 25.12.x:

```sh
apk add acme-acmesh acme-acmesh-dnsapi
```

The LuCI ACME application is optional:

```sh
apk add luci-app-acme
```

`acme-acmesh-dnsapi` provides the DNS API hooks supported by acme.sh.

## Example /etc/config/acme

Start with the staging CA:

```uci
config acme
        option account_email 'admin@example.com'
        option debug '0'

config cert 'telego_web'
        option enabled '1'
        option staging '1'
        list domains 'web.example.com'
        option validation_method 'dns'
        option dns 'dns_cf'
        list credentials 'CF_Token="REPLACE_WITH_TOKEN"'
        list credentials 'CF_Account_ID="REPLACE_WITH_ACCOUNT_ID"'
```

Credential names depend on the selected DNS API hook. Do not copy DNS API secrets into `/etc/config/nginx_telego` or `/etc/config/telego`.

After saving:

```sh
/etc/init.d/acme enable
/etc/init.d/acme restart
logread -e acme
```

After staging succeeds, switch the certificate section to production:

```sh
uci set acme.telego_web.staging='0'
uci commit acme
/etc/init.d/acme restart
```

## Stable certificate paths

OpenWrt ACME publishes stable symlink paths below `/etc/ssl/acme/`.

For `web.example.com` use:

```text
/etc/ssl/acme/web.example.com.fullchain.crt
/etc/ssl/acme/web.example.com.key
```

For Direct HTTPS:

```sh
uci set nginx_telego.direct_https.hostname='web.example.com'
uci set nginx_telego.direct_https.certificate='/etc/ssl/acme/web.example.com.fullchain.crt'
uci set nginx_telego.direct_https.certificate_key='/etc/ssl/acme/web.example.com.key'
uci commit nginx_telego
/etc/init.d/nginx-telego reload
```

Symlink paths are deliberately supported: ACME may rotate its generation directory while Nginx keeps using the stable path.

## Certificate Status in LuCI

`Services → telEgo → WEB Ingress` shows read-only status for the active local TLS profile:

- X.509 parsing;
- private-key parsing;
- certificate/public-key match against the private key;
- configured-hostname coverage;
- expiry state: more than 30 days, within 30 days, within 7 days, or expired;
- `notAfter`;
- SHA-256 fingerprint;
- whether stable OpenWrt ACME paths are in use.

The **Certificate Preflight** button repeats the strict checks and then runs:

```sh
nginx -t -c /etc/nginx/uci.conf
```

It does not modify files or reload/restart services.

## Renewal contract

OpenWrt 25.12 invokes ACME hotplug hooks before publishing the `acme.renew` event.

`nginx-telego` installs:

```text
/etc/hotplug.d/acme/90-nginx-telego
```

Renewal flow:

```text
ACME updates certificate/key
        ↓
90-nginx-telego
        ↓
nginx-telego-cert preflight
        ├─ X.509 parse
        ├─ private-key parse
        ├─ cert/key match
        ├─ hostname coverage
        ├─ expiry
        └─ nginx -t -c /etc/nginx/uci.conf
        ↓
OpenWrt acme-common emits acme.renew
        ↓
stock /etc/init.d/nginx reload trigger
        ↓
nginx_init → nginx -t
        ↓
signal running Nginx master
```

The telEgo hook **does not issue a second reload**. This avoids duplicate reloads and keeps ownership of the Nginx lifecycle with OpenWrt.

If the early preflight finds a problem, the hook logs the error. The stock Nginx reload still performs its own `nginx -t`; with an invalid configuration it refuses to signal the running master process.

## Manual verification

```sh
/usr/libexec/nginx-telego-cert status
/usr/libexec/nginx-telego-cert preflight
nginx -t -c /etc/nginx/uci.conf
logread -e nginx-telego-acme
```

For Direct HTTPS also check:

```sh
uci show firewall.telego_direct_https
ss -lntp | grep ':18443'
```

## Ownership boundary

this integration does not:

- store DNS API credentials;
- issue certificates itself;
- modify `/etc/config/acme`;
- make ACME a mandatory `nginx-telego` dependency;
- intercept the stock Nginx `acme.renew` trigger;
- delete administrator certificate/key files;
- use HTTP-01/ALPN-01 or take ports 80/443 from existing services.

ACME remains a separate OpenWrt subsystem. telEgo only consumes stable certificate paths, reports certificate health, and adds a safe preflight before the stock renewal reload.
