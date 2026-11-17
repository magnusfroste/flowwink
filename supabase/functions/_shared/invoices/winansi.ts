/**
 * Text a standard PDF font can draw.
 *
 * The invoice PDF is set in Helvetica, which pdf-lib encodes as WinAnsi
 * (Windows-1252). One character outside it — an arrow in a line description,
 * an emoji in a note, a name in Greek — made `drawText` throw, the whole PDF
 * failed, and the invoice mail went out without its attachment (found
 * 2026-11-17 on an invoice whose line read "Plan A → Plan B"). A character the
 * font cannot draw is written the nearest way it can: a known sign as its
 * ASCII spelling, an accented letter outside the set without its accent, and
 * anything else as "?" — the invoice is still an invoice.
 */

/** The code points Windows-1252 carries above Latin-1 (its 0x80–0x9F block). */
const CP1252_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d,
  0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

const SPELLED: Record<string, string> = {
  '→': '->', '←': '<-', '↔': '<->', '⇒': '=>', '≤': '<=', '≥': '>=', '≠': '!=',
  '−': '-', '‐': '-', '‑': '-', '‒': '-', '―': '-', '×': 'x', '✕': 'x', '✓': 'v', '✔': 'v',
  ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', '​': '', '﻿': '',
  '′': "'", '″': '"', '­': '',
  // Letters Unicode does not decompose into a base and an accent.
  'Ł': 'L', 'ł': 'l', 'Đ': 'D', 'đ': 'd', 'ı': 'i', 'ẞ': 'SS',
};

function drawable(cp: number): boolean {
  if (cp === 0x0a || cp === 0x0d || cp === 0x09) return true;
  if (cp >= 0x20 && cp <= 0x7e) return true;
  if (cp >= 0xa0 && cp <= 0xff) return true;
  return CP1252_EXTRA.has(cp);
}

export function winAnsi(input: unknown): string {
  const text = String(input ?? '');
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (drawable(cp)) { out += ch; continue; }
    if (ch in SPELLED) { out += SPELLED[ch]; continue; }
    // An accented letter outside the set: the letter without its accent.
    const base = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    if (base && [...base].every((b) => drawable(b.codePointAt(0)!))) { out += base; continue; }
    // A variation selector or a joiner belongs to the sign before it.
    if ((cp >= 0xfe00 && cp <= 0xfe0f) || cp === 0x200d) continue;
    out += '?';
  }
  return out;
}
