# Установка

[**Русский**](INSTALL.md) · [English](INSTALL_EN.md)

В этом руководстве описаны поддерживаемые способы установки `telEgo-openwrt` на OpenWrt.

## Требования

- OpenWrt `25.12.x` на архитектуре `x86_64`.
- Доступ с правами `root`.
- Рабочие репозитории пакетов OpenWrt и пакетный менеджер `apk`.
- Не менее 32 MiB свободного места в `/tmp` и `/` для предварительной проверки интерактивного установщика.
- `uclient-fetch`, `wget` или `curl` для загрузки файлов.
- Свободный TCP-порт для MTProxy; по умолчанию проект использует `0.0.0.0:443`.
- Для обычного MTProxy — подходящее правило WAN firewall для выбранного MTProxy-порта. Direct HTTPS управляет только своим собственным WAN TCP/443 redirect автоматически.

Для WEB Proxy нужен публичный hostname. Managed Direct HTTPS и Native Shared-Port генерируют Nginx TLS-конфигурацию сами, но сертификат остаётся отдельным deployment asset: его можно предоставить вручную или выпустить через опциональный OpenWrt ACME DNS-01 add-on.

## Выбор способа установки

```mermaid
flowchart TD
    A["Нужно установить telEgo на OpenWrt?"] --> B{"Источник пакетов"}
    B -->|"предварительная сборка develop"| P["Интерактивный install.sh<br/>по умолчанию: develop-latest"]
    B -->|"стабильный выпуск"| S["install.sh --release latest<br/>или явный тег версии"]
    B -->|"артефакт из CI"| C["scripts/install-on-router.sh<br/>или ручной apk add"]
    P --> T{"Ключ подписи APK доверен?"}
    T -->|"нет"| U["Требуется явный --allow-untrusted"]
    T -->|"да"| I["Обычная проверка доверия APK"]
    S --> I
    C --> I
```

## Рекомендуемый способ: интерактивный установщик

Запустите на роутере от имени `root`:

```sh
wget -O /tmp/telego-install.sh \
  https://raw.githubusercontent.com/Ra1nek/telEgo-openwrt/develop/install.sh
sh /tmp/telego-install.sh
```

Установщик написан для стандартного POSIX/OpenWrt `sh`; Bash и `jq` на роутере не требуются.

На новой установке мастер предварительно выбирает полный набор компонентов telEgo, но позволяет изменить состав до APK-транзакции:

| Компонент | Назначение | По умолчанию |
|---|---|---|
| `telego-pkg` | daemon, UCI, procd/ujail | выбран |
| `luci-app-telego` | LuCI и локальный rpcd | выбран |
| `nginx-telego` | managed WEB ingress, firewall/certificate helpers | выбран, но **все ingress-профили выключены** |
| `luci-i18n-telego-ru` | русский перевод | по языку/выбору пользователя |
| OpenWrt ACME DNS-01 | `acme-acmesh + acme-acmesh-dnsapi + luci-app-acme` | **не выбран** |

`nginx-ssl` устанавливается как системная зависимость, когда выбран `nginx-telego`. Установка `nginx-telego` безопасна сама по себе: `Direct HTTPS`, `Cloudflare` и `Native Shared-Port` имеют `enabled=0` и не занимают WAN-порты до явного **Save & Apply** пользователя.

ACME-пакеты не входят в проектный APK manifest и не становятся собственностью telEgo. Installer может добавить их из настроенных OpenWrt repositories, но никогда не удаляет автоматически при удалении telEgo.

Если эти ACME-пакеты уже установлены в системе для другого сервиса, обычное обновление telEgo **не считает их выбранным компонентом telEgo** и не устанавливает из-за них `nginx-telego`. Связать ACME с telEgo installer можно только явным выбором пункта ACME или параметром `--acme`.

### Параметры установщика

