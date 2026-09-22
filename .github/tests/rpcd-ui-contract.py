#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
acl_path = ROOT / "package/luci-app-telego/root/usr/share/rpcd/acl.d/luci-app-telego.json"
rpc_path = ROOT / "package/luci-app-telego/root/usr/share/rpcd/ucode/telego-ui"
makefile_path = ROOT / "package/luci-app-telego/Makefile"

acl = json.loads(acl_path.read_text(encoding="utf-8"))
source = rpc_path.read_text(encoding="utf-8")
makefile = makefile_path.read_text(encoding="utf-8")

assert "telego-ui-read" in acl
assert "telego-ui-diagnostics" in acl

read_group = acl["telego-ui-read"]
diag_group = acl["telego-ui-diagnostics"]

assert "write" not in read_group
assert "write" not in diag_group
assert read_group["read"]["ubus"]["telego.ui"] == ["capabilities", "system_info"]
assert diag_group["read"]["ubus"]["telego.ui"] == ["logs", "runtime_config"]

base_ubus = acl["luci-app-telego"]["read"]["ubus"]
assert "telego.ui" not in base_ubus, "P6.3 methods must remain behind granular ACL groups"

# There must be no generic exec/path surface. All sources and commands are fixed
# server-side and request data is limited to the validated integer log limit.
assert "request.args.path" not in source
assert "request.args.command" not in source
assert "request.args.package" not in source
assert "RUNTIME_PATH = '/var/etc/telego.toml'" in source
assert "/sbin/logread -e telego -l " in source
assert "type(limit) != 'int' || limit < 1 || limit > 200" in source
assert "LOG_MAX_BYTES = 65536" in source
assert "RUNTIME_MAX_BYTES = 131072" in source
assert "runtime-config-parse-failed" in source
assert '"[REDACTED]"' in source
assert "SAFE_LOG_MESSAGES" in source

assert "PKG_RELEASE:=29" in makefile
assert "./root/usr/share/rpcd/ucode/telego-ui" in makefile
assert "$(1)/usr/share/rpcd/ucode/telego-ui" in makefile

print("P6.3 rpcd ACL/security contract tests passed")
