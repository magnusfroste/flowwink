#!/usr/bin/env python3
"""
Turn the official BAS workbook into the artifact the chart of accounts is
checked against.

Why this exists: src/data/bas2024-accounts.ts said "BAS 2024 Chart of Accounts"
and was written by hand. 269 accounts, no import, no source link, nothing that
could disagree with it. When it was finally compared against the standard on
2026-08-09, 166 of the names were wrong and 40 of the account numbers did not
exist in BAS at all — including whole ranges shifted by one position, the
signature of writing from memory rather than transcribing.

A hand-typed standard is not a standard. This script makes the real one a
committed artifact with a checksum, so "our chart disagrees with BAS" becomes a
failing test instead of an accounting error nobody sees until a VAT return.

Usage:
    curl -sLo src/data/locale-sources/Kontoplan-BAS-2024.xlsx \\
        https://www.bas.se/wp-content/uploads/2024/01/Kontoplan-BAS-2024.xlsx
    python3 scripts/bas-xlsx-to-json.py

Reads the xlsx as what it is — a zip of XML — so there is no dependency to
install and no chance of the parse silently differing from what was reviewed.
"""
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
ROOT = Path(__file__).resolve().parent.parent
XLSX = ROOT / 'src/data/locale-sources/Kontoplan-BAS-2024.xlsx'
OUT = ROOT / 'src/data/locale-sources/bas-2024-official.json'

SOURCE_URL = 'https://www.bas.se/wp-content/uploads/2024/01/Kontoplan-BAS-2024.xlsx'
# Column G carries the four-digit account number, H its name, F the markers.
# "■" is BAS's own flag for the subset it considers sufficient for basic
# bookkeeping in most companies — 341 accounts. That is the right size for a
# starter chart, and unlike a curated guess it is the standard's own opinion.
COL_CODE, COL_NAME, COL_MARK = 'G', 'H', 'F'
CORE_MARK = '■'


def cells(row):
    out = {}
    for cell in row.findall(NS + 'c'):
        ref = re.match(r'([A-Z]+)', cell.get('r')).group(1)
        v = cell.find(NS + 'v')
        if v is None:
            continue
        out[ref] = SHARED[int(v.text)] if cell.get('t') == 's' else v.text
    return out


if not XLSX.exists():
    sys.exit(f'Missing {XLSX}. Download it first:\n  curl -sLo {XLSX} {SOURCE_URL}')

raw = XLSX.read_bytes()
z = zipfile.ZipFile(XLSX)
SHARED = [
    ''.join(t.text or '' for t in si.iter(NS + 't'))
    for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall(NS + 'si')
]

accounts = {}
for row in ET.fromstring(z.read('xl/worksheets/sheet1.xml')).iter(NS + 'row'):
    c = cells(row)
    code, name = str(c.get(COL_CODE, '')), c.get(COL_NAME, '')
    if re.fullmatch(r'\d{4}', code) and isinstance(name, str) and name.strip():
        accounts[code] = {'name': name.strip(), 'core': c.get(COL_MARK) == CORE_MARK}

if len(accounts) < 1000:
    sys.exit(f'Only parsed {len(accounts)} accounts — the workbook layout changed. '
             'Check the column letters before trusting this output.')

payload = {
    '_source': SOURCE_URL,
    '_title': 'Kontoplan – BAS 2024 v 1.0',
    '_publisher': 'BAS-intressenternas Förening',
    '_sha256': hashlib.sha256(raw).hexdigest(),
    '_downloaded': '2026-08-09',
    '_note': ('Generated from the official workbook. "core" marks the accounts BAS itself '
              'flags with ■ — the selection it says is sufficient for basic bookkeeping in '
              'most companies. Regenerate with scripts/bas-xlsx-to-json.py against a fresh '
              'download; never hand-edit.'),
    '_count': len(accounts),
    '_core_count': sum(1 for a in accounts.values() if a['core']),
    'accounts': dict(sorted(accounts.items())),
}
OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + '\n')
print(f'✅ {OUT.relative_to(ROOT)} — {payload["_count"]} accounts '
      f'({payload["_core_count"]} core), sha256 {payload["_sha256"][:16]}…')
