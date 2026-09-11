# Cloudflare Tunnel на OpenWrt

[**Русский**](CLOUDFLARE.md) · [English](CLOUDFLARE_EN.md)

Этот документ описывает установку и эксплуатацию `cloudflared` на OpenWrt 25.12.x для WEB Proxy `telEgo-openwrt`.

> [!NOTE]
> Инструкция сверена с Cloudflare и официальными feeds OpenWrt на **11 сентября 2026 года**. Для нового deployment используется **remotely-managed Tunnel** — это рекомендуемый Cloudflare режим для большинства production-сценариев.

Перед началом подготовьте домен по **[DOMAIN.md](DOMAIN.md)**.

## 1. Архитектура

Текущий Cloudflare WEB path проекта:

```text
Internet client
      |
      | HTTPS :443
      v
Cloudflare Edge
      |
      | Cloudflare Tunnel
      v
cloudflared (OpenWrt)
      |
      | HTTP loopback
      v
127.0.0.1:18080  Nginx adapter
      |
      v
127.0.0.1:8080   telEgo WEB listener
      |
      v
telEgo core
      |
      v
127.0.0.1:15301  Forkop/sing-box SOCKS5
```

Fallback site проекта остаётся отдельным локальным backend на `127.0.0.1:8090` и обрабатывается Nginx adapter согласно WEB fallback contract.

Ключевые свойства:

- Cloudflare Tunnel используется **только для WEB Proxy**;
- native MTProxy не переносится в Tunnel;
- внешний HTTPS/443 обслуживает Cloudflare Edge;
- входящий WAN TCP/443 на OpenWrt для WEB Proxy не требуется;
- Tunnel устанавливается исходящими соединениями с OpenWrt;
- локальный origin для Cloudflare — `http://127.0.0.1:18080`;
- сертификат публичного hostname не хранится на OpenWrt;
- Tunnel credentials принадлежат `cloudflared`, а не `telego`.

## 2. Почему remotely-managed Tunnel

Cloudflare рекомендует remotely-managed tunnels для большинства сценариев. Их ingress/routes хранятся и управляются в Cloudflare Dashboard/API, а connector на OpenWrt для запуска получает Tunnel token.

Это лучше соответствует проекту, чем locally-managed `cert.pem` + YAML:

- меньше локального state;
- не нужен account origin certificate на router;
- published application настраивается централизованно;
- проще rotation token;
- OpenWrt использует штатный UCI/procd package.

> [!IMPORTANT]
> Не создавайте для обычной установки локальный Tunnel через `cloudflared tunnel login` / `cloudflared tunnel create` и не копируйте `cert.pem`, если нет отдельной причины использовать legacy/local-management workflow.

## 3. Состояние OpenWrt 25.12.x

На OpenWrt 25.12.x `cloudflared` и LuCI frontend доступны в официальных feeds.

На момент проверки для OpenWrt 25.12.5 / x86_64:

```text
cloudflared                  2026.7.3-r1
luci-app-cloudflared         1.2-r1
luci-i18n-cloudflared-ru     доступен в официальном LuCI feed
```

Поэтому не нужно скачивать вручную бинарник `cloudflared` из GitHub Releases и создавать собственный init-script.

## 4. Создание Tunnel в Cloudflare

В актуальном Cloudflare Dashboard:

1. Откройте **Networking -> Tunnels**.
2. Нажмите **Create a tunnel**.
3. Задайте понятное имя Tunnel.
4. Создайте Tunnel.
5. Откройте созданный Tunnel.
6. На Overview используйте **Add a replica** / installation command, чтобы получить Tunnel token.

Tunnel token имеет вид длинной строки, обычно начинающейся с `eyJ...`.

> [!CAUTION]
> Tunnel token — секрет. Любой, кто получил этот token, может запустить connector для вашего Tunnel. Никогда не добавляйте реальный token в GitHub, документацию, issue или screenshots.

На этом этапе Cloudflare может показывать Tunnel как `Inactive`, пока `cloudflared` на OpenWrt ещё не подключился. Это нормально.

## 5. Установка пакетов на OpenWrt

Подключитесь по SSH к OpenWrt и обновите package indexes:

```sh
apk update
```

Установите штатные пакеты:

```sh
apk add cloudflared luci-app-cloudflared luci-i18n-cloudflared-ru
```

Если русская локализация LuCI не нужна:

```sh
apk add cloudflared luci-app-cloudflared
```

Проверьте установленную версию:

```sh
cloudflared --version
apk info cloudflared
```

## 6. Настройка через LuCI

После установки откройте:

**VPN -> Cloudflare Zero Trust Tunnel -> Configuration**

Для remotely-managed Tunnel:

1. Включите **Enable**.
2. Вставьте Tunnel token в поле **Token**.
3. Оставьте **Config file path** и **Certificate of Origin** неиспользуемыми для token-based Tunnel.
4. Logging level оставьте `info` для обычной эксплуатации.
5. Сохраните и примените изменения.

Дополнительные страницы LuCI:

