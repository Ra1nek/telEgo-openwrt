# Проверка Direct HTTPS на реальном OpenWrt

[**Русский**](DIRECT_HTTPS_TEST.md) · [English](DIRECT_HTTPS_TEST_EN.md) · [TLS-сертификат](TLS_CERTIFICATE.md) · [Cloudflare Tunnel](CLOUDFLARE.md)

Эта инструкция — аппаратная приёмка P12.6/P12.7 Direct HTTPS. Nginx напрямую владеет TCP/443, LuCI/uhttpd использует отдельный HTTPS-порт управления, firewall4 не делает DNAT/REDIRECT, а P12.7 дополнительно проверяет TLS baseline, staged HSTS, version disclosure и fallback-only headers. LuCI plain HTTP `:80` намеренно остаётся administrator-managed.

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

В итоговой схеме нет Direct HTTPS listener `:18443`, LAN hairpin NAT и firewall redirect `443 → 18443`.

> [!IMPORTANT]
> WAN-проверка должна идти из другой сети: мобильный Интернет, VPS или другой внешний uplink. Успешный LAN-доступ к split-DNS адресу доказывает LAN path, но не доказывает, что SYN на WAN TCP/443 реально приходит к роутеру.

## 1. Условия перед тестом

Нужны:

- OpenWrt 25.12.x x86_64;
- `telego-pkg`, `nginx-telego`, `luci-app-telego`;
- `telego.general.enabled=1`;
- MTProxy listener на порту, отличном от TCP/443, например `0.0.0.0:9443`;
- WEB Proxy `127.0.0.1:8080`;
- валидный TLS-сертификат для WEB hostname;
- Direct HTTPS profile;
- WAN zone с input `REJECT` или `DROP`;
- свободный TCP/443 для Nginx;
- LuCI/uhttpd на management port, по умолчанию `:10443`, если LuCI установлен;
- LuCI plain HTTP `:80` может оставаться включённым: P12.7 не управляет `listen_http` и не отключает его;
- для managed split DNS — LAN IPv4 роутера в `nginx_telego.direct_https.split_dns_address`.

Публичная A/AAAA-запись Direct HTTPS должна указывать на OpenWrt WAN, а не на Cloudflare Tunnel/Proxy. Если DNS обслуживает Cloudflare, используйте **DNS only** для direct endpoint.

Если опубликован `AAAA`, IPv6 проверяется отдельно. Managed Nginx создаёт `0.0.0.0:443` и `[::]:443`, а firewall rule имеет `family=any`.

## 2. Router-side preflight

На роутере:

```sh
wget -O /tmp/verify-direct-https-router.sh \
  https://raw.githubusercontent.com/Ra1nek/telEgo-openwrt/develop/scripts/verify-direct-https-router.sh
sh /tmp/verify-direct-https-router.sh
```

Скрипт read-only: он проверяет Direct HTTPS ownership, firewall/certificate preflight, `nginx -t`, listeners, generated Nginx config, TLS 1.0/1.1 reject, TLS 1.2/1.3 accept, unknown-SNI reject, staged HSTS, `server_tokens off`, unchanged `200 OK` fallback и fallback-only headers.

Ручной эквивалент:

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

Ожидаемый package-owned firewall section:

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

Не должно быть package-owned `src_dport=443`, `dest_port=18443`, `target=DNAT` или `reflection=0`: это признаки прежней P12.5 topology.

## 3. LAN WEB должен идти прямо в Nginx :443

Если split DNS включён, с LAN-клиента:

```sh
nslookup web.example.com
curl -v https://web.example.com/
```

Ожидается:

- hostname резолвится в настроенный LAN IPv4 роутера, а не в public WAN IPv4;
- соединение открывается на `<router-lan-ip>:443`;
- TLS certificate валиден для hostname;
- HTTP response приходит от Nginx;
- public-IP hairpin для этого hostname не используется.

Для Windows `curl.exe -v` должен показывать строку вида:

```text
Trying 192.168.x.1:443...
Server: nginx/...
```

Если `split_dns_address` оставлен пустым, DNS остаётся в зоне ответственности администратора. В этом случае прямой LAN path можно проверить через `curl --resolve`.

## 4. LuCI должен работать на management port

С LAN-клиента:

```text
https://<router-lan-ip>:10443/cgi-bin/luci/
```

или используйте другой `luci_https_port`, если он настроен.

Через curl:

```sh
curl -k -I https://<router-lan-ip>:10443/cgi-bin/luci/
```

Ожидается LuCI/uhttpd. При этом `<router-lan-ip>:443` принадлежит Direct HTTPS Nginx и не должен открывать LuCI. Если администратор сохранил LuCI plain HTTP, `http://<router-lan-ip>/` на `:80` также должен продолжать работать; пакет не меняет этот listener.

## 5. WAN :443 должен попадать прямо в Nginx

На Linux/macOS/WSL-клиенте **вне домашней сети**:

```sh
wget -O /tmp/verify-direct-https-client.sh \
  https://raw.githubusercontent.com/Ra1nek/telEgo-openwrt/develop/scripts/verify-direct-https-client.sh
sh /tmp/verify-direct-https-client.sh web.example.com <EXPECTED_WAN_IP>
```

Для IPv6:

```sh
IP_FAMILY=6 sh /tmp/verify-direct-https-client.sh web.example.com <EXPECTED_WAN_IPV6>
```

Helper проверяет public TLS, HTTP/2, фактический remote IP, HSTS с ожидаемым `max-age` (по умолчанию `604800`), отсутствие версии в `Server: nginx`, а также то, что LuCI HTTPS management port не опубликован с WAN. После перехода на годовой HSTS запускайте его с `HSTS_MAX_AGE=31536000`.

Ручная проверка:

```sh
nslookup web.example.com
curl -sS --http2 -o /dev/null \
  -w 'remote=%{remote_ip} http=%{http_code} version=%{http_version}\n' \
  https://web.example.com/
```

Критерии:

- `remote` соответствует direct WAN A/AAAA, а не Cloudflare anycast;
- TLS валиден;
- `version=2` для `https-lanes`;
- нет reset/refused/timeout на рабочем WAN path;
- обычный curl может получить minimal fallback — это нормально, потому что curl не является Telegram carrier.

ALPN:

```sh
openssl s_client -connect web.example.com:443 \
  -servername web.example.com -alpn h2 </dev/null 2>/dev/null | \
  grep -E 'ALPN protocol|subject=|issuer='
```

Для HTTP/2 ожидается `ALPN protocol: h2`.

> [!NOTE]
> Если внешний SYN на TCP/443 фильтруется до физического WAN-интерфейса OpenWrt, этот тест будет FAIL независимо от правильности P12.6. Router-side listener/firewall и upstream reachability — разные уровни проверки.

## 6. WAN management port должен быть закрыт

С внешнего клиента:

```sh
curl -k --connect-timeout 5 https://web.example.com:10443/
```

Нормальный baseline: TCP-соединение к WAN `:10443` не устанавливается. P12.6 не создаёт WAN allow-rule для LuCI management port.

Если management port доступен с WAN, это отдельное administrator-owned firewall exposure и его нужно рассматривать отдельно. Не используйте его как часть Direct HTTPS WEB ingress.

## 7. Реальные Telegram WEB-клиенты

Перед тестом откройте **Services → telEgo → Status** и зафиксируйте WEB runtime.

Для Telegram Desktop создайте реальный трафик: откройте диалог, загрузите сообщения/медиа и оставьте соединение активным несколько минут.

Для Telegram Android используйте тот же canonical hostname и тот же 16-byte/`dd` MTProxy secret, не добавляйте `https://`, port или path в поле Server. WEB всегда использует HTTPS/443.

PASS для активного клиента:

