#!/usr/bin/env python3
"""Lightweight structural checks for project OpenWrt package Makefiles.

This is intentionally not a replacement for the OpenWrt SDK build. It catches
cheap, deterministic authoring errors before the expensive package workflow,
with special attention to make recipe TAB semantics inside OpenWrt define blocks.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PACKAGE_ROOT = ROOT / "package"

COMMAND_DEFINE = re.compile(
    r"^(?:"
    r"Build/(?:Prepare|Configure|Compile|Install)"
    r"|Package/[^/]+/(?:install|preinst|postinst|prerm|postrm)"
    r")$"
)
LUCI_MK_INCLUDE = "include $(TOPDIR)/feeds/luci/luci.mk"


def error(path: Path, line: int, message: str) -> str:
    relative = path.relative_to(ROOT)
    return f"{relative}:{line}: {message}"


def check_makefile(path: Path) -> list[str]:
    problems: list[str] = []
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()

    if "\r" in text:
        problems.append(error(path, 1, "CRLF/CR characters are not allowed"))

    stack: list[tuple[str, int, bool]] = []
    build_package_calls = 0
    uses_luci_mk = False

    for number, raw in enumerate(lines, start=1):
        stripped = raw.strip()

        if raw.rstrip(" \t") != raw:
            problems.append(error(path, number, "trailing whitespace"))

        if stripped == LUCI_MK_INCLUDE:
            uses_luci_mk = True

        if raw.startswith((" ", "\t")) and stripped.startswith("define "):
            problems.append(error(path, number, "'define' must start at column 1"))

        if raw.startswith((" ", "\t")) and stripped == "endef":
            problems.append(error(path, number, "'endef' must start at column 1"))

        if stripped.startswith("define "):
            name = stripped[len("define ") :].strip()
            if not name:
                problems.append(error(path, number, "empty define name"))
                name = "<invalid>"
            stack.append((name, number, bool(COMMAND_DEFINE.match(name))))
            continue

        if stripped == "endef":
            if not stack:
                problems.append(error(path, number, "unmatched endef"))
            else:
                stack.pop()
            continue

        if "$(eval $(call BuildPackage," in raw:
            build_package_calls += 1

        if stack and stack[-1][2]:
            if not stripped or stripped.startswith("#"):
                continue
            if not raw.startswith("\t"):
                name, start, _ = stack[-1]
                problems.append(
                    error(
                        path,
                        number,
                        f"command in define {name!r} (opened at line {start}) "
                        "must begin with a literal TAB",
                    )
                )

    for name, start, _ in stack:
        problems.append(error(path, start, f"define {name!r} is missing endef"))

    if build_package_calls == 0 and not uses_luci_mk:
        problems.append(
            error(
                path,
                1,
                "missing $(eval $(call BuildPackage,...)) or canonical LuCI luci.mk include",
            )
        )

    return problems


def main() -> int:
    makefiles = sorted(PACKAGE_ROOT.glob("*/Makefile"))
    if not makefiles:
        print("error: no package/*/Makefile files found", file=sys.stderr)
        return 2

    problems: list[str] = []
    for makefile in makefiles:
        problems.extend(check_makefile(makefile))

    if problems:
        print("OpenWrt Makefile quality check failed:", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        return 1

    print(f"OpenWrt Makefile quality check passed ({len(makefiles)} files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
