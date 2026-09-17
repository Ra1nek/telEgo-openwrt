# P11 — Cloudflare WEB TLS ownership contract

[Русский](P11_CLOUDFLARE_TLS.md) · [English](P11_CLOUDFLARE_TLS_EN.md)

P11 фиксирует границу ответственности между Cloudflare WEB ingress и локальным Native Shared-Port TLS.

## Целевая Cloudflare-схема

Публичный TLS для WEB Proxy принадлежит Cloudflare Edge:

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

На OpenWrt для Cloudflare WEB path не нужен локальный WEB-сертификат, ACME/Let's Encrypt/certbot renewal и отдельный HTTPS origin. Published Application должна использовать `http://127.0.0.1:18080`.

## Runtime-инвариант P11

Если одновременно выполняется:

```text
nginx_telego.cloudflare.enabled = 1
nginx_telego.shared.enabled != 1
```

то генератор `/var/etc/telego.toml` не передаёт в активный runtime следующие Native Shared-Port endpoints:

```text
cert-host
cert-port
splice-host
splice-port
```

Это относится только к endpoint-полям, связывающим telEgo с локальными TLS listeners Native Shared-Port. Остальные параметры `tls-fronting`, включая `mask-host`, `mask-port`, FakeTLS/DRS/Split-TLS и связанные runtime controls, не удаляются P11.

## Почему значения не удаляются из UCI

P11 не уничтожает сохранённые значения:

```text
telego.tls_fronting.cert_host
telego.tls_fronting.cert_port
telego.tls_fronting.splice_host
telego.tls_fronting.splice_port
```

Они могут оставаться в `/etc/config/telego`, но при эксклюзивном Cloudflare profile не участвуют в активном runtime. Это позволяет безопасно переключиться обратно на `Native Shared-Port` без повторного ввода advanced-настроек.

При возврате к:

```text
nginx_telego.cloudflare.enabled = 0
nginx_telego.shared.enabled = 1
```

сохранённые endpoint-значения снова попадают в runtime TOML и проверяются обычным Native Shared-Port contract.

## LuCI

В основной странице конфигурации telEgo при эксклюзивном Cloudflare profile поля:

- `Certificate Host`;
- `Certificate Port`;
- `Fallback Host`;
- `Fallback Port`;

не показываются. Это UI-отражение runtime-контракта, а не удаление UCI-данных.

В `Services → telEgo → WEB Ingress / Nginx Integration` Cloudflare profile по-прежнему показывает локальный origin:

```text
http://127.0.0.1:18080
```

Поля `TLS Certificate` и `TLS Private Key` принадлежат только `Native Shared-Port` mode.

## Reload contract

`/etc/init.d/telego` подписан на reload trigger для `nginx_telego` при наличии этого UCI package. Поэтому переключение ingress profile приводит не только к Nginx reconciliation, но и к пересборке telEgo runtime-конфигурации.

Иными словами, переход:

```text
Native Shared-Port → Cloudflare Tunnel
```

убирает локальные certificate/splice endpoints из активного `telego.toml`, а обратный переход восстанавливает сохранённые значения.

## Что P11 намеренно не делает

P11 не:

- удаляет пользовательские certificate/key files;
- очищает UCI-поля Native Shared-Port;
- управляет ACME или `cloudflared` credentials;
- превращает `nginx-telego` в файловый менеджер сертификатов;
- меняет ownership model P7/P8/P9/P10;
- разрешает одновременно активные managed `cloudflare` и `shared` profiles.

Конфликт двух managed ingress profiles остаётся ошибкой и отклоняется Nginx reconciliation contract.

## Проверки

CI покрывает:

1. обычный/advanced TLS-fronting runtime сохраняет `cert-*` и `splice-*`;
2. exclusive Cloudflare mode исключает четыре локальных endpoint-поля из runtime TOML;
3. возврат в Native Shared-Port восстанавливает сохранённые значения;
4. LuCI скрывает эти четыре endpoint-поля в Cloudflare mode и показывает их в остальных режимах;
5. сборку APK и smoke OpenWrt 25.12.x.

Для аппаратной проверки после установки preview достаточно сравнить `/var/etc/telego.toml` в Cloudflare и Native Shared-Port modes и убедиться, что Cloudflare chain остаётся `cloudflared → Nginx :18080 → telEgo WEB :8080` без локального WEB TLS listener.
