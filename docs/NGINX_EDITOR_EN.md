# Restricted Nginx Editor

[Русский](NGINX_EDITOR.md) · [**English**](NGINX_EDITOR_EN.md)

The **Services → telEgo → Nginx Files** page provides a restricted editor for existing administrator-owned/foreign `*.conf` files. This capability was historically introduced in P9.

The editor does not change the P6/P7/P8 ownership model: editing a file does not make it telEgo-owned and does not modify `ownership.tsv`.

## Scope

A file is editable only when it is an existing regular file that:

- is a direct child of `/etc/nginx/conf.d/`;
- has an allowlisted `*.conf` name without path traversal;
- is classified by P8 as a normal foreign/administrator-owned file; or
- occupies reserved generated path `80/85` while P6 explicitly classifies the occupant as `foreign`.

Editing is forbidden for:

- `/etc/nginx/conf.d/20-telego-core.conf`;
- `/etc/nginx/snippets/telego.locations`;
- generated `80/85` in `managed` state;
- symlinks, directories, FIFOs and other non-regular targets;
- quarantined files;
- arbitrary absolute paths;
- file creation or rename.

Creating or renaming `.conf` files is intentionally outside the original editor scope.

## Backend boundary

Root write primitive:

```text
/usr/libexec/nginx-telego-editor
```

Supported commands:

```sh
/usr/libexec/nginx-telego-editor inspect NAME.conf
/usr/libexec/nginx-telego-editor replace NAME.conf EXPECTED_SHA256
```

`replace` receives the new configuration bytes through **stdin**. Configuration content is never passed as a shell argument.

For OpenWrt 25.12 ucode/rpcd compatibility, RPC invokes the editor helper through string-form `fs.popen()`. The file name and SHA-256 revision are strictly allowlist-validated and shell-quoted before they are appended to the command string; configuration bytes are never included in that command string and are streamed to the helper only through stdin.

## Concurrency and revision contract

`inspect` returns the SHA-256 of the current bytes, size and content. LuCI keeps that revision with the opened editor buffer.

On save, the browser submits the original revision. The backend checks the active file SHA-256 before committing. If the file changed after the editor was opened, the update is rejected as stale:

```text
stale-content
```

This prevents ordinary SSH edits or another LuCI session from being silently overwritten.

The editor also shares the same kernel `flock`:

```text
/var/lock/nginx-telego-reconcile.lock
```

with P7 reconciliation and P8 administration. P7/P8/P9 write transactions therefore do not run concurrently with each other.

## Transaction

Maximum editable content size:

```text
64 KiB (65536 bytes)
```

Write path:

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

If `nginx -t` or reload fails, the original file is restored. If the submitted bytes are identical to the current file, no reload is performed.

## RPC / ACL

The editor uses the existing ubus object:

```text
telego.nginx
```

Read method:

```text
foreign_content(name)
```

A successful response contains:

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

Primary stable editor-boundary error codes:

```text
invalid-name
invalid-revision
stale-content
content-too-large
editor-helper-unavailable
editor-operation-failed
```

ACL classifies `foreign_content` as read and `replace_active` as write.

## LuCI flow

An **Edit** action appears for an active foreign row.

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

Managed package/generated files never receive the edit action.

The editor displays an explicit warning that the operation applies only to an administrator-owned foreign file. A separate review/diff step is shown before the write is submitted.

## Security invariants

The editor must preserve these properties:

1. browser/rpcd never supplies an arbitrary filesystem path to the helper;
2. the editor never modifies package-owned or proven managed generated state;
3. symlink/non-regular targets are rejected;
4. configuration bytes travel through stdin rather than a shell command string;
5. writes are capped at 64 KiB;
6. optimistic SHA-256 revision checking prevents ordinary lost updates;
7. write serialization is shared with P7/P8;
8. the active tree passes `nginx -t` before commit;
9. reload failure rolls the filesystem state back;
10. edit never implies adoption into telEgo ownership.

## CI

The editor is covered by at least these layers:

- shell regression for `nginx-telego-editor`: edit, unchanged, stale revision, managed deny, reserved foreign, symlink, size limit, shared flock, `nginx -t` rollback and reload rollback;
- native ucode RPC tests: OpenWrt-compatible quoted helper invocation, stdin content transfer, revision/error mapping;
- LuCI contract tests: ACL/RPC/menu/editor visibility and absence of edit actions on managed rows;
- i18n coverage;
- APK layout: editor helper must be installed executable `0755`;
- OpenWrt 25.12.x package/rootfs smoke matrix.
