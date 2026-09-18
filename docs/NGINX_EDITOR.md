# Ограниченный редактор Nginx

[**Русский**](NGINX_EDITOR.md) · [English](NGINX_EDITOR_EN.md)

Ограниченный редактор на странице **Службы → telEgo → Файлы Nginx** предназначен для уже существующих administrator-owned/foreign файлов `*.conf`. Исторически эта возможность добавлена на этапе P9.

Редактор не меняет модель владения P6/P7/P8: редактирование файла не делает его telEgo-owned и не меняет `ownership.tsv`.

## Scope

Редактировать можно только существующий regular file, который одновременно:

- является direct child `/etc/nginx/conf.d/`;
- имеет безопасное имя `*.conf` без path traversal;
- классифицирован P8 как обычный foreign/admin-owned файл; либо
- занимает reserved generated path `80/85`, но P6 явно классифицирует occupant как `foreign`.

Редактирование запрещено для:

- `/etc/nginx/conf.d/20-telego-core.conf`;
- `/etc/nginx/snippets/telego.locations`;
- generated `80/85` в состоянии `managed`;
- symlink, directory, FIFO и других non-regular targets;
- quarantined files;
- произвольных absolute paths;
- создания и переименования файлов.

Создание/rename новых `.conf` намеренно не входят в исходный scope редактора.

## Backend boundary

Root write primitive:

```text
/usr/libexec/nginx-telego-editor
```

Поддерживаемые команды:

```sh
/usr/libexec/nginx-telego-editor inspect NAME.conf
/usr/libexec/nginx-telego-editor replace NAME.conf EXPECTED_SHA256
```

`replace` получает новое содержимое через **stdin**. Содержимое конфигурации не передаётся shell-аргументом.

Для совместимости с ucode/rpcd в OpenWrt 25.12 RPC запускает editor helper через строковый `fs.popen()`. Имя файла и SHA-256 revision проходят строгую allowlist-проверку и shell-quoting перед добавлением в command string; конфигурационные bytes никогда не включаются в command string и передаются helper только через stdin.

## Concurrency и revision contract

`inspect` возвращает SHA-256 текущих bytes, размер и содержимое. LuCI сохраняет этот revision вместе с открытым editor buffer.

При сохранении браузер передаёт исходный revision. Backend проверяет SHA-256 активного файла до commit. Если файл изменён после открытия редактора, сохранение отклоняется как stale:

```text
stale-content
```

Таким образом обычное изменение того же файла через SSH или другой LuCI-сеанс не должно молча перетираться.

Редактор также использует тот же kernel `flock`:

```text
/var/lock/nginx-telego-reconcile.lock
```

что P7 reconciliation и P8 administration. P7/P8/P9 не выполняют свои write-транзакции одновременно.

## Transaction

Максимальный размер редактируемого содержимого:

```text
64 KiB (65536 bytes)
```

Write-path:

```text
shared kernel flock
 ↓
ownership/type/name validation
 ↓
read submitted content into bounded temporary storage
 ↓
verify expected SHA-256 revision
 ↓
prepare staged file in conf.d and preserve metadata
 ↓
re-check ownership + revision
 ↓
atomically stage active file as rollback copy
 ↓
activate edited file
 ↓
nginx -t
 ↓
reload if nginx is running
 ↓
commit
```

При ошибке `nginx -t` или reload исходный файл возвращается на место. Если новое содержимое byte-for-byte совпадает с текущим, reload не выполняется.

## RPC / ACL

Редактор использует существующий ubus object:

```text
telego.nginx
```

Read method:

```text
foreign_content(name)
```

Response при успехе содержит:

```text
ok
content
revision
size
error
```

Write method:

```text
replace_active(name, revision, content)
```

Основные стабильные error codes editor boundary:

```text
invalid-name
invalid-revision
stale-content
content-too-large
editor-helper-unavailable
editor-operation-failed
```

ACL относит `foreign_content` к read и `replace_active` к write.

## LuCI flow

Для active foreign строки появляется действие **Редактировать**.

UI flow:

```text
Inventory
 ↓
Edit
 ↓
load content + revision
 ↓
textarea
 ↓
Review changes
 ↓
diff current ↔ edited
 ↓
Save changes
 ↓
replace_active
```

Managed package/generated файлы не получают кнопку редактирования.

Перед editor buffer показывается предупреждение, что операция относится только к administrator-owned foreign файлу. Перед записью пользователь проходит отдельный review/diff step.

## Security invariants

Редактор обязан сохранять следующие свойства:

1. browser/rpcd не передаёт helper произвольный filesystem path;
2. editor никогда не редактирует package-owned или доказанно managed generated state;
3. symlink/non-regular target не принимается;
4. конфигурационные bytes идут через stdin, а не shell command string;
5. write ограничен 64 KiB;
6. optimistic SHA-256 revision предотвращает обычный lost update;
7. write serialization общая с P7/P8;
8. активный tree проходит `nginx -t` до commit;
9. reload failure откатывает filesystem state;
10. edit не означает adoption в telEgo ownership.

## CI

Редактор проверяется как минимум следующими слоями:

- shell regression для `nginx-telego-editor`: edit, unchanged, stale revision, managed deny, reserved foreign, symlink, size limit, shared flock, `nginx -t` rollback и reload rollback;
- native ucode RPC tests: OpenWrt-compatible quoted helper invocation, stdin content transfer, revision/error mapping;
- LuCI contract tests: ACL/RPC/menu/editor visibility и отсутствие edit-action для managed rows;
- i18n coverage;
- APK layout: editor helper должен быть installed executable `0755`;
- OpenWrt 25.12.x package/rootfs smoke matrix.
