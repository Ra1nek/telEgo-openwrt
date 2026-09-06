#!/usr/bin/env python3
import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
JS_FILES = sorted((ROOT / 'package/luci-app-telego/htdocs/resources/view/telego').glob('*.js'))
PO_FILE = ROOT / 'package/luci-app-telego/po/ru/telego.po'

msgids = set()
pattern = re.compile(r"_\(\s*((['\"])(?:\\.|(?!\2).)*\2)\s*\)")

for path in JS_FILES:
    text = path.read_text(encoding='utf-8')
    for match in pattern.finditer(text):
        literal = match.group(1)
        try:
            value = ast.literal_eval(literal)
        except (SyntaxError, ValueError) as exc:
            raise SystemExit(f'Unable to parse JavaScript string literal in {path}: {literal!r}: {exc}')
        if not isinstance(value, str):
            raise SystemExit(f'Expected string msgid in {path}: {literal!r}')
        msgids.add(value)

po = PO_FILE.read_text(encoding='utf-8')
po_ids = set(re.findall(r'^msgid "(.*)"$', po, flags=re.MULTILINE))
po_pairs = re.findall(r'^msgid "(.*)"\nmsgstr "(.*)"$', po, flags=re.MULTILINE)
translated = {msgid for msgid, msgstr in po_pairs if msgid and msgstr}

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

print(f'i18n OK: {len(msgids)} JavaScript msgids have Russian translations.')
