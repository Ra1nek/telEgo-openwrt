# TLS-сертификат для Direct HTTPS через ACME DNS-01

[**Русский**](TLS_CERTIFICATE.md) · [English](TLS_CERTIFICATE_EN.md) · [Проверка Direct HTTPS](DIRECT_HTTPS_TEST.md)

Эта инструкция настраивает сертификат OpenWrt ACME для Direct HTTPS и Native Shared-Port без передачи ACME-клиенту публичных портов 80/443.

> [!NOTE]
> Проверено для OpenWrt **25.12.5** (ветка 25.12): `acme-common 1.5.3`, `acme-acmesh 3.1.3-r3`. В OpenWrt 25.12 актуальное имя параметра — `option staging`; старое `use_staging` поддерживается только для совместимости.

## Целевая схема

Для Direct HTTPS рекомендуется DNS-01:

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

DNS-01 подтверждает владение доменом через TXT-запись. Поэтому ACME не требуется временно занимать WAN TCP/80 или TCP/443 и не требуется менять ownership LuCI/uhttpd или Direct HTTPS firewall redirect.

## Пакеты

ACME намеренно не является обязательной зависимостью `nginx-telego`: Direct HTTPS также принимает сертификат, которым управляет администратор.

Для новой установки самый простой вариант — выбрать **OpenWrt ACME DNS-01** в интерактивном `install.sh` или запустить installer с `--acme`. Этот opt-in add-on устанавливает из официальных OpenWrt repositories:

```text
acme-acmesh
acme-acmesh-dnsapi
luci-app-acme
```

Он **не включён по умолчанию**, не создаёт certificate section и не запрашивает DNS API credentials от имени telEgo. Уже установленные ACME-пакеты также не удаляются при удалении telEgo.

Ручной эквивалент:

```sh
apk add acme-acmesh acme-acmesh-dnsapi luci-app-acme
```

`acme-acmesh-dnsapi` содержит DNS API hooks для провайдеров, поддерживаемых acme.sh.

## Пример /etc/config/acme

Сначала используйте staging CA:

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

Имена credentials зависят от выбранного DNS API hook. Не копируйте секреты DNS API в `/etc/config/nginx_telego` или `/etc/config/telego`.

После сохранения:

```sh
/etc/init.d/acme enable
/etc/init.d/acme restart
logread -e acme
```

После успешной staging-проверки переключите certificate section на production:

```sh
uci set acme.telego_web.staging='0'
uci commit acme
/etc/init.d/acme restart
```

## Стабильные пути сертификата

OpenWrt ACME публикует удобные symlink paths в `/etc/ssl/acme/`.

Для hostname `web.example.com` используйте:

```text
/etc/ssl/acme/web.example.com.fullchain.crt
/etc/ssl/acme/web.example.com.key
```

Для Direct HTTPS:

```sh
uci set nginx_telego.direct_https.hostname='web.example.com'
uci set nginx_telego.direct_https.certificate='/etc/ssl/acme/web.example.com.fullchain.crt'
uci set nginx_telego.direct_https.certificate_key='/etc/ssl/acme/web.example.com.key'
uci commit nginx_telego
/etc/init.d/nginx-telego reload
```

Symlink paths намеренно поддерживаются: ACME может менять generation directory, а Nginx продолжает ссылаться на стабильный путь.

## Certificate Status в LuCI

`Services → telEgo → WEB Ingress` показывает read-only состояние активного локального TLS profile:

- X.509 certificate parse;
- private key parse;
- совпадение certificate/public key с private key;
- покрытие configured hostname;
- expiry state: более 30 дней, менее 30 дней, менее 7 дней или expired;
- `notAfter`;
- SHA-256 fingerprint;
- признак использования стабильных OpenWrt ACME paths.

Кнопка **Certificate Preflight** выполняет те же строгие проверки и затем:

```sh
nginx -t -c /etc/nginx/uci.conf
```

Она не изменяет файлы и не reload/restart сервисы.

## Renewal contract

OpenWrt 25.12 сначала вызывает ACME hotplug hooks, а затем публикует событие `acme.renew`.

`nginx-telego` устанавливает:

```text
/etc/hotplug.d/acme/90-nginx-telego
```

Цепочка renewal:

```text
ACME обновил certificate/key
        ↓
90-nginx-telego
        ↓
nginx-telego-cert preflight
        ├─ X.509 parse
        ├─ private key parse
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

telEgo hook **не выполняет второй reload**. Это предотвращает двойную перезагрузку и сохраняет ownership штатного OpenWrt Nginx lifecycle.

Если ранний preflight обнаружит проблему, hook пишет ошибку в `logread`. После этого штатный Nginx reload всё равно выполняет собственный `nginx -t`; при невалидной конфигурации он отказывается сигнализировать работающий master process.

## Проверка вручную

```sh
/usr/libexec/nginx-telego-cert status
/usr/libexec/nginx-telego-cert preflight
nginx -t -c /etc/nginx/uci.conf
logread -e nginx-telego-acme
```

Для Direct HTTPS дополнительно:

```sh
uci show firewall.telego_direct_https
ss -lntp | grep ':18443'
```

## Граница ответственности

Интеграция `nginx-telego`:

- не хранит DNS API credentials;
- не выпускает сертификаты самостоятельно;
- не изменяет `/etc/config/acme`;
- не добавляет ACME как обязательную зависимость `nginx-telego`;
- не перехватывает штатный `acme.renew` Nginx trigger;
- не удаляет пользовательские certificate/key files;
- не использует HTTP-01/ALPN-01 и не отбирает порты 80/443 у существующих сервисов.

ACME остаётся отдельным OpenWrt subsystem. telEgo только потребляет стабильные certificate paths, показывает их состояние и добавляет безопасный preflight перед штатным renewal reload.
