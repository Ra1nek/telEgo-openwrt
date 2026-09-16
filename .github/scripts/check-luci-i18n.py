#!/usr/bin/env python3
import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
JS_FILES = sorted((ROOT / 'package/luci-app-telego/htdocs/resources/view/telego').glob('*.js'))
PO_DIR = ROOT / 'package/luci-i18n-telego-ru/po/ru'
PO_FILES = sorted(PO_DIR.glob('*.po'))
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

if not PO_FILES:
    raise SystemExit(f'No Russian PO catalogs found below {PO_DIR}')

po_entries = {}
po_sources = {}
for path in PO_FILES:
    for msgid, msgstr in parse_po_entries(path.read_text(encoding='utf-8')).items():
        if not msgid:
            continue
        if msgid in po_entries and po_entries[msgid] != msgstr:
            raise SystemExit(
                f'Conflicting Russian translation for {msgid!r}: '
                f'{po_sources[msgid]} vs {path}'
            )
        po_entries[msgid] = msgstr
        po_sources[msgid] = path

po_ids = set(po_entries)
translated = {msgid for msgid, msgstr in po_entries.items() if msgstr}

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
active_dir = '$(1)/usr/lib/lua/luci/i18n'
legacy_dir = '$(1)/usr/share/luci/i18n'
po_glob = '$(wildcard ./po/ru/*.po)'
output_pattern = '$(basename $(notdir $(po))).ru.lmo'
if active_dir not in makefile:
    raise SystemExit(f'LuCI catalogs are not installed to the active runtime path: {active_dir}')
if po_glob not in makefile or output_pattern not in makefile:
    raise SystemExit('LuCI translation package must compile every po/ru/*.po catalog')
if legacy_dir in makefile:
    raise SystemExit(f'Legacy inactive LuCI catalog path must not be used: {legacy_dir}')

print(
    f'i18n OK: {len(msgids)} JavaScript msgids have Russian translations '
    f'across {len(PO_FILES)} catalogs and use the active LuCI runtime path.'
)