- **Tunnels** — информация о tunnels;
- **Log** — журнал `cloudflared`.

## 7. Эквивалентная настройка через UCI

Для автоматизации или SSH можно настроить тот же штатный package напрямую:

```sh
uci set cloudflared.config.enabled='1'
uci set cloudflared.config.token='<TUNNEL_TOKEN>'
uci set cloudflared.config.protocol='auto'
uci set cloudflared.config.loglevel='info'
uci commit cloudflared

/etc/init.d/cloudflared enable
/etc/init.d/cloudflared restart
```

`<TUNNEL_TOKEN>` замените реальным token и не сохраняйте команду с token в публичных shell transcripts.

Штатная конфигурация OpenWrt находится здесь:

```text
/etc/config/cloudflared
```

Штатный init-script:

```text
/etc/init.d/cloudflared
```

Для remotely-managed режима OpenWrt запускает примерно такую модель:

```text
cloudflared tunnel --no-autoupdate ... run --token <TOKEN>
```

Package использует `procd`, `respawn` и по умолчанию следит за интерфейсом `wan`; при событии `interface.*.up` выполняется restart `cloudflared`.

> [!IMPORTANT]
> `enabled=1` в UCI разрешает запуск instance, а `/etc/init.d/cloudflared enable` добавляет сервис в boot lifecycle OpenWrt. Для постоянной работы нужны оба состояния.

## 8. Protocol и firewall

Оставляйте:

```text
protocol = auto
```

если нет подтверждённой причины принудительно выбирать `quic` или `http2`.

Cloudflare Tunnel устанавливает соединения **из OpenWrt наружу**. Для работы Tunnel Cloudflare требует outbound port `7844`:

- UDP/7844 — QUIC;
- TCP/7844 — HTTP/2.

На обычной конфигурации OpenWrt исходящий WAN traffic уже разрешён, поэтому отдельное firewall rule обычно не требуется.

Если вы используете строгий egress firewall, разрешите необходимые Cloudflare Tunnel destinations на TCP/UDP 7844 согласно официальной документации Cloudflare.

Для WEB Proxy не открывайте входящий WAN 7844 и не делайте port-forward 7844 на router.

## 9. Проверка локального origin до Cloudflare

Сначала убедитесь, что локальная цепочка работает без Tunnel.

Проверьте listeners:

```sh
netstat -lntp 2>/dev/null | grep -E ':18080|:8080|:8090'
```

Проверьте Nginx:

```sh
nginx -t
```

Проверьте локальный HTTP origin:

```sh
wget -S -O- http://127.0.0.1:18080/ 2>&1 | head -n 40
```

Если установлен `curl`:

```sh
curl -v --max-time 10 http://127.0.0.1:18080/
```

Tunnel не исправляет ошибку локального origin. Если `127.0.0.1:18080` не отвечает правильно, сначала исправьте Nginx/telEgo.

## 10. Первый запуск и проверка connector

Проверьте service:

```sh
/etc/init.d/cloudflared status
```

Дополнительно:

```sh
ubus call service list '{"name":"cloudflared"}'
ps w | grep '[c]loudflared'
```

Посмотрите журнал:

```sh
logread -e cloudflared
```

Штатная OpenWrt-конфигурация также задаёт logfile:

```text
/var/log/cloudflared.log
```

Поэтому полезно проверить:

```sh
tail -n 100 /var/log/cloudflared.log
```

> [!CAUTION]
> Не публикуйте полный вывод `uci show cloudflared`: в нём может находиться Tunnel token.

## 11. Проверка Tunnel в Cloudflare

Вернитесь в **Networking -> Tunnels**.

После успешного подключения connector Tunnel должен перейти в **Healthy**.

Cloudflare определяет состояния примерно так:

| Status | Значение |
|---|---|
| `Healthy` | Connector подключён и Tunnel обслуживает traffic |
| `Inactive` | Tunnel создан, но connector ещё ни разу не подключался |
| `Down` | Connector раньше работал, но сейчас отключён |
| `Degraded` | Tunnel работает, но часть его Cloudflare connections потеряна |

`Healthy` подтверждает связь `cloudflared <-> Cloudflare`, но не гарантирует исправность локального origin. Поэтому локальная проверка `127.0.0.1:18080` обязательна отдельно.

## 12. Published application для telEgo WEB

Когда Tunnel стал Healthy:

1. Откройте Tunnel.
2. Перейдите на **Routes**.
3. Нажмите **Add route**.
4. Выберите **Published application**.
5. Укажите hostname, например:

```text
web.example.com
```

6. В **Service URL** укажите строго локальный HTTP adapter:

```text
http://127.0.0.1:18080
```

7. Сохраните route.

Cloudflare создаст/свяжет DNS record для hostname с Tunnel автоматически.

Для нашей архитектуры не указывайте здесь:

```text
https://127.0.0.1:18080
https://web.example.com
http://<WAN-IP>:18080
```

Нужен именно:

```text
http://127.0.0.1:18080
```

## 13. End-to-end проверка

