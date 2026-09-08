#!/usr/bin/env python3
"""Prepare only telEgo-owned APKs and a basename-only integrity manifest."""
import hashlib
from pathlib import Path
import shutil
import sys

source, destination = map(Path, sys.argv[1:])
destination.mkdir(parents=True, exist_ok=True)
lines = []
for package in ("telego-pkg", "luci-app-telego", "nginx-telego", "luci-i18n-telego-ru"):
    matches = [p for p in source.rglob(package + "-*.apk")
               if p.name[len(package) + 1:len(package) + 2].isdigit()]
    if len(matches) != 1:
        raise SystemExit(f"Expected one {package} APK, found {len(matches)}")
    path = matches[0]
    shutil.copyfile(path, destination / path.name)
    lines.append(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n")
# Byte output keeps release manifests LF-only even on Windows publishers.
(destination / "telego-install.sha256").write_bytes("".join(lines).encode("ascii"))
