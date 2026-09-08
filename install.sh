#!/bin/sh
# telEgo OpenWrt installer/uninstaller
# BusyBox ash / POSIX sh compatible. No Bash or jq required.
set -eu

REPOSITORY='Ra1nek/telEgo-openwrt'
PRODUCT_VERSION='0.6.1'
RELEASE='develop-latest'
UI_LANG=''
WITH_RU='auto'
ASSUME_YES=0
ALLOW_UNTRUSTED=0
MODE='auto'
NO_COLOR=0

TTY=0
FETCHER=''
WORK_DIR=''
LOCAL_DIR=$(pwd)
CACHE_DIR=${TELEGO_CACHE_DIR:-/tmp/telego}
CONFIG_BACKUP=''
RESTORE_CONFIG=0
WAS_RUNNING=0
ACTION=''

SEL_CORE=0
SEL_LUCI=0
SEL_NGINX=0
SEL_RU=0
REM_CORE=0
REM_LUCI=0
REM_NGINX=0
REM_RU=0

INST_CORE=0
INST_LUCI=0
INST_NGINX=0
INST_RU=0

APK_FILES=''
BASE_URL=''

RED=''
GREEN=''
YELLOW=''
BLUE=''
CYAN=''
BOLD=''
RESET=''

text() {
    if [ "$UI_LANG" = 'ru' ]; then
        printf '%s' "$1"
    else
        printf '%s' "$2"
    fi
}

init_tty() {
    if [ "$ASSUME_YES" -eq 0 ]; then
        if [ -t 0 ]; then
            exec 3<&0
            TTY=1
        elif ( : </dev/tty ) 2>/dev/null; then
            exec 3</dev/tty
            TTY=1
        fi
    fi
}

init_colors() {
    [ "$NO_COLOR" -eq 0 ] || return 0
    [ -t 1 ] || return 0
    esc=$(printf '\033')
    RED="${esc}[31m"
    GREEN="${esc}[32m"
    YELLOW="${esc}[33m"
    BLUE="${esc}[34m"
    CYAN="${esc}[36m"
    BOLD="${esc}[1m"
    RESET="${esc}[0m"
}

status_line() {
    marker=$1
    color=$2
    shift 2
    printf '%s%s[%-6s]%s %s\n' "$BOLD" "$color" "$marker" "$RESET" "$*"
}

status_ok() { status_line '  OK  ' "$GREEN" "$(text "$1" "$2")"; }
status_info() { status_line ' INFO ' "$CYAN" "$(text "$1" "$2")"; }
status_warn() { status_line ' WARN ' "$YELLOW" "$(text "$1" "$2")" >&2; }
fail() { status_line ' FAIL ' "$RED" "$(text "$1" "$2")" >&2; exit 1; }

section() {
    title=$1
    printf '\n%s%s+------------------------------------------------------------+%s\n' "$BOLD" "$BLUE" "$RESET"
    printf '%s%s| %-58s |%s\n' "$BOLD" "$BLUE" "$title" "$RESET"
    printf '%s%s+------------------------------------------------------------+%s\n' "$BOLD" "$BLUE" "$RESET"
}

progress_bar() {
    percent=$1
    label=$2
    if [ -t 1 ] && [ "$NO_COLOR" -eq 0 ]; then
        width=24
        filled=$((percent * width / 100))
        empty=$((width - filled))
        bar=''
        i=0
        while [ "$i" -lt "$filled" ]; do bar="${bar}#"; i=$((i + 1)); done
        i=0
        while [ "$i" -lt "$empty" ]; do bar="${bar}-"; i=$((i + 1)); done
        printf '\r%s%s[%s]%s %3s%%  %-28s' "$BOLD" "$CYAN" "$bar" "$RESET" "$percent" "$label"
        [ "$percent" -lt 100 ] || printf '\n'
    else
        status_info "$label" "$label"
    fi
}