С внешней сети откройте:

```text
https://web.example.com
```

Или проверьте HTTP headers:

```sh
curl -vkI https://web.example.com/
```

Проверка считается успешной, если одновременно выполнены условия:

- DNS hostname разрешается через Cloudflare;
- Cloudflare Tunnel показывает `Healthy`;
- `cloudflared` работает через `procd`;
- local origin `127.0.0.1:18080` отвечает;
- внешний HTTPS hostname отвечает через Cloudflare;
- для этого WEB path не открыт входящий WAN TCP/443.

## 14. Что происходит после reboot/WAN reconnect

Штатный OpenWrt package интегрирован с `procd`:

- сервис стартует при boot, если `/etc/init.d/cloudflared enable` выполнен;
- при падении процесса используется `respawn`;
- при поднятии указанного WAN interface init-script перезапускает `cloudflared`;
- `--no-autoupdate` отключает встроенный self-update `cloudflared`.

На OpenWrt обновляйте `cloudflared` через package manager, а не встроенный updater:

```sh
apk update
apk upgrade cloudflared
```

После package update проверьте сервис и Tunnel health.

## 15. Token rotation

Cloudflare рекомендует периодически обновлять Tunnel token.

После rotation в Cloudflare Dashboard:

1. Получите новый token через Tunnel / Add a replica.
2. Замените token в LuCI или UCI.
3. Перезапустите service:

```sh
/etc/init.d/cloudflared restart
```

4. Убедитесь, что Tunnel снова `Healthy`.

Пример UCI без публикации реального token:

```sh
uci set cloudflared.config.token='<NEW_TUNNEL_TOKEN>'
uci commit cloudflared
/etc/init.d/cloudflared restart
```

Если token был скомпрометирован, rotation должна выполняться немедленно; старые connections при необходимости следует принудительно завершить со стороны Cloudflare.

## 16. Диагностика

### Tunnel остаётся Inactive

Проверьте:

```sh
/etc/init.d/cloudflared status
logread -e cloudflared
tail -n 100 /var/log/cloudflared.log
```

Типовые причины:

- неверный/устаревший token;
- DNS на OpenWrt не работает;
- outbound TCP/UDP 7844 блокируется;
- service не включён в UCI;
- service не запущен.

### Tunnel Healthy, но сайт не открывается

Это обычно уже не проблема Tunnel transport. Проверьте origin:

```sh
nginx -t
wget -S -O- http://127.0.0.1:18080/ 2>&1 | head -n 40
netstat -lntp 2>/dev/null | grep -E ':18080|:8080|:8090'
```

Затем проверьте, что Published application смотрит именно на:

```text
http://127.0.0.1:18080
```

### QUIC не устанавливается

Не переключайте протокол вслепую. Сначала проверьте egress UDP/7844. В режиме `auto` `cloudflared` может использовать подходящий transport; TCP/7844 нужен для HTTP/2.

### После обновления OpenWrt Tunnel не стартует

Проверьте наличие UCI config и package:

```sh
apk info cloudflared
ls -l /etc/config/cloudflared
/etc/init.d/cloudflared status
```

После `sysupgrade` отдельно убедитесь, что Tunnel token сохранился только в ожидаемом `cloudflared` config и не попал в публичные backup/log artifacts.

## 17. Security boundary

Cloudflare credentials не являются частью конфигурации telEgo.

Запрещено сохранять Tunnel token в:

```text
/etc/config/telego
/var/etc/telego.toml
GitHub Actions logs
GitHub issues
README examples
```

Stock OpenWrt integration хранит token в `/etc/config/cloudflared`. Считайте этот файл секретным operational state router и ограничивайте административный доступ/backup access соответствующим образом.

## 18. Что не требуется

В нашем Cloudflare WEB mode не нужны:

- `cloudflared tunnel login`;
- `cert.pem`;
- locally-managed Tunnel YAML для обычной установки;
- Cloudflare API token на router;
- inbound WAN TCP/443 для WEB Proxy;
- inbound WAN UDP/TCP 7844;
- ACME/Let's Encrypt certificate на OpenWrt для public WEB hostname;
- ручной binary download из GitHub Releases;
- собственный init.d script для `cloudflared`.

## 19. Официальные источники

- Create a remotely-managed Tunnel: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/
- Tunnel routing / Published applications: https://developers.cloudflare.com/tunnel/routing/
- Tunnel tokens: https://developers.cloudflare.com/tunnel/advanced/tunnel-tokens/
- Tunnel with firewall: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-with-firewall/
- Monitoring: https://developers.cloudflare.com/tunnel/monitoring/
- Troubleshooting: https://developers.cloudflare.com/tunnel/troubleshooting/
- OpenWrt `cloudflared` package: https://github.com/openwrt/packages/tree/master/net/cloudflared
- OpenWrt `luci-app-cloudflared`: https://github.com/openwrt/luci/tree/master/applications/luci-app-cloudflared

Связанный документ: **[Домен и DNS](DOMAIN.md)**.
