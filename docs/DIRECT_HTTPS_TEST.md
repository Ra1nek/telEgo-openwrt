# Проверка Direct HTTPS на реальном OpenWrt

[**Русский**](DIRECT_HTTPS_TEST.md) · [English](DIRECT_HTTPS_TEST_EN.md) · [TLS-сертификат](TLS_CERTIFICATE.md) · [Cloudflare Tunnel](CLOUDFLARE.md)

Эта инструкция — финальная аппаратная проверка Direct HTTPS. Она доказывает не только корректность конфигурации, но и разделение портов на реальном роутере:

```text
LAN client ── HTTPS :443 ──> uhttpd / LuCI

Internet client ── HTTPS :443 ──> firewall4 DNAT
                                   ↓
                             Nginx :18443
                                   ↓
                           telEgo WEB :8080
```

> [!IMPORTANT]
> Проверка WAN должна выполняться **из другой сети**: мобильный Интернет, VPS или другой внешний канал. Проверка с LAN через NAT loopback/hairpin не доказывает реальный WAN path.

## 1. Условия перед тестом

Нужны:

- OpenWrt 25.12.x x86_64;
- `telego-pkg`, `nginx-telego`, `luci-app-telego`;
- `telego.general.enabled=1`;
- MTProxy listener на отдельном порту, **не TCP/443** (например `0.0.0.0:9443`);
- работающий WEB Proxy `127.0.0.1:8080`;
- настоящий TLS-сертификат для WEB hostname;
- Direct HTTPS profile;
- WAN zone с input `REJECT` или `DROP`, но не `ACCEPT`;
- внешний hostname, который при Direct HTTPS указывает **на WAN OpenWrt**, а не на Cloudflare Tunnel/Proxy.

Если DNS обслуживает Cloudflare, запись Direct HTTPS должна быть **DNS only**. Оранжевое proxy-cloud означает, что внешний тест проверяет Cloudflare Edge, а не Direct HTTPS OpenWrt.

Если опубликован `AAAA`, IPv6 проверяется отдельно. Managed Nginx создаёт `0.0.0.0:18443` и `[::]:18443`, а firewall redirect использует `family=any`; не считайте deployment dual-stack проверенным только по успешному IPv4.

## 2. Router-side preflight

На роутере:

```sh
wget -O /tmp/verify-direct-https-router.sh \
  https://raw.githubusercontent.com/Ra1nek/telEgo-openwrt/develop/scripts/verify-direct-https-router.sh
sh /tmp/verify-direct-https-router.sh
```

Скрипт read-only: он не изменяет UCI, firewall или Nginx. Он проверяет profile ownership, firewall/certificate preflight, `nginx -t`, listeners и generated config.

Ручной эквивалент:

```sh
/usr/libexec/nginx-telego-firewall status
/usr/libexec/nginx-telego-firewall preflight
/usr/libexec/nginx-telego-cert status
/usr/libexec/nginx-telego-cert preflight
nginx -t -c /etc/nginx/uci.conf

uci show firewall.telego_direct_https
netstat -lntp 2>/dev/null | grep -E ':443|:8080|:18443'
```

В выводе firewall status поля `foreign_wan443` и `foreign_wan18443` должны быть пустыми/`-`. Второе поле означает, что никакое чужое UCI firewall rule/redirect не публикует приватный backend напрямую.

Ожидаемый firewall section:

```text
src='wan'
proto='tcp'
src_dport='443'
dest_port='18443'
family='any'
target='DNAT'
reflection='0'
enabled='1'
```

## 3. LAN :443 должен остаться за uhttpd/LuCI

С компьютера **в LAN** откройте:

```text
https://<LAN-IP-роутера>/cgi-bin/luci/
```

Через curl:

```sh
curl -k -I https://<LAN-IP-роутера>/cgi-bin/luci/
```

Ожидается ответ LuCI/uhttpd (обычно `Server: uhttpd`, либо ожидаемый redirect/login response). Direct HTTPS hostname здесь не должен перехватывать LAN :443.

Если LAN :443 внезапно ведёт в WEB hostname/Nginx, тест провален: не продолжайте WAN-проверку, сначала исправьте ownership/firewall.

## 4. WAN :443 должен попадать в Nginx :18443

На Linux/macOS/WSL-клиенте **вне домашней сети** можно запустить read-only helper:

```sh
wget -O /tmp/verify-direct-https-client.sh \
  https://raw.githubusercontent.com/Ra1nek/telEgo-openwrt/develop/scripts/verify-direct-https-client.sh
sh /tmp/verify-direct-https-client.sh web.example.com <EXPECTED_WAN_IP>
```

Для отдельной IPv6-проверки:

```sh
IP_FAMILY=6 sh /tmp/verify-direct-https-client.sh web.example.com <EXPECTED_WAN_IPV6>
```

