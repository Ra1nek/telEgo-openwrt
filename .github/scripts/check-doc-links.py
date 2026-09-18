#!/usr/bin/env python3
from pathlib import Path
from urllib.parse import unquote
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
FILES = [ROOT / "README.md", ROOT / "README_EN.md", *sorted((ROOT / "docs").glob("*.md"))]
USER_TEXT_FILES = [
    *FILES,
    *sorted((ROOT / "package/luci-app-telego/htdocs").rglob("*.js")),
    *sorted((ROOT / "package/luci-i18n-telego-ru/po").rglob("*.po")),
]
LINK_RE = re.compile(r"!?\[[^\]]*\]\(([^)]+)\)")
errors = []
DEPRECATED_NAMES = (
    "P11_CLOUDFLARE_TLS.md",
    "P11_CLOUDFLARE_TLS_EN.md",
    "P12_ACME_DNS01.md",
    "P12_ACME_DNS01_EN.md",
)

for src in USER_TEXT_FILES:
    if not src.exists():
        continue
    text = src.read_text(encoding="utf-8")
    for deprecated in DEPRECATED_NAMES:
        if deprecated in text:
            errors.append(f"{src.relative_to(ROOT)}: deprecated documentation name: {deprecated}")

for src in FILES:
    if not src.exists():
        continue
    text = src.read_text(encoding="utf-8")
    for raw in LINK_RE.findall(text):
        target = raw.strip().split()[0].strip("<>")
        if not target or target.startswith(("#", "http://", "https://", "mailto:")):
            continue
        target = unquote(target.split("#", 1)[0])
        if not target:
            continue
        resolved = (src.parent / target).resolve()
        try:
            resolved.relative_to(ROOT.resolve())
        except ValueError:
            errors.append(f"{src.relative_to(ROOT)}: link escapes repository: {raw}")
            continue
        if not resolved.exists():
            errors.append(f"{src.relative_to(ROOT)}: missing relative target: {raw}")

if errors:
    print("Documentation link check failed:", file=sys.stderr)
    for error in errors:
        print(f"  - {error}", file=sys.stderr)
    raise SystemExit(1)

print(f"documentation links OK: checked {len(FILES)} Markdown files; deprecated names scanned in {len(USER_TEXT_FILES)} user-facing files")
