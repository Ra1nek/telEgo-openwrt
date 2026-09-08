# Документация telEgo OpenWrt

[**Русский**](README.md) · [English](README_EN.md)

Здесь собрана техническая документация проекта `telEgo-openwrt` для ветки `develop`. Она разделена по темам, чтобы можно было быстро перейти к установке, настройке, диагностике или устройству системы, не просматривая весь репозиторий.

> [!NOTE]
> `telEgo-openwrt` — OpenWrt-интеграция закреплённой версии [`Scratch-net/telego`](https://github.com/Scratch-net/telego). Go-ядро находится в подмодуле `telego-src/`; этот репозиторий добавляет APK-пакеты, LuCI, UCI/procd/ujail, локальную телеметрию rpcd, Nginx-интеграцию, установщик и CI/CD.

## С чего начать

| Задача | Откройте |
|---|---|
| Установить telEgo на OpenWrt | **[Установка](INSTALL.md)** |
| Настроить MTProxy, FakeTLS, WEB Proxy или Middle-End | **[Конфигурация и LuCI](CONFIGURATION.md)** |
| Понять схему трафика и устройство проекта | **[Архитектура](ARCHITECTURE.md)** |
| Разобраться с `ubus`, rpcd и Prometheus | **[Локальный API и телеметрия](API.md)** |
| Найти причину сбоя | **[Диагностика](TROUBLESHOOTING.md)** |
| Проверить модель изоляции и сетевое усиление | **[Безопасность](SECURITY.md)** |
| Собрать APK или подготовить релиз | **[Сборка и выпуск](BUILD.md)** |

## Разделы документации

### [Архитектура](ARCHITECTURE.md)

Устройство проекта от исходного кода до работающего сервиса на роутере:

- границы между upstream-ядром и OpenWrt-интеграцией;
- конвейер сборки Go → OpenWrt SDK → APK;
- жизненный цикл UCI → `/var/etc/telego.toml` → procd/ujail;
- путь MTProxy-трафика;
- Telegram Middle-End, Link Repair и Link Refresh;
- Native WEB Proxy, Nginx, Lanes и fallback-механика `418/419`.

### [Установка](INSTALL.md)

Практическое руководство по установке и обновлению:

- требования OpenWrt 25.12.x / x86_64;
- интерактивный `install.sh`;
- preview- и stable-каналы;
- проверка SHA-256 и доверие к подписи APK;
- `--allow-untrusted`;
- ручная установка пакетов;
- первоначальная проверка после установки.

### [Конфигурация и LuCI](CONFIGURATION.md)

Основное руководство администратора:

- все разделы UCI и значения по умолчанию;
- соответствие UCI и генерируемого TOML;
- пошаговое описание каждого поля LuCI;
- MTProxy и FakeTLS;
- DRS и Split-TLS;
- пользователи и 128-битные секреты;
- WEB Proxy и режимы `https`, `https-lanes`, `websocket`, `websocket-lanes`;
- Telegram Middle-End;
- производительность, upstream SOCKS5 и метрики.

### [Локальный API и телеметрия](API.md)

Описание локальных интерфейсов интеграции OpenWrt:

- `ubus call telego status`;
- rpcd/ucode backend;
- поля статуса LuCI;
- локальный Prometheus endpoint;
- ACL приложения;
- ограничения loopback-доступа к метрикам.

> [!IMPORTANT]
> В текущем fork нет публичного REST API управления на порту `9091`. Конфигурация выполняется через UCI/LuCI/procd, а состояние сервиса читается через локальные `ubus`/rpcd и Prometheus.

### [Сборка и выпуск](BUILD.md)

Документ для разработчиков и сопровождающих проекта:

- Go 1.27 и pinned upstream submodule;
- проверка OpenWrt-интеграции;
- сборка static PIE;
- OpenWrt SDK 25.12.5;
- формирование APK feed и `packages.adb`;
- develop preview;
- подписанные стабильные релизы;
- обновление upstream `telego-src/`.

### [Диагностика](TROUBLESHOOTING.md)

Пошаговые сценарии поиска неисправностей:

- сервис включён, но не запускается;
- LuCI не отображается;
- `ubus` или телеметрия недоступны;
- MTProxy недоступен из Интернета;
- WEB Proxy или Nginx fallback работают неправильно;
- установка APK завершается ошибкой;
- GitHub Actions не собирает ожидаемый пакет.

### [Безопасность](SECURITY.md)

Модель безопасности OpenWrt и механизмы сетевого усиления upstream telEgo:

- отдельная учётная запись `telego:telego`;
- обязательный `ujail` и `no_new_privs`;
- точечная capability `CAP_NET_BIND_SERVICE`;
- runtime-конфигурация с правами `0600`;
- DRS, Split-TLS и profile matching;
- `X25519MLKEM768` key-share parity;
- replay/probe handling;
- Nginx sanitization для `419`;
- границы доверия APK и signing key.

## Ключевые файлы реализации

Если нужно проверить, как функция реализована на самом деле, используйте соответствующий файл проекта:

| Область | Основные файлы |
|---|---|
| Сборка и релизы | `.github/workflows/build-telego.yaml`, `.github/workflows/release.yaml` |
| Метаданные пакетов | `package/*/Makefile` |
| Значения UCI по умолчанию | `package/telego-pkg/files/config/telego` |
| Преобразование UCI → TOML и запуск сервиса | `package/telego-pkg/files/init.d/telego` |
| Интерфейс LuCI | `package/luci-app-telego/htdocs/resources/view/telego/config.js` |
| Локальная телеметрия | `package/luci-app-telego/root/usr/share/rpcd/ucode/telego` |
| Права LuCI | `package/luci-app-telego/root/usr/share/rpcd/acl.d/luci-app-telego.json` |
| Интеграция Nginx | `package/nginx-telego/files/` |
| Go-ядро telEgo | подмодуль `telego-src/` |

## Поддерживаемая платформа

| Компонент | Текущее состояние |
|---|---|
| OpenWrt | `25.12.x` |
| Целевая версия CI | `25.12.5` |
| Архитектура | `x86_64` |
| Пакетный менеджер | `apk` |
| Go в production workflow | `1.27` |
| Upstream telEgo | pinned `v0.6.1` |
| Лицензия | Apache-2.0 |

Проект собирает четыре собственных APK-пакета:

```text
telego-pkg
luci-app-telego
luci-i18n-telego-ru
nginx-telego
```

Вернуться на главную страницу проекта: **[README.md](../README.md)**.
