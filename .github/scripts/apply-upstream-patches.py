#!/usr/bin/env python3
"""Apply the small OpenWrt-only delta to the pinned upstream telEgo source."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MAIN = ROOT / "telego-src" / "cmd" / "telego" / "main.go"
text = MAIN.read_text(encoding="utf-8")

replacements = [
    (
        '''\t\tlog.Info().\n\t\t\tStr("name", s.Name).\n\t\t\tStr("ee_link", eeLink).\n\t\t\tStr("dd_link", ddLink).\n\t\t\tMsg("Telegram proxy links")''',
        '''\t\tfmt.Fprintf(os.Stdout, "name=%s\\nee_link=%s\\ndd_link=%s\\n", s.Name, eeLink, ddLink)''',
    ),
    (
        '''\t\tlog.Info().\n\t\t\tStr("name", profile.Name()).\n\t\t\tStr("mode", profile.Mode().String()).\n\t\t\tStr("tg_link", links.Telegram).\n\t\t\tStr("https_link", links.HTTPS).\n\t\t\tMsg("Telegram WEB proxy links")''',
        '''\t\tfmt.Fprintf(os.Stdout, "name=%s\\nmode=%s\\ntg_link=%s\\nhttps_link=%s\\n", profile.Name(), profile.Mode().String(), links.Telegram, links.HTTPS)''',
    ),
    (
        '''\tlog.Info().\n\t\tStr("secret", keyHex).\n\t\tStr("ee_link", "tg://proxy?server=YOUR_IP&port=443&secret="+eeSecret).\n\t\tStr("dd_link", "tg://proxy?server=YOUR_IP&port=443&secret="+ddSecret).\n\t\tMsg("generated secret (use ee for FakeTLS, dd for raw)")''',
        '''\tfmt.Fprintf(os.Stdout, "secret=%s\\nee_link=tg://proxy?server=YOUR_IP&port=443&secret=%s\\ndd_link=tg://proxy?server=YOUR_IP&port=443&secret=%s\\n", keyHex, eeSecret, ddSecret)''',
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f"expected upstream v0.6.1 block not found: {old[:60]!r}")
    text = text.replace(old, new, 1)

MAIN.write_text(text, encoding="utf-8")