- нет циклического reconnect;
- `Active WEB Sessions` становится больше нуля;
- `Active WEB Streams` реагирует на активность;
- `Carrier Retries` не растёт бесконечно без восстановления;
- `Backpressure Events` не показывает постоянный runaway;
- в `logread -e telego` и `logread -e nginx` нет повторяющихся TLS/upstream ошибок.

## 8. Проверка после reboot

После успешной проверки:

```sh
reboot
```

После загрузки:

```sh
/usr/libexec/nginx-telego-platform status
/usr/libexec/nginx-telego-firewall status
/usr/libexec/nginx-telego-cert status
nginx -t -c /etc/nginx/uci.conf
netstat -lntp 2>/dev/null | grep -E ':443|:10443|:8080|:80'
```

Повторите LAN WEB, LAN LuCI и внешний WAN curl. Это проверяет persistence UCI, uhttpd, dnsmasq, Nginx и firewall4, а не только состояние после ручного reload.

## 9. Rollback на Cloudflare

При уходе с Direct HTTPS service ordering должен быть таким:

```text
remove WAN TCP/443 allow
        ↓
release Nginx :443
        ↓
restore only package-owned LuCI/split-DNS state
        ↓
activate the next ingress profile
```

Настройте профиль:

```sh
uci set nginx_telego.direct_https.enabled='0'
uci set nginx_telego.shared.enabled='0'
uci set nginx_telego.cloudflare.enabled='1'
uci set nginx_telego.cloudflare.hostname='web.example.com'
uci commit nginx_telego
/etc/init.d/nginx-telego reload
```

Проверьте:

```sh
/usr/libexec/nginx-telego-platform status
/usr/libexec/nginx-telego-firewall status
uci -q show firewall.telego_direct_https || true
netstat -lntp 2>/dev/null | grep -E ':443|:10443|:18080|:8080'
nginx -t -c /etc/nginx/uci.conf
```

Ожидается:

- package-owned `firewall.telego_direct_https` отсутствует;
- Direct HTTPS Nginx `:443` отсутствует;
- Cloudflare ingress слушает `127.0.0.1:18080`;
- telEgo WEB остаётся на `127.0.0.1:8080`;
- если P12.6 сам переносил uhttpd HTTPS с 443, package-owned original listener восстановлен;
- LuCI `listen_http`/`:80` не изменяется ни при apply, ни при rollback;
- если LuCI `:10443` и split DNS существовали до P12.6, они считаются administrator-owned и не удаляются автоматически.

## 10. Критерии PASS

| Проверка | PASS |
|---|---|
| Platform preflight | LuCI port/split DNS безопасно согласуются, нет pending UCI drift |
| Firewall preflight | WAN zone безопасна, чужой TCP/443 owner отсутствует |
| LAN WEB | WEB hostname идёт напрямую в Nginx :443 |
| LAN LuCI | LuCI доступен на configured management port |
| WAN TCP/443 | достигает Nginx :443 напрямую через managed INPUT allow |
| WAN management port | не опубликован пакетом |
| Legacy :18443 | listener/redirect отсутствуют |
| TLS | TLS 1.0/1.1 rejected; TLS 1.2/1.3 accepted; unknown SNI rejected; certificate/key/hostname совпадают |
| HSTS | `max-age` совпадает с UCI; нет `includeSubDomains`/`preload` |
| Nginx disclosure | `Server` не содержит версию Nginx |
| Fallback | остаётся `200 OK`; только `nosniff`, `no-referrer`, `no-store`; нет CSP/Permissions-Policy |
| LuCI HTTP :80 | не изменяется пакетом; если был включён администратором, сохраняется |
| HTTP/2 | public endpoint согласует HTTP/2 |
| Telegram | реальная WEB session работает |
| Reboot | topology сохраняется |
| Rollback | WAN allow и Nginx :443 сняты; восстанавливается только package-owned platform state |

Аппаратная проверка считается закрытой только после фактического PASS применимых пунктов на роутере и внешнем клиенте.