Helper проверяет валидный public TLS, HTTP/2, фактический remote IP и TCP-доступность WAN :18443. Он не может заменить проверку Telegram Desktop, LAN LuCI или reboot.

Ручная проверка на клиенте **вне домашней сети**:

```sh
nslookup web.example.com
curl -sS --http2 -o /dev/null \
  -w 'remote=%{remote_ip} http=%{http_code} version=%{http_version}\n' \
  https://web.example.com/
```

Критерии:

- `remote` соответствует вашему direct WAN A/AAAA, а не Cloudflare anycast;
- TLS certificate валиден для hostname;
- `version=2` для `https-lanes`;
- нет connection reset/refused/timeout;
- обычный запрос может вернуть fallback-сайт — это нормально, потому что curl не является Telegram carrier.

Если доступен OpenSSL:

```sh
openssl s_client -connect web.example.com:443 \
  -servername web.example.com -alpn h2 </dev/null 2>/dev/null | \
  grep -E 'ALPN protocol|subject=|issuer='
```

Для HTTP/2 ожидается `ALPN protocol: h2`.

## 5. Проверка, что :18443 не стал отдельным публичным сервисом

С внешнего клиента:

```sh
curl -k --connect-timeout 5 https://web.example.com:18443/
```

Нормальный secure baseline — прямой WAN TCP/18443 **не доступен**. Публичным входом должен быть только WAN TCP/443 через package-owned firewall redirect.

Если 18443 доступен напрямую, проверьте чужие firewall rules и WAN input policy.

## 6. Реальный Telegram Desktop WEB

До теста откройте LuCI:

```text
Services → telEgo → Status
```

Зафиксируйте исходные значения WEB runtime. Затем подключите Telegram Desktop через настроенный WEB Proxy и выполните реальный трафик: открыть диалог, загрузить сообщения/медиа, оставить соединение активным несколько минут.

Проверка считается успешной, если:

- Telegram Desktop подключается без циклических reconnect;
- `Active WEB Sessions` становится больше нуля во время работы;
- `Active WEB Streams` реагирует на активность;
- `Carrier Retries` не растёт непрерывно без восстановления;
- `Backpressure Events` не показывает постоянный runaway;
- в `logread -e telego` и `logread -e nginx` нет повторяющихся ошибок TLS/upstream.

Для `https-lanes` внешний HTTP/2 test из предыдущего раздела обязателен.

## 7. Проверка после reboot

После успешного теста сделайте контролируемую перезагрузку роутера:

```sh
reboot
```

После восстановления повторите:

```sh
/usr/libexec/nginx-telego-firewall status
/usr/libexec/nginx-telego-cert status
nginx -t -c /etc/nginx/uci.conf
netstat -lntp 2>/dev/null | grep -E ':443|:8080|:18443'
```

И повторите короткий LAN/WAN curl. Это проверяет persistence UCI/procd/firewall4, а не только состояние после ручного reload.

## 8. Rollback на Cloudflare

Rollback должен убирать package-owned WAN/443 redirect **до** удаления Direct HTTPS backend listener. Это делает `/etc/init.d/nginx-telego reload`.

Настройте profile:

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
/usr/libexec/nginx-telego-firewall status
uci -q show firewall.telego_direct_https || true
netstat -lntp 2>/dev/null | grep -E ':18080|:18443|:8080'
nginx -t -c /etc/nginx/uci.conf
```

Ожидается:

- `firewall.telego_direct_https` отсутствует;
- Direct HTTPS listener `:18443` отсутствует;
- Nginx Cloudflare ingress слушает `127.0.0.1:18080`;
- telEgo WEB остаётся на `127.0.0.1:8080`;
- LAN :443 по-прежнему LuCI/uhttpd;
- Cloudflare Tunnel Published Application использует `http://127.0.0.1:18080`.

Если для Direct HTTPS вы меняли DNS с Tunnel route на direct A/AAAA, верните Cloudflare Published Application/DNS route. После этого внешний `curl --http2 https://web.example.com/` должен показывать Cloudflare endpoint, а Telegram Desktop WEB снова работать через Tunnel.

Полная Cloudflare-инструкция: [Cloudflare Tunnel](CLOUDFLARE.md).

## 9. Критерии PASS

| Проверка | PASS |
|---|---|
| Router preflight | telEgo включён, MTProxy не на :443, firewall + certificate + `nginx -t` успешны |
| LAN TCP/443 | LuCI/uhttpd, не Direct HTTPS |
| WAN TCP/443 | достигает Direct HTTPS Nginx через redirect |
| WAN TCP/18443 | не опубликован напрямую |
| TLS | certificate/key/hostname совпадают |
| HTTP/2 | public endpoint сообщает HTTP/2 |
| Telegram Desktop | WEB session реально работает |
| Reboot | topology сохраняется |
| Rollback | redirect/18443 удалены, Cloudflare :18080 восстановлен |

Аппаратная проверка считается закрытой только после фактического PASS этих проверок на роутере и внешнем клиенте.
