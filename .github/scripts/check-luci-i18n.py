#!/usr/bin/env python3
import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
JS_FILES = sorted((ROOT / 'package/luci-app-telego/htdocs/resources/view/telego').glob('*.js'))
PO_FILE = ROOT / 'package/luci-i18n-telego-ru/po/ru/telego.po'
I18N_MAKEFILE = ROOT / 'package/luci-i18n-telego-ru/Makefile'


def parse_js_msgids(text: str, path: Path) -> set[str]:
    msgids = set()
    pattern = re.compile(r"_\(\s*((['\"])(?:\\.|(?!\2).)*\2)\s*\)")

    for match in pattern.finditer(text):
        literal = match.group(1)
        try:
            value = ast.literal_eval(literal)
        except (SyntaxError, ValueError) as exc:
            raise SystemExit(
                f'Unable to parse JavaScript string literal in {path}: {literal!r}: {exc}'
            )
        if not isinstance(value, str):
            raise SystemExit(f'Expected string msgid in {path}: {literal!r}')
        msgids.add(value)

    return msgids


def parse_po_entries(text: str) -> dict[str, str]:
    entries = {}
    current_msgid = None
    current_msgstr = None
    active = None

    def finish() -> None:
        nonlocal current_msgid, current_msgstr, active
        if current_msgid is not None:
            entries[current_msgid] = current_msgstr or ''
        current_msgid = None
        current_msgstr = None
        active = None

    for raw_line in text.splitlines():
        line = raw_line.strip()

        if not line:
            finish()
            continue

        if line.startswith('#'):
            continue

        if line.startswith('msgid '):
            if current_msgid is not None:
                finish()
            current_msgid = ast.literal_eval(line[6:])
            current_msgstr = None
            active = 'msgid'
            continue

        if line.startswith('msgstr '):
            if current_msgid is None:
                raise SystemExit('Malformed PO: msgstr encountered before msgid')
            current_msgstr = ast.literal_eval(line[7:])
            active = 'msgstr'
            continue

        if line.startswith('"'):
            value = ast.literal_eval(line)
            if active == 'msgid':
                current_msgid = (current_msgid or '') + value
            elif active == 'msgstr':
                current_msgstr = (current_msgstr or '') + value
            else:
                raise SystemExit(f'Malformed PO: continuation without msgid/msgstr: {line!r}')
            continue

        raise SystemExit(f'Unsupported PO syntax: {line!r}')

    finish()
    return entries


msgids = set()
for path in JS_FILES:
    msgids.update(parse_js_msgids(path.read_text(encoding='utf-8'), path))

po_entries = parse_po_entries(PO_FILE.read_text(encoding='utf-8'))
po_ids = set(po_entries)
translated = {msgid for msgid, msgstr in po_entries.items() if msgid and msgstr}

missing = sorted(msgids - po_ids)
untranslated = sorted(msgids & po_ids - translated)

if missing or untranslated:
    if missing:
        print('Missing msgids:')
        print('\n'.join(f'  {x}' for x in missing))
    if untranslated:
        print('Untranslated msgids:')
        print('\n'.join(f'  {x}' for x in untranslated))
    raise SystemExit(1)

makefile = I18N_MAKEFILE.read_text(encoding='utf-8')
active_catalog = '$(1)/usr/lib/lua/luci/i18n/telego.ru.lmo'
legacy_catalog = '$(1)/usr/share/luci/i18n/telego.ru.lmo'
if active_catalog not in makefile:
    raise SystemExit(f'LuCI catalog is not installed to the active runtime path: {active_catalog}')
if legacy_catalog in makefile:
    raise SystemExit(f'Legacy inactive LuCI catalog path must not be used: {legacy_catalog}')

print(
    f'i18n OK: {len(msgids)} JavaScript msgids have Russian translations '
    'and the catalog uses the active LuCI runtime path.'
)