print_banner() {
    printf '\n%s%s' "$BOLD" "$CYAN"
    cat <<'BANNER'
 _       _ _____
| |_ ___| | ____|__ _  ___
| __/ _ \ |  _| / _` |/ _ \
| ||  __/ | |__| (_| | (_) |
 \__\___|_|_____\__, |\___/
                |___/
BANNER
    printf '%s' "$RESET"
    printf '%s%s  telEgo OpenWrt v%s%s\n' "$BOLD" "$BLUE" "$PRODUCT_VERSION" "$RESET"
    printf '  %s\n' "$(text 'MTProxy / WEB Proxy / LuCI для OpenWrt 25.12.x x86_64' 'MTProxy / WEB Proxy / LuCI for OpenWrt 25.12.x x86_64')"
    printf '  %s\n\n' "$(text 'Канал по умолчанию: develop-latest' 'Default channel: develop-latest')"
}

usage() {
    cat <<'HELP'
telEgo OpenWrt installer / uninstaller
Usage: sh install.sh [options]

  --lang ru|en         Interface language
  --ru                 Include Russian LuCI translation
  --no-ru              Exclude Russian LuCI translation
  --release TAG        Release asset set; default: develop-latest
  --allow-untrusted    Explicitly allow APKs without a trusted signing key
  --uninstall          Enter uninstall mode
  --yes                Noninteractive mode
  --no-color           Disable ANSI colors
  -h, --help           Show help

The default source is the develop-latest preview published from branch develop.
HELP
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --lang|--release)
            [ "$#" -ge 2 ] || { usage >&2; exit 2; }
            case "$1" in
                --lang) UI_LANG=$2 ;;
                --release) RELEASE=$2 ;;
            esac
            shift
            ;;
        --ru) WITH_RU=1 ;;
        --no-ru) WITH_RU=0 ;;
        --allow-untrusted) ALLOW_UNTRUSTED=1 ;;
        --uninstall) MODE='uninstall' ;;
        --yes) ASSUME_YES=1 ;;
        --no-color) NO_COLOR=1 ;;
        -h|--help) usage; exit 0 ;;
        *) usage >&2; exit 2 ;;
    esac
    shift
done

case "$UI_LANG" in ''|ru|en) ;; *) usage >&2; exit 2 ;; esac
case "$RELEASE" in ''|*[!A-Za-z0-9._-]*) usage >&2; exit 2 ;; esac

init_tty
init_colors

ask() {
    [ "$TTY" -eq 1 ] || fail 'Нужен интерактивный терминал или параметр --yes.' 'An interactive terminal or --yes is required.'
    prompt=$(text "$1" "$2")
    printf '%s%s%s ' "$BOLD" "$prompt" "$RESET"
    IFS= read -r REPLY <&3 || exit 1
}

is_yes() {
    case "$1" in y|Y|yes|YES|Yes|д|Д|да|ДА|Да) return 0 ;; *) return 1 ;; esac
}

choose_language() {
    [ -z "$UI_LANG" ] || return 0
    if [ "$TTY" -eq 1 ]; then
        printf '1) Русский\n2) English\n> '
        IFS= read -r REPLY <&3 || exit 1
        case "$REPLY" in 1|'') UI_LANG='ru' ;; 2) UI_LANG='en' ;; *) exit 2 ;; esac
    else
        UI_LANG='en'
    fi
}

choose_ru_preference() {
    [ "$WITH_RU" = 'auto' ] || return 0
    if [ "$TTY" -eq 1 ]; then
        ask 'Установить русский перевод LuCI? [1 — да, 2 — нет; Enter — по языку интерфейса]' 'Install the Russian LuCI translation? [1 = yes, 2 = no; Enter = follow UI language]'
        case "$REPLY" in
            1) WITH_RU=1 ;;
            2) WITH_RU=0 ;;
            '') if [ "$UI_LANG" = 'ru' ]; then WITH_RU=1; else WITH_RU=0; fi ;;
            *) fail 'Некорректный выбор.' 'Invalid selection.' ;;
        esac
    else
        if [ "$UI_LANG" = 'ru' ]; then WITH_RU=1; else WITH_RU=0; fi
    fi
}

check_env() {
    section "$(text 'Проверка окружения' 'Environment pre-flight')"
    [ "$(id -u)" = 0 ] || fail 'Запустите скрипт от root на роутере.' 'Run this script as root on the router.'
    [ -r /etc/openwrt_release ] || fail 'Не обнаружен /etc/openwrt_release. Требуется OpenWrt.' '/etc/openwrt_release was not found. OpenWrt is required.'
    firmware=$(sed -n "s/^DISTRIB_RELEASE='\([^']*\)'/\1/p" /etc/openwrt_release)
    case "$firmware" in
        25.12.*) status_ok "OpenWrt $firmware" "OpenWrt $firmware" ;;
        *) fail "Поддерживается OpenWrt 25.12.x; обнаружено: ${firmware:-unknown}" "OpenWrt 25.12.x is required; found: ${firmware:-unknown}" ;;
    esac
    arch=$(uname -m)
    [ "$arch" = 'x86_64' ] || fail "Эта сборка предназначена для x86_64; обнаружено: $arch" "This build supports x86_64 only; found: $arch"
    status_ok 'Архитектура x86_64' 'Architecture x86_64'
    for tool in apk sha256sum awk mktemp grep sed df cp rm mkdir chmod mv; do
        command -v "$tool" >/dev/null 2>&1 || fail "Не найдена обязательная команда: $tool" "Required command is missing: $tool"
    done
    status_ok 'Нативный apk и базовые утилиты доступны' 'Native apk and required base tools are available'
    if command -v uclient-fetch >/dev/null 2>&1; then FETCHER='uclient-fetch'
    elif command -v wget >/dev/null 2>&1; then FETCHER='wget'
    elif command -v curl >/dev/null 2>&1; then FETCHER='curl'
    else fail 'Нужен uclient-fetch, wget или curl.' 'uclient-fetch, wget, or curl is required.'
    fi
    status_ok "Загрузчик: $FETCHER" "Downloader: $FETCHER"
}

check_space() {
    for mount in /tmp /; do
        available=$(df -Pk "$mount" | awk 'NR==2 {print $4}')
        case "$available" in ''|*[!0-9]*) fail "Не удалось определить свободное место на $mount." "Could not determine free space on $mount." ;; esac
        [ "$available" -ge 32768 ] || fail "На $mount требуется не менее 32 МиБ свободного места." "At least 32 MiB of free space is required on $mount."
    done
    status_ok 'Свободного места достаточно' 'Free-space check passed'
}

fetch() {
    case "$FETCHER" in
        curl) curl --fail --location --connect-timeout 15 --max-time 300 --output "$2" "$1" ;;
        *) "$FETCHER" -T 30 -O "$2" "$1" ;;
    esac
}

apk_installed() {
    package=$1
    installed=$(apk info -e "$package" 2>/dev/null || true)
    printf '%s\n' "$installed" | grep -Fx "$package" >/dev/null 2>&1
}

detect_installed_components() {
    apk_installed telego-pkg && INST_CORE=1 || INST_CORE=0
    apk_installed luci-app-telego && INST_LUCI=1 || INST_LUCI=0
    apk_installed nginx-telego && INST_NGINX=1 || INST_NGINX=0
    apk_installed luci-i18n-telego-ru && INST_RU=1 || INST_RU=0
}

have_any_installed() { [ $((INST_CORE + INST_LUCI + INST_NGINX + INST_RU)) -gt 0 ]; }

print_installed_components() {
    section "$(text 'Установленные компоненты' 'Installed components')"
    if [ "$INST_CORE" -eq 1 ]; then status_ok 'telego-pkg — ядро' 'telego-pkg — core'; else status_info 'telego-pkg — не установлен' 'telego-pkg — not installed'; fi
    if [ "$INST_LUCI" -eq 1 ]; then status_ok 'luci-app-telego — LuCI' 'luci-app-telego — LuCI'; else status_info 'luci-app-telego — не установлен' 'luci-app-telego — not installed'; fi
    if [ "$INST_NGINX" -eq 1 ]; then status_ok 'nginx-telego — WEB/Nginx' 'nginx-telego — WEB/Nginx'; else status_info 'nginx-telego — не установлен' 'nginx-telego — not installed'; fi
    if [ "$INST_RU" -eq 1 ]; then status_ok 'luci-i18n-telego-ru — русский перевод' 'luci-i18n-telego-ru — Russian translation'; else status_info 'luci-i18n-telego-ru — не установлен' 'luci-i18n-telego-ru — not installed'; fi
}

selection_all() {
    SEL_CORE=1
    SEL_LUCI=1
    SEL_NGINX=1
    if [ "$WITH_RU" = 1 ]; then SEL_RU=1; else SEL_RU=0; fi
}

ensure_install_dependencies() {
    [ "$SEL_RU" -eq 0 ] || SEL_LUCI=1
    [ "$SEL_LUCI" -eq 0 ] || SEL_CORE=1
    [ "$SEL_NGINX" -eq 0 ] || SEL_CORE=1
}

selection_from_installed() {
    SEL_CORE=$INST_CORE
    SEL_LUCI=$INST_LUCI
    SEL_NGINX=$INST_NGINX
    SEL_RU=$INST_RU
    case "$WITH_RU" in 1) SEL_RU=1 ;; 0) SEL_RU=0 ;; esac
    ensure_install_dependencies
}

checkbox() { if [ "$1" -eq 1 ]; then printf '[x]'; else printf '[ ]'; fi; }

print_dependency_graph() {
    printf '\n%s\n' "$(text 'Зависимости проекта:' 'Project dependency graph:')"
    printf '  luci-i18n-telego-ru -> luci-app-telego -> telego-pkg\n'
    printf '  nginx-telego         -> telego-pkg + nginx-ssl\n'
}

print_install_selection() {
    section "$(text 'Компоненты для установки / обновления' 'Install / update components')"
    printf '  1) %s %-24s %s\n' "$(checkbox "$SEL_CORE")" 'telego-pkg' "$(text 'ядро' 'core')"
    printf '  2) %s %-24s %s\n' "$(checkbox "$SEL_LUCI")" 'luci-app-telego' 'LuCI'
    printf '  3) %s %-24s %s\n' "$(checkbox "$SEL_NGINX")" 'nginx-telego' "$(text 'WEB/Nginx-слой' 'WEB/Nginx layer')"
    printf '  4) %s %-24s %s\n' "$(checkbox "$SEL_RU")" 'luci-i18n-telego-ru' "$(text 'русский перевод' 'Russian translation')"
    print_dependency_graph
    printf '\n  a) %s\n' "$(text 'выбрать всё' 'select all')"
    printf '  n) %s\n' "$(text 'только ядро' 'core only')"
    printf '  c) %s\n' "$(text 'продолжить' 'continue')"
    printf '  q) %s\n' "$(text 'выход' 'quit')"
}

menu_install() {
    if [ "$ASSUME_YES" -eq 1 ]; then selection_all; return 0; fi
    while :; do
        ensure_install_dependencies
        print_install_selection
        ask 'Введите номер для переключения компонента, a/n/c/q [c]:' 'Toggle a component by number, or choose a/n/c/q [c]:'
        case "$REPLY" in
            1)
                if [ "$SEL_CORE" -eq 1 ]; then
                    if [ "$SEL_LUCI" -eq 1 ] || [ "$SEL_NGINX" -eq 1 ] || [ "$SEL_RU" -eq 1 ]; then
                        status_warn 'Отключение ядра также снимет LuCI, Nginx-слой и перевод.' 'Disabling the core also deselects LuCI, the Nginx layer, and translation.'
                    fi
                    SEL_CORE=0; SEL_LUCI=0; SEL_NGINX=0; SEL_RU=0
                else SEL_CORE=1
                fi
                ;;
            2)
                if [ "$SEL_LUCI" -eq 1 ]; then SEL_LUCI=0; SEL_RU=0
                else SEL_LUCI=1; SEL_CORE=1; status_info 'Автоматически добавлено ядро telego-pkg.' 'telego-pkg core was added automatically.'
                fi
                ;;
            3)
                if [ "$SEL_NGINX" -eq 1 ]; then SEL_NGINX=0
                else SEL_NGINX=1; SEL_CORE=1; status_info 'Автоматически добавлены telego-pkg; nginx-ssl будет разрешён через apk.' 'telego-pkg was added automatically; nginx-ssl will be resolved by apk.'
                fi
                ;;
            4)
                if [ "$SEL_RU" -eq 1 ]; then SEL_RU=0
                else SEL_RU=1; SEL_LUCI=1; SEL_CORE=1; status_info 'Для перевода автоматически добавлены LuCI и ядро.' 'LuCI and the core were added automatically for the translation.'
                fi
                ;;
            a|A) SEL_CORE=1; SEL_LUCI=1; SEL_NGINX=1; SEL_RU=1 ;;
            n|N) SEL_CORE=1; SEL_LUCI=0; SEL_NGINX=0; SEL_RU=0 ;;
            c|C|''|y|Y|yes|YES|д|Д|да|Да)
                ensure_install_dependencies
                [ $((SEL_CORE + SEL_LUCI + SEL_NGINX + SEL_RU)) -gt 0 ] || { status_warn 'Не выбран ни один компонент.' 'No component is selected.'; continue; }
                return 0
                ;;
            q|Q|0) status_info 'Операция отменена.' 'Operation cancelled.'; exit 0 ;;
            *) status_warn 'Неизвестная команда меню.' 'Unknown menu command.' ;;
        esac
    done
}

select_removal_dependencies() {
    changed=0
    if [ "$REM_CORE" -eq 1 ]; then
        if [ "$INST_LUCI" -eq 1 ] && [ "$REM_LUCI" -eq 0 ]; then REM_LUCI=1; changed=1; fi
        if [ "$INST_NGINX" -eq 1 ] && [ "$REM_NGINX" -eq 0 ]; then REM_NGINX=1; changed=1; fi
        if [ "$INST_RU" -eq 1 ] && [ "$REM_RU" -eq 0 ]; then REM_RU=1; changed=1; fi
    fi
    if [ "$REM_LUCI" -eq 1 ] && [ "$INST_RU" -eq 1 ] && [ "$REM_RU" -eq 0 ]; then REM_RU=1; changed=1; fi
    [ "$changed" -eq 0 ] || status_warn 'Добавлены зависимые компоненты: после удаления выбранной основы они не должны оставаться установленными.' 'Dependent components were added because they must not remain installed after removing their base package.'
}

print_uninstall_selection() {
    section "$(text 'Удаление компонентов' 'Remove components')"
    printf '  1) %s %-24s %s\n' "$(checkbox "$REM_CORE")" 'telego-pkg' "$(text 'ядро' 'core')"
    printf '  2) %s %-24s %s\n' "$(checkbox "$REM_LUCI")" 'luci-app-telego' 'LuCI'
    printf '  3) %s %-24s %s\n' "$(checkbox "$REM_NGINX")" 'nginx-telego' "$(text 'WEB/Nginx-слой' 'WEB/Nginx layer')"
    printf '  4) %s %-24s %s\n' "$(checkbox "$REM_RU")" 'luci-i18n-telego-ru' "$(text 'русский перевод' 'Russian translation')"
    printf '\n  a) %s\n' "$(text 'выбрать все установленные компоненты' 'select all installed components')"
    printf '  c) %s\n' "$(text 'продолжить' 'continue')"
    printf '  q) %s\n' "$(text 'отмена' 'cancel')"
}

menu_uninstall() {
    detect_installed_components
    have_any_installed || { status_info 'Компоненты telEgo не установлены.' 'No telEgo components are installed.'; exit 0; }
    if [ "$ASSUME_YES" -eq 1 ]; then
        REM_CORE=$INST_CORE; REM_LUCI=$INST_LUCI; REM_NGINX=$INST_NGINX; REM_RU=$INST_RU
        select_removal_dependencies
        return 0
    fi
    REM_CORE=0; REM_LUCI=0; REM_NGINX=0; REM_RU=0
    while :; do
        select_removal_dependencies
        print_uninstall_selection
        ask 'Введите номер для переключения компонента, a/c/q:' 'Toggle a component by number, or choose a/c/q:'
        case "$REPLY" in
            1)
                [ "$INST_CORE" -eq 1 ] || { status_warn 'Ядро не установлено.' 'Core is not installed.'; continue; }
                if [ "$REM_CORE" -eq 1 ]; then REM_CORE=0
                else REM_CORE=1; status_warn 'Удаление telego-pkg требует удаления установленных LuCI/Nginx-компонентов, зависящих от ядра.' 'Removing telego-pkg requires removal of installed LuCI/Nginx components that depend on the core.'
                fi
                ;;
            2)
                [ "$INST_LUCI" -eq 1 ] || { status_warn 'LuCI-модуль не установлен.' 'LuCI module is not installed.'; continue; }
                if [ "$REM_LUCI" -eq 1 ]; then REM_LUCI=0; else REM_LUCI=1; fi
                ;;
            3)
                [ "$INST_NGINX" -eq 1 ] || { status_warn 'Nginx-модуль не установлен.' 'Nginx module is not installed.'; continue; }
                if [ "$REM_NGINX" -eq 1 ]; then REM_NGINX=0; else REM_NGINX=1; fi
                ;;
            4)
                [ "$INST_RU" -eq 1 ] || { status_warn 'Русский перевод не установлен.' 'Russian translation is not installed.'; continue; }
                if [ "$REM_RU" -eq 1 ]; then REM_RU=0; else REM_RU=1; fi
                ;;
            a|A) REM_CORE=$INST_CORE; REM_LUCI=$INST_LUCI; REM_NGINX=$INST_NGINX; REM_RU=$INST_RU ;;
            c|C|'')
                select_removal_dependencies
                [ $((REM_CORE + REM_LUCI + REM_NGINX + REM_RU)) -gt 0 ] || { status_warn 'Не выбран ни один компонент для удаления.' 'No component is selected for removal.'; continue; }
                ask 'Удалить выбранные компоненты? Конфигурация пользователя будет сохранена. [y/N]' 'Remove the selected components? User configuration will be preserved. [y/N]'
                is_yes "$REPLY" && return 0
                ;;
            q|Q|0) status_info 'Удаление отменено.' 'Uninstall cancelled.'; exit 0 ;;
            *) status_warn 'Неизвестная команда меню.' 'Unknown menu command.' ;;
        esac
    done
}

choose_existing_action() {
    print_installed_components
    if [ "$MODE" = 'uninstall' ]; then ACTION='uninstall'; return 0; fi
    if [ "$MODE" = 'install' ] || [ "$ASSUME_YES" -eq 1 ]; then ACTION='install'; selection_all; return 0; fi
    section "$(text 'Выберите действие' 'Choose an action')"
    printf '  1) %s\n' "$(text 'Полное обновление установленного набора' 'Update the installed component set')"
    printf '  2) %s\n' "$(text 'Точечное / полное удаление компонентов' 'Selective / complete component removal')"
    printf '  3) %s\n' "$(text 'Изменить состав и установить / обновить компоненты' 'Change component set and install / update')"
    printf '  0) %s\n' "$(text 'Выход' 'Exit')"
    ask 'Выбор [1]:' 'Choice [1]:'
    case "$REPLY" in
        1|'') ACTION='install'; selection_from_installed ;;
        2) ACTION='uninstall' ;;
        3) ACTION='install'; selection_from_installed; menu_install ;;
        0|q|Q) exit 0 ;;
        *) fail 'Некорректный выбор.' 'Invalid selection.' ;;
    esac
}

prepare_workspace() {
    umask 077
    WORK_DIR=$(mktemp -d /tmp/telego-install.XXXXXXXX)
    trap cleanup EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    if [ "$RELEASE" = 'latest' ]; then BASE_URL="https://github.com/$REPOSITORY/releases/latest/download"
    else BASE_URL="https://github.com/$REPOSITORY/releases/download/$RELEASE"
    fi
}

cleanup() {
    if [ "$RESTORE_CONFIG" -eq 1 ] && [ -n "$CONFIG_BACKUP" ]; then
        cp -p "$CONFIG_BACKUP" /etc/config/telego || status_warn "Не удалось восстановить конфигурацию. Резервная копия: $CONFIG_BACKUP" "Could not restore configuration. Backup: $CONFIG_BACKUP"
    fi
    [ -z "$WORK_DIR" ] || rm -rf -- "$WORK_DIR"
}

ensure_trust_policy() {
    if [ "$RELEASE" = 'develop-latest' ] && [ "$ALLOW_UNTRUSTED" -eq 0 ]; then
        if [ "$ASSUME_YES" -eq 1 ]; then fail 'Для develop-latest требуется явный параметр --allow-untrusted.' 'develop-latest requires explicit --allow-untrusted.'; fi
        ask 'Develop preview может не иметь доверенного ключа APK. Разрешить установку с --allow-untrusted? [y/N]' 'The develop preview may not have a trusted APK key. Allow installation with --allow-untrusted? [y/N]'
        is_yes "$REPLY" || fail 'Установка отменена: доверие к preview-пакетам не подтверждено.' 'Installation cancelled: preview package trust was not accepted.'
        ALLOW_UNTRUSTED=1
    fi
    [ "$ALLOW_UNTRUSTED" -eq 0 ] || status_warn 'Проверка доверия к подписи APK отключена; SHA-256 по-прежнему проверяет целостность файлов.' 'APK signature trust is bypassed; SHA-256 still verifies file integrity.'
}

manifest_entry() {
    package=$1
    awk -v package="$package" '
        { sub(/\r$/, "") }
        NF == 2 && length($1) == 64 && $1 !~ /[^0-9a-f]/ &&
        $2 ~ ("^" package "-[0-9][A-Za-z0-9.+_~-]*[.]apk$") { print $1 "  " $2 }
    ' "$WORK_DIR/manifest"
}

selected_package_names() {
    names=''
    [ "$SEL_CORE" -eq 0 ] || names="$names telego-pkg"
    [ "$SEL_LUCI" -eq 0 ] || names="$names luci-app-telego"
    [ "$SEL_NGINX" -eq 0 ] || names="$names nginx-telego"
    [ "$SEL_RU" -eq 0 ] || names="$names luci-i18n-telego-ru"
    printf '%s\n' "$names"
}

inspect_stale_local_files() {
    package=$1
    expected_filename=$2
    for dir in "$LOCAL_DIR" "$CACHE_DIR"; do
        [ -d "$dir" ] || continue
        if [ "$dir" = "$CACHE_DIR" ] && [ "$CACHE_DIR" = "$LOCAL_DIR" ]; then continue; fi
        for candidate in "$dir"/"$package"-*.apk; do
            [ -f "$candidate" ] || continue
            name=${candidate##*/}
            [ "$name" = "$expected_filename" ] && continue
            hash=$(sha256sum "$candidate" | awk '{print $1}')
            status_warn "Найден устаревший локальный APK: $candidate (SHA-256 $hash). Он не входит в текущий manifest и будет проигнорирован." "Stale local APK found: $candidate (SHA-256 $hash). It is not in the current manifest and will be ignored."
        done
    done
}

download_and_verify() {
    url=$1
    destination=$2
    expected=$3
    temporary="${destination}.part"
    rm -f -- "$temporary"
    fetch "$url" "$temporary" || fail "Не удалось загрузить ${url##*/}." "Failed to download ${url##*/}."
    actual=$(sha256sum "$temporary" | awk '{print $1}')
    [ "$actual" = "$expected" ] || { rm -f -- "$temporary"; fail "SHA-256 загруженного файла ${url##*/} не совпадает с manifest." "SHA-256 for downloaded ${url##*/} does not match the manifest."; }
    mv -f "$temporary" "$destination"
}

inspect_local_files() {
    section "$(text 'Проверка локальных APK' 'Local APK inspection')"
    fetch "$BASE_URL/telego-install.sha256" "$WORK_DIR/manifest" || fail 'Не удалось получить telego-install.sha256. Проверьте DNS, время, HTTPS и выбранный release.' 'Could not fetch telego-install.sha256. Check DNS, clock, HTTPS, and the selected release.'
    status_ok 'Получен актуальный manifest SHA-256' 'Current SHA-256 manifest downloaded'
    APK_FILES=''
    : > "$WORK_DIR/selected.sha256"
    packages=$(selected_package_names)
    total=0
    for package in $packages; do total=$((total + 1)); done
    current=0
    for package in $packages; do
        current=$((current + 1))
        entries=$(manifest_entry "$package")
        count=$(printf '%s\n' "$entries" | awk 'NF {n++} END {print n+0}')
        if [ "$count" -eq 0 ]; then fail "В release отсутствует пакет $package." "Release is missing package $package."
        elif [ "$count" -ne 1 ]; then fail "Manifest содержит несколько версий $package." "Manifest contains multiple versions of $package."
        fi
        expected=$(printf '%s\n' "$entries" | awk 'NR==1 {print $1}')
        filename=$(printf '%s\n' "$entries" | awk 'NR==1 {print $2}')
        inspect_stale_local_files "$package" "$filename"
        candidate=''
        if [ -f "$LOCAL_DIR/$filename" ]; then candidate="$LOCAL_DIR/$filename"
        elif [ -f "$CACHE_DIR/$filename" ]; then candidate="$CACHE_DIR/$filename"
        fi
        destination="$WORK_DIR/$filename"
        if [ -n "$candidate" ]; then
            actual=$(sha256sum "$candidate" | awk '{print $1}')
            if [ "$actual" = "$expected" ]; then
                status_ok "Локальный $filename совпадает с manifest; повторная загрузка не требуется." "Local $filename matches the manifest; download skipped."
                cp -f "$candidate" "$destination"
            else
                status_warn "SHA-256 локального $filename не совпадает с manifest. Файл будет заменён свежей копией." "Local $filename SHA-256 does not match the manifest. It will be replaced with a fresh copy."
                download_and_verify "$BASE_URL/$filename" "$destination" "$expected"
                if cp -f "$destination" "$candidate" 2>/dev/null; then status_ok "Локальная копия обновлена: $candidate" "Local copy refreshed: $candidate"
                else status_warn "Не удалось перезаписать $candidate; для установки будет использована проверенная временная копия." "Could not overwrite $candidate; the verified temporary copy will be used for installation."
                fi
            fi
        else
            status_info "Локальная копия $filename не найдена; загружаю из $RELEASE." "Local $filename was not found; downloading from $RELEASE."
            download_and_verify "$BASE_URL/$filename" "$destination" "$expected"
        fi
        printf '%s  %s\n' "$expected" "$filename" >> "$WORK_DIR/selected.sha256"
        APK_FILES="$APK_FILES ./$filename"
        percent=$((15 + current * 35 / total))
        progress_bar "$percent" "$(text "Проверено: $package" "Verified: $package")"
    done
    ( cd "$WORK_DIR"; sha256sum -c selected.sha256 >/dev/null ) || fail 'Итоговая проверка SHA-256 не пройдена.' 'Final SHA-256 verification failed.'
    status_ok 'Все выбранные APK прошли проверку SHA-256' 'All selected APKs passed SHA-256 verification'
}

backup_configuration() {
    [ "$SEL_CORE" -eq 1 ] || return 0
    [ -f /etc/config/telego ] || return 0
    mkdir -p /etc/telego-backups
    chmod 0700 /etc/telego-backups
    backup_dir=$(mktemp -d /etc/telego-backups/install.XXXXXXXX)
    CONFIG_BACKUP="$backup_dir/telego"
    cp -p /etc/config/telego "$CONFIG_BACKUP"
    RESTORE_CONFIG=1
    status_info "Резервная копия конфигурации: $CONFIG_BACKUP" "Configuration backup: $CONFIG_BACKUP"
}

apply_install() {
    section "$(text 'Установка / обновление' 'Install / update')"
    progress_bar 55 "$(text 'Обновление индекса apk' 'Refreshing apk indexes')"
    apk update
    cd "$WORK_DIR"
    set -- $APK_FILES
    if [ "$SEL_NGINX" -eq 1 ]; then DEPENDENCIES='nginx-ssl'; else DEPENDENCIES=''; fi
    progress_bar 65 "$(text 'Проверка зависимостей и транзакции' 'Simulating dependency transaction')"
    if [ "$ALLOW_UNTRUSTED" -eq 1 ]; then apk add --simulate --allow-untrusted $DEPENDENCIES "$@"; else apk add --simulate $DEPENDENCIES "$@"; fi
    status_ok 'Предварительная проверка apk завершена' 'apk transaction simulation passed'
    if [ -x /etc/init.d/telego ] && /etc/init.d/telego running >/dev/null 2>&1; then WAS_RUNNING=1; fi
    backup_configuration
    progress_bar 80 "$(text 'Применение APK-транзакции' 'Applying APK transaction')"
    if [ "$ALLOW_UNTRUSTED" -eq 1 ]; then apk add --allow-untrusted $DEPENDENCIES "$@"; else apk add $DEPENDENCIES "$@"; fi
    if [ "$RESTORE_CONFIG" -eq 1 ]; then cp -p "$CONFIG_BACKUP" /etc/config/telego; RESTORE_CONFIG=0; status_ok 'Пользовательская конфигурация сохранена' 'User configuration preserved'; fi
    progress_bar 92 "$(text 'Обновление интеграции LuCI' 'Refreshing LuCI integration')"
    if [ "$SEL_LUCI" -eq 1 ] || [ "$SEL_RU" -eq 1 ]; then /etc/init.d/rpcd restart; fi
    if [ "$WAS_RUNNING" -eq 1 ] && [ -x /etc/init.d/telego ]; then /etc/init.d/telego restart; status_ok 'Работавшая служба telEgo перезапущена' 'Previously running telEgo service restarted'; fi
    progress_bar 100 "$(text 'Готово' 'Complete')"
    status_ok 'Установка завершена.' 'Installation complete.'
    status_info 'Параметры WAN/firewall автоматически не изменялись; новый proxy не включается без настройки пользователя.' 'WAN/firewall settings were not changed automatically; a new proxy is not enabled without user configuration.'
    printf '%s\n' "$(text 'LuCI: Службы -> telEgo' 'LuCI: Services -> telEgo')"
    if [ "$UI_LANG" = ru ]; then guide='INSTALL.md'; else guide='INSTALL_EN.md'; fi
    printf 'Guide: https://github.com/%s/blob/develop/docs/%s\n' "$REPOSITORY" "$guide"
    printf 'Checks: ubus call telego status; logread -e telego\n'
}

apply_uninstall() {
    section "$(text 'Удаление' 'Uninstall')"
    packages=''
    [ "$REM_RU" -eq 0 ] || packages="$packages luci-i18n-telego-ru"
    [ "$REM_LUCI" -eq 0 ] || packages="$packages luci-app-telego"
    [ "$REM_NGINX" -eq 0 ] || packages="$packages nginx-telego"
    [ "$REM_CORE" -eq 0 ] || packages="$packages telego-pkg"
    [ -n "$packages" ] || fail 'Не выбраны пакеты для удаления.' 'No packages selected for removal.'
    progress_bar 35 "$(text 'Проверка удаления через apk' 'Simulating apk removal')"
    apk del --simulate $packages
    progress_bar 70 "$(text 'Удаление выбранных компонентов' 'Removing selected components')"
    apk del $packages
    if [ "$REM_LUCI" -eq 1 ] || [ "$REM_RU" -eq 1 ]; then /etc/init.d/rpcd restart; fi
    progress_bar 100 "$(text 'Удаление завершено' 'Uninstall complete')"
    status_ok 'Выбранные компоненты удалены.' 'Selected components removed.'
    status_info 'Пользовательские файлы конфигурации и резервные копии не удалялись.' 'User configuration files and backups were preserved.'
    [ "$REM_NGINX" -eq 0 ] || status_info 'nginx-ssl не удалялся автоматически: он может использоваться другими службами.' 'nginx-ssl was not removed automatically because other services may use it.'
}

apply_changes() {
    if [ "$ACTION" = 'uninstall' ]; then apply_uninstall; else apply_install; fi
}

main() {
    choose_language
    print_banner
    check_env
    detect_installed_components
    if [ "$MODE" = 'uninstall' ]; then ACTION='uninstall'; menu_uninstall; apply_changes; return 0; fi
    if have_any_installed; then
        choose_existing_action
        if [ "$ACTION" = 'uninstall' ]; then menu_uninstall; apply_changes; return 0; fi
        if [ "$ASSUME_YES" -eq 1 ]; then selection_all
        elif [ "$ACTION" = 'install' ] && [ $((SEL_CORE + SEL_LUCI + SEL_NGINX + SEL_RU)) -eq 0 ]; then selection_from_installed
        fi
    else
        ACTION='install'
        choose_ru_preference
        selection_all
        menu_install
    fi
    ensure_install_dependencies
    check_space
    ensure_trust_policy
    prepare_workspace
    inspect_local_files
    apply_changes
}

main "$@"
