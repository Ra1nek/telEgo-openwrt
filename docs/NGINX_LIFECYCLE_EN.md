# P10 — Foreign Nginx File Lifecycle

[Русский](NGINX_LIFECYCLE.md) · [**English**](NGINX_LIFECYCLE_EN.md)

P10 extends P8/P9 with two explicit operations for administrator-owned/foreign Nginx files: **creating** a new `*.conf` file and **renaming** an existing active foreign file.

P10 does not change the P6/P7/P8/P9 ownership model. A created or renamed file remains foreign/administrator-owned and is never added to `ownership.tsv`.

## Scope

P10 operates only on direct-child files:

```text
/etc/nginx/conf.d/NAME.conf
```

The name must match the allowlist for safe `*.conf` names and cannot contain path traversal or an arbitrary absolute path.

P10 does not create directories, snippets, or files outside `/etc/nginx/conf.d/`. Quarantined files cannot be renamed through P10.

## Create

Backend primitive:

```sh
/usr/libexec/nginx-telego-editor create NAME.conf
```

New content is supplied through **stdin** and is limited to 64 KiB.

Create is allowed only when all of the following hold:

- `NAME.conf` is a safe name;
- the target is absent and is not a symlink/non-regular object;
- the target is not registered as a package-owned/generated managed path;
- the name does not attempt to occupy the telEgo managed namespace.

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

A created file receives mode `0644`. If `nginx -t` or reload fails, the new file is removed and the active Nginx tree returns to the pre-operation state.

## Rename

Backend primitive:

```sh
/usr/libexec/nginx-telego-editor rename OLD.conf NEW.conf EXPECTED_SHA256
```

The source must be an existing active foreign file. This includes an occupant of reserved generated path `80/85` only when P6 inventory explicitly classifies it as `foreign`.

Rename is allowed only when:

- source and destination are safe direct-child `*.conf` names;
- `OLD.conf != NEW.conf`;
- the source is an active foreign regular file;
- the destination is absent;
- the destination is not part of the telEgo managed namespace;
- `EXPECTED_SHA256` matches the current source bytes.

The SHA-256 revision prevents ordinary lost updates: if the file changed after the rename dialog was opened, the operation is rejected as `stale-content`.

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

If `nginx -t` or reload fails, the file is moved back to its original name.

## RPC / ACL

P10 extends the existing local ubus object:

```text
telego.nginx
```

New write methods:

```text
create_foreign(name, content)
rename_active(name, new_name, revision)
```

Successful create response:

```json
{
  "ok": true,
  "created": true,
  "error": ""
}
```

Successful rename response:

```json
{
  "ok": true,
  "renamed": true,
  "error": ""
}
```

Primary stable lifecycle-boundary error codes:

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

Browser/rpcd supplies logical names to the helper rather than filesystem paths. Configuration content for create/replace is streamed through stdin.

## LuCI flow

On **Services → telEgo → Nginx Files**, P10 adds:

- a top-level **Create file** action;
- a **Rename** action on active foreign rows.

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
foreign_content → current revision
 ↓
new safe name
 ↓
rename_active
 ↓
inventory refresh
```

Create/rename errors are displayed inside the current modal. The submit button is disabled while the RPC is in flight to prevent duplicate submission.

## Security invariants

P10 preserves these mandatory properties:

1. no arbitrary-path filesystem API;
2. create/rename are restricted to `/etc/nginx/conf.d/*.conf` direct-child names;
3. package-owned/generated managed namespace cannot be occupied or overwritten;
4. an existing destination is never overwritten;
5. the active foreign source is revalidated immediately before rename;
6. rename uses optimistic SHA-256 revision checking;
7. create content is capped at 64 KiB and travels through stdin;
8. P7/P8/P9/P10 share one kernel `flock`;
9. the active tree must pass `nginx -t` before commit;
10. reload failure rolls filesystem state back;
11. create/rename never implies adoption into telEgo ownership;
12. quarantined files are not valid P10 rename sources.

## CI

P10 is covered by these layers:

- `nginx-telego-editor` shell regression: create, duplicate target, managed-target denial, size limit, shared flock, `nginx -t` rollback, reload rollback, rename, collision, stale revision, managed-target denial, and rollback;
- native ucode RPC tests: create/rename invocation, stdin transfer, quoting, and error mapping;
- LuCI contract tests: ACL, RPC declarations, Create/Rename visibility, modal/error behavior, and package revisions;
- i18n coverage;
- APK layout/rootfs smoke and the OpenWrt 25.12.x compatibility matrix.

P10 does not replace P8 quarantine/delete or the P9 editor. It extends the same restricted foreign-file lifecycle while preserving the shared ownership, lock, and transaction boundary.
