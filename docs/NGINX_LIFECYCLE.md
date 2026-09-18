# Жизненный цикл чужих файлов Nginx

[**Русский**](NGINX_LIFECYCLE.md) · [English](NGINX_LIFECYCLE_EN.md)

Жизненный цикл administrator-owned/foreign файлов Nginx включает две дополнительные явные операции: **создание** нового `*.conf` и **переименование** существующего активного foreign-файла. Исторически они добавлены на этапе P10 поверх P8/P9.

Эти операции не меняют ownership model P6/P7/P8/P9. Созданный или переименованный файл остаётся чужим/принадлежащим администратору и не добавляется в `ownership.tsv`.

## Scope

Lifecycle helper работает только с direct-child файлами:

```text
/etc/nginx/conf.d/NAME.conf
```

Имя обязано соответствовать allowlist безопасных `*.conf` names и не может содержать path traversal или произвольный absolute path.

Lifecycle helper не создаёт каталоги, snippets или файлы вне `/etc/nginx/conf.d/`. Quarantined files не переименовываются через lifecycle helper.

## Create

Backend primitive:

```sh
/usr/libexec/nginx-telego-editor create NAME.conf
```

Новое содержимое передаётся через **stdin** и ограничено 64 KiB.

Create разрешён только если одновременно выполняются условия:

- `NAME.conf` имеет безопасное имя;
- target отсутствует и не является symlink/non-regular object;
- target не зарегистрирован как package-owned/generated managed path;
- имя не пытается занять managed namespace telEgo.

Write path:

```text
shared kernel flock
 ↓
name / ownership / target preflight
 ↓
read stdin with 64 KiB bound
 ↓
stage new file in conf.d
 ↓
re-check target
 ↓
activate new file
 ↓
nginx -t
 ↓
reload if Nginx is running
 ↓
commit
```

Созданный файл получает mode `0644`. При failure `nginx -t` или reload новый файл удаляется и active Nginx tree возвращается к состоянию до операции.

## Rename

Backend primitives:

```sh
/usr/libexec/nginx-telego-editor revision NAME.conf
/usr/libexec/nginx-telego-editor rename OLD.conf NEW.conf EXPECTED_SHA256
```

`revision` валидирует active foreign source и возвращает только SHA-256 текущих bytes. В отличие от P9 `inspect`, он не читает content и поэтому не накладывает editor-limit 64 KiB на rename.

Source обязан быть существующим active foreign-файлом. Это включает occupant reserved generated path `80/85` только когда P6 inventory явно классифицирует его как `foreign`.

Rename разрешён только если:

- source и destination — безопасные direct-child `*.conf` names;
- `OLD.conf != NEW.conf`;
- source является active foreign regular file;
- destination отсутствует;
- destination не принадлежит managed namespace telEgo;
- `EXPECTED_SHA256` совпадает с текущими bytes source.

SHA-256 revision защищает от обычного lost update: если файл изменился после открытия rename modal, операция отклоняется как `stale-content`.

Transaction:

```text
shared kernel flock
 ↓
source ownership/type/name validation
 ↓
verify expected SHA-256 revision
 ↓
destination absence / managed-namespace validation
 ↓
re-check source + revision + destination
 ↓
rename source → destination
 ↓
nginx -t
 ↓
reload if Nginx is running
 ↓
commit
```

При failure `nginx -t` или reload файл перемещается обратно на исходное имя.

## RPC / ACL

Lifecycle использует существующий локальный ubus object:

```text
telego.nginx
```

Новый read method для rename revision:

```text
foreign_revision(name)
```

Успешный response:

```json
{
  "ok": true,
  "revision": "<sha256>",
  "error": ""
}
```

Новые write methods:

```text
create_foreign(name, content)
rename_active(name, new_name, revision)
```

Успешный create response:

```json
{
  "ok": true,
  "created": true,
  "error": ""
}
```

Успешный rename response:

```json
{
  "ok": true,
  "renamed": true,
  "error": ""
}
```

Основные stable error codes lifecycle boundary:

```text
invalid-name
invalid-revision
stale-content
content-too-large
target-exists
managed-target
editor-helper-unavailable
editor-operation-failed
```

Browser/rpcd передаёт helper logical names, а не filesystem paths. Configuration content для create/replace идёт через stdin.

## LuCI flow

На странице **Службы → telEgo → Файлы Nginx** Lifecycle UI добавляет:

- верхнюю кнопку **Создать файл**;
- действие **Переименовать** у active foreign rows.

Create flow:

```text
Create file
 ↓
name + content
 ↓
client-side allowlist / 64 KiB check
 ↓
Review new file
 ↓
create_foreign
 ↓
inventory refresh
```

Rename flow:

```text
active foreign row
 ↓
Rename
 ↓
foreign_revision → current SHA-256
 ↓
new safe name
 ↓
rename_active
 ↓
inventory refresh
```

Ошибки create/rename показываются внутри текущего modal. Submit button блокируется на время RPC, чтобы исключить повторный двойной submit.

## Security invariants

Lifecycle сохраняет следующие обязательные свойства:

1. нет arbitrary-path filesystem API;
2. create/rename ограничены `/etc/nginx/conf.d/*.conf` direct child names;
3. package-owned/generated managed namespace нельзя занять или перезаписать;
4. существующий destination никогда не overwrite-ится;
5. active foreign source повторно проверяется непосредственно перед rename;
6. rename использует optimistic SHA-256 revision и не зависит от P9 content-size limit;
7. create content ограничен 64 KiB и передаётся через stdin;
8. P7/P8/P9/P10 используют один kernel `flock`;
9. active tree обязан пройти `nginx -t` до commit;
10. reload failure откатывает filesystem state;
11. create/rename не означает adoption в telEgo ownership;
12. quarantined files не являются допустимым rename source lifecycle.

## CI

Lifecycle проверяется следующими слоями:

- shell regression `nginx-telego-editor`: create, duplicate target, managed target deny, size limit, shared flock, `nginx -t` rollback, reload rollback, rename, collision, stale revision, managed target deny, large-file revision/rename и rollback;
- native ucode RPC tests: `foreign_revision`, create/rename invocation, stdin transfer, quoting и error mapping;
- LuCI contract tests: ACL, RPC declarations, Create/Rename visibility, modal/error behavior и package revisions;
- i18n coverage;
- APK layout/rootfs smoke и OpenWrt 25.12.x compatibility matrix.

Lifecycle не заменяет P8 quarantine/delete и P9 editor. Он расширяет тот же restricted foreign-file lifecycle, сохраняя общий ownership, lock и transaction boundary.
