/**
 * Bank statement CSV → transactions. Pure (no Deno, no database) so it is unit-tested.
 *
 * The old parser split every line on comma, semicolon AND tab at once. A Swedish
 * export is semicolon-separated with a decimal COMMA, so `2026-06-03;1234,50;SV-123`
 * became five columns: the amount read 1 234,00 kr and the reference read "50"
 * (process battery, 2026-09-19). And the row id contained the import batch id, so
 * importing the same file twice doubled every line while the docs promised a
 * duplicate skip.
 *
 *  - ONE delimiter per file, detected from the header (`;` and tab win over `,`,
 *    because a comma inside a semicolon file is a decimal mark, not a separator).
 *  - Quoted fields may contain the delimiter.
 *  - Amounts in both conventions: `1 234,50` · `1.234,50` · `1,234.50` · `-1234.5` · `(1 234,50)`.
 *  - external_id is derived from the ROW (date, amount, reference, text, counterparty)
 *    plus its occurrence number within the file — two identical payments on one day
 *    stay two, and the same file imported again is the same ids.
 */

export interface ParsedBankTx {
  external_id: string;
  transaction_date: string;
  amount_cents: number;
  currency: string;
  counterparty?: string;
  reference?: string;
  description?: string;
  raw: Record<string, unknown>;
}

const TAB = String.fromCharCode(9);
const FIELD_SEPARATOR = String.fromCharCode(31);
const BOM = String.fromCharCode(0xfeff);
const NBSP = String.fromCharCode(0xa0);
const UNICODE_MINUS = String.fromCharCode(0x2212);

export function detectDelimiter(headerLine: string): string {
  const count = (ch: string) => splitCsvLine(headerLine, ch).length;
  if (count(';') > 1) return ';';
  if (count(TAB) > 1) return TAB;
  return ',';
}

/** Split one line on `delimiter`, honouring double-quoted fields ("" is a literal quote). */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Amount text → öre/cents. Returns null when it is not a number. */
export function parseAmountToCents(raw: string | undefined): number | null {
  if (raw == null) return null;
  // Only currency marks are dropped. Any other letter means this is not an amount.
  let s = raw.split(NBSP).join('').replace(/\s/g, '').replace(/^(sek|eur|usd|gbp|nok|dkk|kr|[€$£])|(sek|eur|usd|gbp|nok|dkk|kr|[€$£])$/gi, '');
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (s.startsWith('-') || s.startsWith(UNICODE_MINUS)) { negative = true; s = s.slice(1); }
  if (s.startsWith('+')) s = s.slice(1);
  if (s.endsWith('-')) { negative = true; s = s.slice(0, -1); }
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    // Both present: the LAST one is the decimal mark, the other groups thousands.
    normalized = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    // Only commas: a decimal mark when 1–2 digits follow the last one, else thousands.
    normalized = /,\d{1,2}$/.test(s) ? s.slice(0, lastComma).replace(/,/g, '') + '.' + s.slice(lastComma + 1) : s.replace(/,/g, '');
  } else {
    // Only dots: several of them group thousands; a single one is a decimal point.
    normalized = (s.match(/\./g) || []).length > 1 ? s.replace(/\./g, '') : s;
  }
  // Grouping must be real grouping: `12,34,56` is not a number in any convention.
  const integerPart = (lastComma >= 0 && lastDot >= 0 ? s.slice(0, Math.max(lastComma, lastDot)) : lastComma >= 0 && /,\d{1,2}$/.test(s) ? s.slice(0, lastComma) : lastDot >= 0 && (s.match(/\./g) || []).length === 1 ? s.slice(0, lastDot) : s);
  if (/[.,]/.test(integerPart) && !/^\d{1,3}([.,]\d{3})+$/.test(integerPart)) return null;
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const cents = Math.round(parseFloat(normalized) * 100);
  return negative ? -cents : cents;
}

function fingerprint(parts: Array<string | number | undefined>): string {
  // FNV-1a, 32-bit, run with two seeds → 16 hex chars. Not a secret, just a stable key.
  const text = parts.map((p) => String(p ?? '')).join(FIELD_SEPARATOR);
  const run = (seed: number) => {
    let h = seed;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  };
  return run(0x811c9dc5) + run(0x9e3779b1);
}

export function parseBankCsv(content: string): { transactions: ParsedBankTx[] } {
  const text = content.startsWith(BOM) ? content.slice(1) : content;
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { transactions: [] };
  const delimiter = detectDelimiter(lines[0]);
  const header = splitCsvLine(lines[0], delimiter).map((h) => h.toLowerCase());
  const idx = (names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const dateIdx = idx(['date', 'datum']);
  const amountIdx = idx(['amount', 'belopp']);
  const refIdx = idx(['reference', 'referens', 'ocr', 'meddelande', 'memo']);
  const descIdx = idx(['description', 'text', 'beskrivning']);
  const counterpartyIdx = idx(['counterparty', 'motpart', 'payee', 'betalningsmottagare']);
  const currencyIdx = idx(['currency', 'valuta']);
  if (dateIdx < 0 || amountIdx < 0) throw new Error('CSV must contain at least date + amount columns');

  const seen = new Map<string, number>();
  const out: ParsedBankTx[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i], delimiter);
    const rawDate = cols[dateIdx];
    const cents = parseAmountToCents(cols[amountIdx]);
    if (!rawDate || cents === null) continue;
    let date = rawDate;
    if (rawDate.length !== 10) {
      const parsed = new Date(rawDate);
      if (isNaN(parsed.getTime())) continue;
      date = parsed.toISOString().slice(0, 10);
    }
    const reference = refIdx >= 0 ? cols[refIdx] || undefined : undefined;
    const description = descIdx >= 0 ? cols[descIdx] || undefined : undefined;
    const counterparty = counterpartyIdx >= 0 ? cols[counterpartyIdx] || undefined : undefined;
    const print = fingerprint([date, cents, reference, description, counterparty]);
    const nth = (seen.get(print) ?? 0) + 1;
    seen.set(print, nth);
    out.push({
      external_id: `csv:${print}:${nth}`,
      transaction_date: date,
      amount_cents: cents,
      currency: currencyIdx >= 0 ? cols[currencyIdx]?.toUpperCase() || 'SEK' : 'SEK',
      counterparty, reference, description,
      raw: Object.fromEntries(header.map((h, j) => [h, cols[j]])),
    });
  }
  return { transactions: out };
}