```text
--lang ru|en         язык интерфейса установщика
--ru                 установить русский перевод LuCI
--no-ru              не устанавливать русский перевод LuCI
--acme               добавить OpenWrt ACME DNS-01 (по умолчанию выключено)
--no-acme            не добавлять optional ACME packages
--release TAG        тег выпуска; по умолчанию develop-latest
                     latest = последний стабильный выпуск
--allow-untrusted    явно разрешить установку APK без доверенного ключа подписи
--yes                подтвердить установку без дополнительных запросов
-h, --help           показать справку
```

Примеры:

```sh
# Русский интерфейс + перевод LuCI, неинтерактивная установка develop-сборки
sh /tmp/telego-install.sh \
  --lang ru --ru --yes --allow-untrusted

# Английский интерфейс без русского перевода LuCI
sh /tmp/telego-install.sh \
  --lang en --no-ru --yes --allow-untrusted

# Develop preview + опциональная поддержка ACME DNS-01
sh /tmp/telego-install.sh \
  --lang ru --ru --acme --yes --allow-untrusted

# Последний стабильный выпуск — после публикации и настройки доверенного ключа подписи
sh /tmp/telego-install.sh \
  --lang en --no-ru --release latest --yes
```

> [!CAUTION]
> `--yes` **не включает** `--allow-untrusted`. Если ключ подписи предварительной сборки не считается доверенным на роутере, разрешение на такую установку нужно указать отдельно.

## Что проверяет установщик

Для выбранного канала выпуска установщик:

1. проверяет версию OpenWrt `25.12.x` и архитектуру `x86_64`;
2. проверяет наличие необходимых утилит и свободного места;
3. загружает `telego-install.sha256`;
4. выбирает ровно один подходящий APK для каждого запрошенного пакета проекта;
5. проверяет целостность файлов по SHA-256;
6. выполняет предварительную проверку установки средствами `apk`;
7. добавляет системные зависимости выбранных компонентов; optional ACME добавляется только по явному выбору;
8. устанавливает выбранный комплект одной APK-транзакцией;
9. сохраняет существующий `/etc/config/telego` при обновлении;
10. при необходимости перезапускает связанные системные службы, не включая managed ingress автоматически.

Манифест `develop-latest` публикуется только после успешной сборки соответствующего коммита ветки `develop`. Файлы пакетов загружаются раньше манифеста, поэтому установщик, запущенный во время обновления канала, завершится с ошибкой проверки целостности вместо того, чтобы незаметно установить пакеты из разных ревизий.

## Доверие к пакетам

Следует различать два независимых свойства:

- **Целостность по SHA-256** показывает, совпадают ли загруженные файлы с опубликованным манифестом.
- **Доверие к подписи APK** показывает, доверяет ли роутер ключу, которым подписан пакет.

Совпадение контрольной суммы само по себе не подтверждает подлинность издателя.

Для стабильных выпусков устанавливайте открытый ключ подписи APK через доверенный канал и независимо проверяйте его отпечаток, прежде чем полагаться на проверку подписи. Закрытый ключ подписи никогда не должен распространяться или устанавливаться на роутер.

Для тестовой сборки, происхождению которой вы осознанно доверяете, флаг `--allow-untrusted` явно отключает проверку доверия к ключу подписи. По умолчанию этот режим не используется.

## Установка артефакта CI с компьютера

Артефакт CI содержит репозиторий пакетов проекта. Укажите каталог, в котором находится ровно одна версия каждого APK проекта:

```bash
bash scripts/install-on-router.sh 192.168.1.1 ./x86_64/telego
```

Для тестовой сборки, которой вы осознанно доверяете:

```bash
bash scripts/install-on-router.sh \
  --allow-untrusted 192.168.1.1 ./x86_64/telego
```

Вспомогательный скрипт:

- проверяет, что для каждого из четырёх пакетов проекта присутствует ровно один APK;
- создаёт на роутере временный каталог с ограниченным доступом;
- копирует в него только эти APK;
- выполняет `apk update` и устанавливает все четыре пакета одной операцией;
- перезапускает `rpcd`;
- удаляет временные файлы.

Этот CI-helper устанавливает только четыре APK проекта. Optional ACME add-on добавляйте через основной `install.sh --acme` или вручную из OpenWrt repositories:

```sh
apk add acme-acmesh acme-acmesh-dnsapi luci-app-acme
```

## Ручная установка

Скопируйте только четыре APK проекта в отдельный каталог с ограниченным доступом, например `/tmp/telego-install`:

```sh
cd /tmp/telego-install
apk update
apk add \
  ./telego-pkg-*.apk \
  ./luci-app-telego-*.apk \
  ./luci-i18n-telego-ru-*.apk \
  ./nginx-telego-*.apk
/etc/init.d/rpcd restart
```

Для неподписанной или недоверенной тестовой сборки, происхождению которой вы осознанно доверяете:

```sh
apk add --allow-untrusted \
  ./telego-pkg-*.apk \
  ./luci-app-telego-*.apk \
  ./luci-i18n-telego-ru-*.apk \
  ./nginx-telego-*.apk
```

Системные зависимости должны устанавливаться из репозиториев OpenWrt, настроенных на самом роутере. Не добавляйте в каталог установки случайные APK из посторонних каталогов `base`, `luci` или `packages` артефакта CI.

## Первая настройка

1. Откройте **Services → telEgo** в LuCI.
2. Добавьте хотя бы одного пользователя с секретом из 32 шестнадцатеричных символов.
3. Выберите порт MTProxy. Для **Direct HTTPS** используйте не `:443` (например, `0.0.0.0:9443`); WAN TCP/443 в этом режиме принадлежит WEB/Nginx. Если WEB и MTProxy должны делить публичный `:443`, используйте **Native Shared-Port**.
4. Настройте TLS Fronting в соответствии с выбранной схемой подключения.
5. Оставьте WEB Proxy выключенным, пока не будут подготовлены Nginx и TLS.
6. Включите MTProxy.
7. Нажмите **Save & Apply**.

После этого сервис создаст `/var/etc/telego.toml` и запустится через procd/ujail от имени непривилегированного пользователя `telego`.

## Рекомендуемый путь: Direct HTTPS + ACME DNS-01

Это безопасный порядок для новой установки. Он не публикует WAN TCP/443, пока backend и сертификат не прошли проверки.

1. Установите telEgo. Если хотите управлять сертификатом средствами OpenWrt, в installer отметьте **OpenWrt ACME DNS-01** или используйте `--acme`.
2. В **Services → telEgo → Configuration**:
   - включите telEgo;
   - задайте MTProxy listener на отдельном порту, например `0.0.0.0:9443`;
   - если MTProxy должен быть доступен из Internet, создайте обычное WAN TCP/9443 allow-rule самостоятельно; `nginx-telego-firewall` намеренно управляет только Direct WEB redirect WAN TCP/443 → :18443;
   - добавьте пользователя/secret;
   - включите WEB Proxy;
   - оставьте WEB bind `127.0.0.1:8080`;
   - задайте публичный hostname;
   - оставьте `127.0.0.1/32` в Trusted Proxy CIDRs;
   - нажмите **Save & Apply**.
3. Если выбран ACME add-on, откройте **Services → ACME** и настройте DNS-01 для WEB hostname. Начните со staging CA. DNS API credentials принадлежат ACME и не должны попадать в `telego` или `nginx_telego`.
4. После выпуска production certificate используйте стабильные пути:
   ```text
   /etc/ssl/acme/<hostname>.fullchain.crt
   /etc/ssl/acme/<hostname>.key
   ```
