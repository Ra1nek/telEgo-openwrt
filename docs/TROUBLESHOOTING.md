# Диагностика и устранение неисправностей

[**Русский**](TROUBLESHOOTING.md) · [English](TROUBLESHOOTING_EN.md)

Используйте минимальный diagnostic path, соответствующий симптому. Не выгружайте полный config или длинные logs без необходимости: `/etc/config/telego` содержит secrets.

## Быстрый triage

```sh
uci -q get telego.general.enabled
/etc/init.d/telego status
ubus call telego status
logread -e telego
```

## Service включён, но не работает

Проверьте:

```sh
uci -q get telego.general.enabled
/etc/init.d/telego status
logread -e telego
```

Типичные причины:

| Симптом | Вероятная область | Что проверить |
|---|---|---|
| `missing /usr/bin/telego` | package install | `ls -l /usr/bin/telego` |
| `/sbin/ujail is required` | отсутствует dependency | `ls -l /sbin/ujail` и состояние packages |
| missing capability file | package integrity | `ls -l /etc/capabilities/telego.json` |
| failed to generate TOML | invalid UCI/secret | `logread -e telego`; смотреть только нужную UCI section |
| bind/listen failure | конфликт порта | проверить текущие listeners и `general.bind_to` |
| immediate restart loop | runtime/config/network failure | `logread -e telego` и точную upstream error |

### Ошибка валидации secret

Secret должен содержать ровно 32 hexadecimal characters. По возможности проверяйте metadata, не публикуя само значение.

Список section names без вывода secrets:

```sh
uci show telego | sed -n 's/^telego\.\([^.=]*\)\.name=.*/\1/p'
```

Если secret всё же нужно посмотреть, делайте это только локально и не отправляйте output в публичный issue.

## Страница LuCI отсутствует

Проверьте package и перезапустите rpcd:

```sh
apk list -I | grep '^luci-app-telego'
/etc/init.d/rpcd restart
```

Проверьте наличие installed application files:

```text
/www/luci-static/resources/view/telego/
/usr/share/luci/menu.d/
/usr/share/rpcd/acl.d/
/usr/share/rpcd/ucode/
```

Browser cache может сохранять старые LuCI assets после upgrade; обновите страницу после package/rpcd changes.

## Статус LuCI или telemetry недоступны

Сначала вызовите project RPC напрямую:

```sh
ubus call telego status
```

Если object/method отсутствует:

```sh
/etc/init.d/rpcd restart
logread -e rpcd
```

Если service state отображается, но counters остаются нулевыми, проверьте metrics без раскрытия secrets:

```sh
uci -q get telego.metrics.bind_to
uci -q get telego.metrics.path
```

rpcd adapter выполняет fetch только с literal loopback. Для defaults:

```sh
uclient-fetch -q -T 2 -O - http://127.0.0.1:9090/metrics
```

Если команда не работает, убедитесь, что telEgo запущен и metrics listener/path не изменён.

## `ubus call telego status` возвращает нулевые counters

Нулевые counters нормальны при отсутствии трафика. Если traffic точно есть:

1. Убедитесь, что `running=true`.
2. Получите metrics endpoint напрямую.
3. Для LuCI telemetry подтвердите bind `127.0.0.1:<port>` или `[::1]:<port>`.
4. Проверьте наличие metric families, которые читает adapter:

```text
telego_connections_active
telego_ips_active
telego_ips_tracked
telego_ips_blocked
telego_traffic_in_bytes_total
telego_traffic_out_bytes_total
```

## MTProxy недоступен из Internet

Проверяйте слои по отдельности:

```mermaid
flowchart LR
    C["Client"] --> F["WAN firewall / NAT"]
    F --> L["general.bind_to"]
    L --> J["procd / ujail"]
    J --> D["telego daemon"]
```

Проверьте:

- `general.enabled=1`;
- настроенный `general.bind_to`;
- отсутствие конфликтующего local listener;
- WAN firewall rule;
- upstream NAT/port forwarding, если OpenWrt находится за другим router;
- service logs сразу после внешней попытки подключения.

Installer не создаёт WAN firewall rules автоматически.

## WEB Proxy не работает

Разделите path на stages:

```mermaid
flowchart LR
    C["Client"] --> T["Public TLS path"]
    T --> N["Nginx TLS server"]
    N --> S["telego.locations"]
    S --> W["127.0.0.1:8080"]
    W --> D["telEgo WEB handler"]
```

Проверьте:

1. `uci -q get telego.web_proxy.enabled`
2. `uci -q get telego.web_proxy.bind_to`
3. `uci -q get telego.web_proxy.hostname`
4. Nginx syntax: `nginx -t`, если команда доступна.
5. TLS `server {}` включает `/etc/nginx/snippets/telego.locations`.
6. DNS/certificate соответствуют configured hostname.
7. Ordinary-site fallback target, ожидаемый snippet, существует, если этот path используется.
8. Nginx и telEgo logs вокруг одной конкретной failed request.

Не публикуйте private telEgo WEB listener напрямую в Internet.

## Nginx fallback работает неправильно

`telego.locations` различает:

- `418` → обычный website traffic;
- `419` → unauthenticated carrier-shaped request, который sanitizes before fallback.

Если fallback не работает, проверяйте surrounding server и ordinary-site listener. Не удаляйте header sanitization как «быстрое исправление»: она не позволяет carrier credentials попасть на обычный сайт.

## Ошибка установки APK

Начните с:

```sh
apk update
```

Затем отделите dependency failure от trust failure.

### Signature/trust failure

Preview APK может потребовать явный bypass trust:

```sh
apk add --allow-untrusted ./telego-pkg-*.apk ...
```

Используйте это только для artifact, которому вы осознанно решили доверять. SHA-256 match подтверждает integrity относительно manifest, но не identity издателя.

### Missing dependency

Не копируйте случайные APK из несвязанных feed directories CI artifact. Обычные system dependencies должны разрешаться из настроенных OpenWrt repositories роутера.

Проверьте, что устройство действительно работает на OpenWrt `25.12.x` x86_64 и repositories соответствуют firmware.

## Ошибка CI build

Для GitHub Actions:

1. Откройте failed job.
2. Найдите failed step.
3. Извлеките точную error и короткий surrounding log range.
4. Проверьте напрямую связанные package Makefile/workflow/source files.
5. После исправления смотрите run **нового commit**.
6. Проверьте наличие всех 4 APK и `packages.adb` в final artifact.

Не делайте вывод об успехе только по зелёному SDK step, если package мог быть пропущен; project verification gate специально проверяет этот случай.

## Безопасная diagnostic summary

Этот набор команд не выводит user secrets:

```sh
printf 'enabled='; uci -q get telego.general.enabled || true
printf 'bind='; uci -q get telego.general.bind_to || true
printf 'web='; uci -q get telego.web_proxy.enabled || true
printf 'metrics='; uci -q get telego.metrics.bind_to || true
/etc/init.d/telego status || true
ubus call telego status || true
logread -e telego | tail -n 80
```

Перед публикацией logs проверьте их на public IPs, hostnames, proxy tags, credentials и secrets.

## Связанная документация

- [Конфигурация](CONFIGURATION.md)
- [Local telemetry API](API.md)
- [Архитектура](ARCHITECTURE.md)
- [Безопасность](SECURITY.md)
