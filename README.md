[Read in English](README_EN.md)

---

# 🚀 telEgo — Telegram MTProxy + WEB Proxy для OpenWrt

<div align="center">

[![OpenWrt](https://img.shields.io/badge/OpenWrt-25.12.4+-blue?style=for-the-badge&logo=openwrt)](https://openwrt.org/)
[![Go](https://img.shields.io/badge/Go-1.24+-blue?style=for-the-badge&logo=go)](https://golang.org/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-x86_64%20%7C%20arm-blue?style=for-the-badge)](#)

**Модуль LuCI для управления Telegram MTProxy и WEB Proxy на роутерах OpenWrt**

</div>

---

## 📖 Описание проекта

**telEgo** — это комплексное решение для развёртывания сервера прокси Telegram прямо на вашем роутере под управлением OpenWrt. Проект предоставляет полноценный веб-интерфейс (LuCI) для настройки и управления как классическим MTProxy, так и новым стандартом WEB Proxy.

### 🎯 Решаемые задачи:

| Задача | Решение |
|--------|---------|
| 🔐 Обход блокировок Telegram | MTProxy с поддержкой TLS/FakeTLS/Obfuscated2 |
| 🌐 Новый стандарт прокси | WEB Proxy (HTTPS, WebSocket, Lanes) |
| 👥 Мультипользовательский доступ | Система секретов для аутентификации |
| ⚡ Маршрутизация трафика | Поддержка Middle-End серверов Telegram |
| 🖥️ Удобное управление | Интуитивный LuCI веб-интерфейс |

---

## ✨ Ключевые возможности

### 🔷 MTProxy (Классический протокол)

<table>
<tr>
<td width="50%">
**Режимы шифрования:**
</td>
<td width="50%">
✅ **TLS Mode (ee)** — Стандартный TLS<br>
✅ **FakeTLS** — Имитация TLS для обхода DPI<br>
✅ **Secure Mode (dd)** — Obfuscated2
</td>
</tr>
<tr>
<td width="50%">
**Функции:**
</td>
<td width="50%">
🔹 Middle-End Proxy Routing<br>
🔹 TLS Domain Masking (FakeTLS)<br>
🔹 Генерация секретов 32 hex символа<br>
🔹 Динамическое управление секциями
</td>
</tr>
</table>

### 🔷 WEB Proxy (Новый стандарт Telegram)

<table>
<tr>
<td width="50%">
**Carrier Modes:**
</td>
<td width="50%">
🌐 **HTTPS** — Прямой HTTPS-туннель<br>
🔗 **WebSocket** — WebSocket-туннелирование<br>
🚧 **WebSocket Lanes** — Оптимизированный WS<br>
⚡ **HTTPS Lanes** — Оптимизированный HTTPS
</td>
</tr>
<tr>
<td width="50%">
**Настройки:**
</td>
<td width="50%">
🔸 Настройка bind-адреса<br>
🔸 Конфигурация hostname<br>
🔸 Интеграция с Nginx reverse proxy
</td>
</tr>
</table>

### 🔷 Дополнительные функции

| Функция | Описание |
|---------|----------|
| 📊 **Статистика** | Мониторинг активных соединений и трафика |
| 🔄 **Автозапуск** | Скрипт `/etc/init.d/telego` для запуска при загрузке |
| 🌐 **DDNS Support** | Поддержка динамических DNS (freedns.afraid.org) |
| 📱 **Multi-Platform** | x86_64, arm — совместимость с большинством роутеров |

---

## 🏗️ Архитектура проекта

```
telEgo-openwrt/
│
├── 📁 .github/workflows/          # CI/CD пайплайны
│   ├── build-luci.yaml           # Сборка LuCI приложения
│   ├── build-telego.yaml         # Сборка Go бинарника
│   ├── release.yaml              # Публикация релизов
│   ├── codeql.yml                # Security анализ
│   └── stale.yml                 # Управление issues/PRs
│
├── 📁 luci-app-telego/            # LuCI веб-интерфейс
│   ├── Makefile                  # Правила сборки пакета
│   ├── htdocs/css/               # Стили интерфейса
│   │   └── telego.css           # Основной CSS файл
│   ├── lua/model/                # Модели данных
│   ├── lua/view/                 # Представления (views)
│   │   └── telego/
│   │       ├── config.lua        # Форма конфигурации
│   │       ├── status.htm        # Страница статуса
│   │       └── status.lua        # Логика статуса
│   └── root/usr/share/luci/view/ # Шаблоны
│       └── telego/
│           └── secret_row.tpl    # Шаблон строки секретов
│
├── 📁 telego-pkg/                 # Пакет Go бинарника
│   ├── Makefile                  # Правила сборки
│   ├── config/                   # Конфигурационные файлы
│   └── files/                    # Файлы для установки
│       └── etc/init.d/telego     # Скрипт автозапуска
│
├── 📁 nginx-pkg/                  # Пакет Nginx reverse proxy
│   ├── Makefile                 
│   └── files/                   
│       └── www/luci-static/     # Статические файлы
│
├── 📁 scripts/                    # Утилиты сборки и установки
│   ├── build-all.sh             # Сборка всех компонентов
│   ├── generate-secret.sh       # Генерация секретов
│   └── install-on-router.sh     # Установка на роутер
│
├── 📁 docs/                       # Документация
│   ├── API.md                   # Описание API
│   ├── BUILD.md                 # Инструкция сборки
│   ├── CONFIGURATION.md         # Настройка и использование
│   └── INSTALL.md               # Установка пакетов
│
├── LICENSE                      # MIT лицензия
└── README.md                    # Этот файл
```

---

## 📦 Структура компонентов

| Компонент | Назначение | Путь |
|-----------|------------|------|
| **LuCI App** | Веб-интерфейс конфигурации | `luci-app-telego/` |
| **Go Binary** | Основной сервер MTProxy + WEB Proxy | `telego-pkg/` |
| **Nginx** | Reverse proxy для WEB Proxy | `nginx-pkg/` |
| **Init Script** | Автозапуск при загрузке системы | `/etc/init.d/telego` |

---

## 🛠️ Установка и сборка

### Вариант 1: Сборка из исходников (Рекомендуется)

#### Шаг 1: Клонирование репозитория

```bash
git clone https://github.com/Ra1nek/telEgo-openwrt.git
cd telEgo-openwrt
```

#### Шаг 2: Использование скрипта быстрой сборки

```bash
chmod +x scripts/build-all.sh
./scripts/build-all.sh
```

Это автоматически соберёт:
- ✅ Go бинарник `telego` для x86_64 и arm
- ✅ LuCI приложение `luci-app-telego.apk`
- ✅ Nginx пакет с конфигурацией

#### Шаг 3: Ручная сборка (по отдельности)

**Сборка Go бинарника:**
```bash
cd telego-pkg
make package/telego/compile
```

**Сборка LuCI приложения:**
```bash
cd luci-app-telego
make package/luci-app-telego/compile
```

### Вариант 2: Установка готовых APK файлов

#### Шаг 1: Скачивание релизов

Перейдите на страницу [Releases](https://github.com/Ra1nek/telEgo-openwrt/releases) и скачайте:
- `telego_<version>_x86_64.apk` (или `arm`) — Go бинарник
- `luci-app-telego_<version>_noarch.apk` — LuCI интерфейс
- `nginx-telego_<version>_x86_64.apk` — Nginx пакет

#### Шаг 2: Передача файлов на роутер

```bash
# Через scp (с Windows используйте WinSCP или similar)
scp telego_*.apk root@192.168.88.1:/tmp/
scp luci-app-telego_*.apk root@192.168.88.1:/tmp/
scp nginx-telego_*.apk root@192.168.88.1:/tmp/
```

#### Шаг 3: Установка пакетов на роутере

```bash
# SSH подключение к роутеру
ssh root@192.168.88.1

# Установка пакетов (порядок важен!)
apt-get update
apt-get install /tmp/telego_*.apk
apt-get install /tmp/nginx-telego_*.apk
apt-get install /tmp/luci-app-telego_*.apk
```

#### Шаг 4: Применение конфигурации и перезапуск

```bash
cfg -a /etc/config/telego
/etc/init.d/telego enable
/etc/init.d/telego start
/etc/init.d/nginx restart
```

---

## ⚙️ Настройка и использование

### Доступ к интерфейсу

После установки перейдите в веб-интерфейс OpenWrt:

```
Система → telEgo → Конфигурация
```

### Основные разделы конфигурации

#### 1️⃣ Общие настройки (General Settings)

| Параметр | Описание | Значения |
|----------|----------|----------|
| **Use Middle-End Proxy** | Маршрутизация через сервера Telegram | ✅ / ❌ |
| **TLS Mode (ee)** | Стандартный TLS режим | ✅ / ❌ |
| **FakeTLS** | Имитация TLS для обхода DPI | ✅ / ❌ |
| **Secure Mode (dd)** | Обфускация трафика (Obfuscated2) | ✅ / ❌ |
| **TLS Domain** | Домен для маскировки FakeTLS | `google.com` (по умолчанию) |

#### 2️⃣ Конфигурация сервера (Server Configuration)

| Параметр | Описание | Значения |
|----------|----------|----------|
| **Port** | Порт MTProxy | `443` (рекомендуется) |

#### 3️⃣ WEB Proxy конфигурация

| Параметр | Описание | Значения |
|----------|----------|----------|
| **Enable WEB Proxy** | Включить WEB Proxy | ✅ / ❌ |
| **Carrier Mode** | Режим транспорта | `https`, `websocket`, `websocket-lanes`, `https-lanes` |
| **Bind Address** | Адрес привязки | `127.0.0.1:8080` (по умолчанию) |
| **Hostname** | Домен для WEB Proxy | Ваш домен (например, `proxy.example.com`) |

#### 4️⃣ Управление секретами (Secrets Configuration)

Каждый пользователь должен иметь уникальный секрет:

```
┌──────────────┬────────────────────────┬─────────┐
│ Username     │ Secret (32 hex chars)   │ Actions │
├──────────────┼────────────────────────┼─────────┤
│ user1        │ a1b2c3d4e5f6...         │ [Delete]│
│ user2        │ f6e5d4c3b2a1...         │ [Delete]│
└──────────────┴────────────────────────┴─────────┘
```

**Генерация секрета:** Нажмите кнопку "Generate" для создания случайного 32-символьного hex секрета.

### Примеры подключения Telegram

#### MTProxy подключение:

```
Тип: MTProxy
Адрес: athlon.twilightparadox.com (или IP)
Порт: 443
Секрет: <ваш_секрет>
Режим шифрования: TLS / FakeTLS / Secure
```

#### WEB Proxy подключение:

```
Тип: HTTP/HTTPS Proxy
Адрес: https://athlon.twilightparadox.com
Порт: 80/443
Логин: <username>
Пароль: <secret>
```

---

## 🔧 Дополнительные скрипты

### Генерация секрета из командной строки

```bash
./scripts/generate-secret.sh
# Вывод: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4
```

### Установка на роутер (автоматизированная)

```bash
./scripts/install-on-router.sh <router_ip> <username> <password>
```

---

## 📊 Статистика и мониторинг

После запуска сервиса доступна страница статуса:

```
Система → telEgo → Статус
```

Отображается информация:
- ✅ **Service Status** — Состояние сервиса (Running/Stopped)
- 📈 **Active Connections** — Количество активных соединений
- 📊 **Total Traffic** — Общий трафик

---

## 🔐 Безопасность и рекомендации

### ⚠️ Важные замечания:

1. **Порт 443** — Рекомендуется использовать порт 443 для маскировки под HTTPS трафик
2. **DDNS** — Настройте DDNS для доступа по доменному имени
3. **Firewall** — Откройте необходимые порты в firewall роутера:
   ```bash
   uci add firewall zone_wan_mashup='packet_accept'
   uci set firewall.zone_wan_mashup_dest_port_1='443'
   uci commit firewall
   /etc/init.d/firewall restart
   ```
4. **Secrets** — Храните секреты в надёжном месте, они нужны для подключения клиентов

---

## 📚 Документация

| Документ | Описание |
|----------|----------|
| [API.md](docs/API.md) | Описание API и HTTP endpoints |
| [BUILD.md](docs/BUILD.md) | Подробная инструкция сборки |
| [CONFIGURATION.md](docs/CONFIGURATION.md) | Полное руководство настройки |
| [INSTALL.md](docs/INSTALL.md) | Инструкция установки пакетов |

---

## 🤝 Вклад в проект

Мы приветствуем pull requests! Пожалуйста:
1. Форкните репозиторий
2. Создайте ветку для фичи (`git checkout -b feature/amazing-feature`)
3. Закоммитьте изменения (`git commit -m 'Add amazing feature'`)
4. Отправьте в ветку (`git push origin feature/amazing-feature`)
5. Создайте Pull Request

---

## 📄 Лицензия

Этот проект распространяется под лицензией **MIT**. См. файл [LICENSE](LICENSE) для деталей.

---

## 🔗 Ссылки

- 🌐 **Официальный репозиторий:** https://github.com/Ra1nek/telEgo-openwrt
- 📱 **Telegram API Documentation:** https://core.telegram.org/meta
- 📖 **OpenWrt LuCI Docs:** https://openwrt.org/docs/guide-user/luci/luci.essentials
- 🔧 **Scratch-net/telego (исходный проект):** https://github.com/Scratch-net/telego

---

<div align="center">

**telEgo — Ваш Telegram Proxy на роутере OpenWrt** ⚡

*Создано с ❤️ для сообщества OpenWrt*

</div>