5. Откройте **Services → telEgo → WEB Ingress**, выберите **Direct HTTPS**, укажите hostname/certificate/key и сначала запустите **Certificate Preflight** и **Firewall Preflight**.
6. Только после успешных preflight нажмите **Save & Apply**. Apply-path выполняется в безопасном порядке: firewall check → Nginx reconcile/`nginx -t` → package-owned WAN TCP/443 redirect.
7. Выполните [аппаратную проверку Direct HTTPS](DIRECT_HTTPS_TEST.md): LAN :443 → LuCI, WAN :443 → Nginx, WAN :18443 закрыт напрямую, HTTP/2, Telegram Desktop, reboot и rollback.

> [!IMPORTANT]
> Direct HTTPS не является способом совместить MTProxy и WEB на одном публичном TCP/443. Для этого существует **Native Shared-Port (Advanced)**.

## Проверка работы сервиса

```sh
/etc/init.d/telego status
ubus call telego status
logread -e telego
```

Проверить владельца и права доступа сгенерированного файла, не раскрывая секреты:

```sh
ls -l /var/etc/telego.toml
```

При настроенном и запущенном сервисе ожидаются владелец `telego:telego` и права доступа `0600`.

## Требования WEB Proxy

`nginx-telego` устанавливает package-owned core/snippet и reconciliation engine. Финальный managed layout P6/P7:

```text
/etc/nginx/conf.d/20-telego-core.conf
/etc/nginx/snippets/telego.locations
/etc/nginx/conf.d/80-telego-ingress.conf      # conditional generated
/etc/nginx/conf.d/85-telego-fallback.conf     # conditional generated
/usr/share/nginx-telego/ownership.tsv
/usr/libexec/nginx-telego-reconcile
```

Файлы `80-*` и `85-*` появляются только когда соответствующий managed profile/fallback включён. Обычный apply выполняйте через:

```sh
/etc/init.d/nginx-telego reload
```

Не запускайте renderer напрямую для обычного управления: init script передаёт изменения reconciler, который проверяет ownership/drift, выполняет безопасную migration/repair, вызывает renderer как внутренний генератор, запускает финальный `nginx -t` и откатывает managed filesystem при ошибке.

Если используется administrator-managed TLS `server {}` с generic snippet, подключите:

```nginx
include /etc/nginx/snippets/telego.locations;
```

Администратор по-прежнему отвечает за:

- DNS для настроенного имени хоста WEB Proxy;
- TLS-сертификат и закрытый ключ;
- схему публичных и внутренних слушающих адресов Nginx, подходящую для выбранной топологии;
- внутренний обработчик обычного сайта, который ожидает `telego.locations`, если используется этот сценарий;
- правила WAN firewall/NAT.

См. [ARCHITECTURE.md](ARCHITECTURE.md#native-web-proxy-и-nginx) и [NGINX_FILES.md](NGINX_FILES.md).

## Поведение при обновлении

Интерактивный установщик сохраняет существующий `/etc/config/telego` и создаёт его резервную копию с ограниченным доступом в `/etc/telego-backups/`. Если telEgo работал до обновления, после замены пакетов установщик может восстановить штатную работу сервиса.

Параметры UCI преобразуются в сгенерированный TOML, поэтому основным источником конфигурации остаётся UCI. Не сохраняйте и не редактируйте `/var/etc/telego.toml` как основной конфигурационный файл.

## Удаление

Удалите пакеты проекта средствами OpenWrt `apk` в соответствии с тем, какие компоненты вам больше не нужны. Например:

```sh
apk del luci-i18n-telego-ru luci-app-telego nginx-telego telego-pkg
```

Перед удалением отдельно проверьте `/etc/config/telego`, резервные копии и созданную администратором конфигурацию Nginx/TLS: они могут содержать настройки, которые требуется сохранить.

## Что читать дальше

- [Конфигурация](CONFIGURATION.md)
- [Архитектура](ARCHITECTURE.md)
- [Диагностика](TROUBLESHOOTING.md)
- [Модель безопасности](SECURITY.md)
