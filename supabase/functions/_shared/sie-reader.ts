/**
 * sie-reader — a SIE 4 file, read as bytes and reported as observations.
 *
 * SIE (Standard Import Export) is what every Swedish accounting system hands
 * over: chart, balances and journal entries in one text file. Spec: sie.se.
 *
 * WHY THIS TAKES BYTES AND NOT A STRING. The format is specified as IBM PC 8
 * (CP437), and Bokio still writes it that way — a real 2023 export declares
 * `#FORMAT PC8` and encodes ö as the single byte 0x94. Anything that reads such
 * a file as text has already destroyed it: File.text() in a browser and most
 * agent file-reading tools decode UTF-8, and 0x94 is not valid UTF-8, so every
 * å ä ö becomes U+FFFD before the data reaches any skill. Nothing downstream can
 * undo that. So the decision has to be made once, here, on the raw bytes.
 *
 * AND THE DECLARATION IS NOT ENOUGH EITHER. The same file re-saved by a text
 * editor still says `#FORMAT PC8` while being UTF-8 full of replacement
 * characters. Trusting the header would decode UTF-8 bytes as CP437 and produce
 * ∩┐╜ where ? at least looked like damage. So: detect from the bytes, report
 * what the header claimed, and say when the two disagree.
 *
 * Three encodings, one word, to show why guessing is not an option:
 *     "Ångbåten"  CP437   8F 6E 67 62 86 74 65 6E
 *                 Latin-1 C5 6E 67 62 E5 74 65 6E
 *                 UTF-8   C3 85 6E 67 62 C3 A5 74 65 6E
 * Latin-1 is the dangerous one: 0x94 is a control character there, so the ö
 * simply vanishes — "fr forskning" reads like a typo, not like corruption.
 *
 * This module REPORTS. It writes nothing and decides nothing: one SIE file
 * carries a chart, opening balances and a year of history, and those belong in
 * three different places in FlowWink. Which of them the customer wants is not a
 * question a parser gets to answer.
 */

/** CP437 0x80–0xFF. TextDecoder does not know this encoding — it is not in the
 *  WHATWG set — so the table is explicit. Generated from the code page, not
 *  typed by hand (that habit is what put 2614's name on 2611). */
const CP437_HIGH =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';

export type SieEncoding = 'utf-8' | 'cp437';

export interface EncodingReport {
  declared: string | null;
  detected: SieEncoding;
  agrees: boolean;
  note: string;
}

export interface IntegrityReport {
  replacement_chars: number;
  intact: boolean;
  note: string;
}

export function decodeCp437(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b < 0x80 ? String.fromCharCode(b) : CP437_HIGH[b - 0x80];
  return out;
}

/**
 * Decode from the bytes, not from the header.
 *
 * Valid UTF-8 is taken as UTF-8 even when the file claims PC8: a re-saved file
 * is genuinely UTF-8 now, and re-reading it as CP437 would mangle it a second
 * time. CP437 has no invalid byte, so the fallback always succeeds.
 */
export function decodeSie(bytes: Uint8Array): { text: string; detected: SieEncoding } {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), detected: 'utf-8' };
  } catch {
    return { text: decodeCp437(bytes), detected: 'cp437' };
  }
}

export function encodingReport(text: string, detected: SieEncoding): EncodingReport {
  const declared = text.match(/^#FORMAT\s+(\S+)/m)?.[1] ?? null;
  const declaredIsPc8 = declared?.toUpperCase() === 'PC8';
  const agrees = declared === null || (declaredIsPc8 ? detected === 'cp437' : true);
  return {
    declared,
    detected,
    agrees,
    note: agrees
      ? `Decoded as ${detected}${declared ? `, which matches the #FORMAT ${declared} declaration` : ' (no #FORMAT record)'}.`
      : `The file declares #FORMAT ${declared} (IBM CP437) but its bytes are valid ${detected}. It has been re-saved by something that read and rewrote it — a text editor, a sync tool, a script. The bytes win: decoding as ${declared} would corrupt it a second time. Check integrity below, and prefer the original export from the accounting system if one exists.`,
  };
}

/**
 * Replacement characters are the fingerprint of a decode that already went
 * wrong, upstream, before the file reached us. Counting them is the difference
 * between the customer blaming FlowWink for the mojibake and going to find the
 * original file.
 */
export function integrityReport(text: string): IntegrityReport {
  const n = (text.match(/�/g) ?? []).length;
  return {
    replacement_chars: n,
    intact: n === 0,
    note: n === 0
      ? 'No replacement characters — every character in this file survived.'
      : `${n} replacement characters (U+FFFD). These were ALREADY in the file when it arrived: something read it with the wrong encoding and saved it back, and the original letters are gone — they cannot be recovered from this copy. Import will work, but every Swedish character in names and descriptions is lost. Look for the untouched export from the accounting system.`,
  };
}

// ---------------------------------------------------------------------------
// Record parsing
// ---------------------------------------------------------------------------

export interface SieAccount { code: string; name: string; type?: string; sru?: string }
export interface SieBalance { year: number; account: string; amount: number }
export interface SieTransLine { account: string; amount: number; date?: string; text?: string }
export interface SieVerification {
  series: string; number: string; date: string; text: string;
  lines: SieTransLine[]; balanced: boolean; sum: number;
}
export interface SieFiscalYear { index: number; from: string; to: string }

/** SIE fields are space-separated, with quoted strings that may contain spaces
 *  and \\-escapes. A naive split() loses every account name with a space in it. */
export function splitFields(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    while (i < line.length && /\s/.test(line[i])) i++;
    if (i >= line.length) break;
    if (line[i] === '"') {
      i++;
      let s = '';
      while (i < line.length && line[i] !== '"') {
        if (line[i] === '\\' && i + 1 < line.length) { s += line[i + 1]; i += 2; }
        else { s += line[i]; i++; }
      }
      i++;
      out.push(s);
    } else if (line[i] === '{') {
      // Object/dimension block, e.g. {} or {"1" "STHLM"} — kept whole.
      let depth = 0, s = '';
      while (i < line.length) {
        if (line[i] === '{') depth++;
        if (line[i] === '}') { depth--; s += line[i]; i++; if (depth === 0) break; continue; }
        s += line[i]; i++;
      }
      out.push(s);
    } else {
      let s = '';
      while (i < line.length && !/\s/.test(line[i])) { s += line[i]; i++; }
      out.push(s);
    }
  }
  return out;
}

const isoDate = (d: string) =>
  /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;

export interface SieContents {
  company: { orgnr: string | null; name: string | null; program: string | null; generated: string | null; sie_type: string | null };
  fiscal_years: SieFiscalYear[];
  accounts: SieAccount[];
  opening_balances: SieBalance[];
  closing_balances: SieBalance[];
  results: SieBalance[];
  verifications: SieVerification[];
  unknown_records: Record<string, number>;
}

export function parseSie(text: string): SieContents {
  const lines = text.split(/\r?\n/);
  const accounts = new Map<string, SieAccount>();
  const out: SieContents = {
    company: { orgnr: null, name: null, program: null, generated: null, sie_type: null },
    fiscal_years: [], accounts: [], opening_balances: [], closing_balances: [],
    results: [], verifications: [], unknown_records: {},
  };

  const KNOWN = new Set(['#FLAGGA', '#PROGRAM', '#FORMAT', '#GEN', '#SIETYP', '#ORGNR', '#FNAMN',
    '#ADRESS', '#RAR', '#KPTYP', '#VALUTA', '#TAXAR', '#OMFATTN', '#DIM', '#OBJEKT', '#PROSA']);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line || !line.startsWith('#')) continue;
    const f = splitFields(line);
    const tag = f[0].toUpperCase();

    switch (tag) {
      case '#ORGNR': out.company.orgnr = f[1] ?? null; break;
      case '#FNAMN': out.company.name = f[1] ?? null; break;
      case '#PROGRAM': out.company.program = [f[1], f[2]].filter(Boolean).join(' ') || null; break;
      case '#GEN': out.company.generated = f[1] ? isoDate(f[1]) : null; break;
      case '#SIETYP': out.company.sie_type = f[1] ?? null; break;
      case '#RAR':
        if (f[1] !== undefined && f[2] && f[3]) {
          out.fiscal_years.push({ index: Number(f[1]), from: isoDate(f[2]), to: isoDate(f[3]) });
        }
        break;
      case '#KONTO':
        if (f[1]) accounts.set(f[1], { ...(accounts.get(f[1]) ?? { code: f[1], name: '' }), name: f[2] ?? '' });
        break;
      case '#KTYP':
        if (f[1]) accounts.set(f[1], { ...(accounts.get(f[1]) ?? { code: f[1], name: '' }), type: f[2] });
        break;
      case '#SRU':
        if (f[1]) accounts.set(f[1], { ...(accounts.get(f[1]) ?? { code: f[1], name: '' }), sru: f[2] });
        break;
      case '#IB': case '#UB': case '#RES': {
        const bal: SieBalance = { year: Number(f[1]), account: f[2], amount: Number(f[3]) };
        if (!Number.isFinite(bal.amount) || !bal.account) break;
        (tag === '#IB' ? out.opening_balances : tag === '#UB' ? out.closing_balances : out.results).push(bal);
        break;
      }
      case '#VER': {
        const ver: SieVerification = {
          series: f[1] ?? '', number: f[2] ?? '', date: isoDate(f[3] ?? ''), text: f[4] ?? '',
          lines: [], balanced: false, sum: 0,
        };
        // The { … } block follows on subsequent lines.
        let j = i + 1;
        while (j < lines.length && lines[j].trim() !== '{') j++;
        j++;
        for (; j < lines.length && lines[j].trim() !== '}'; j++) {
          const t = splitFields(lines[j].trim());
          if (t[0]?.toUpperCase() !== '#TRANS') continue;
          const amount = Number(t[3]);
          if (!t[1] || !Number.isFinite(amount)) continue;
          ver.lines.push({ account: t[1], amount, date: t[4] ? isoDate(t[4]) : undefined, text: t[5] || undefined });
        }
        i = j;
        ver.sum = Math.round(ver.lines.reduce((a, l) => a + l.amount, 0) * 100) / 100;
        ver.balanced = Math.abs(ver.sum) < 0.005;
        out.verifications.push(ver);
        break;
      }
      default:
        if (!KNOWN.has(tag)) out.unknown_records[tag] = (out.unknown_records[tag] ?? 0) + 1;
    }
  }

  out.accounts = Array.from(accounts.values()).sort((a, b) => a.code.localeCompare(b.code));
  return out;
}

// ---------------------------------------------------------------------------
// The observation
// ---------------------------------------------------------------------------

export const SIE_CONTRACT =
  'This is an OBSERVATION of the file. Nothing was written. One SIE file carries ' +
  'three different things that belong in three different places in FlowWink — a ' +
  'chart of accounts, opening balances, and a year of journal entries — and which ' +
  'of them this customer wants is not a question a parser may answer. Pick, then ' +
  'call the skill named under each section.';

export function readSieFile(bytes: Uint8Array, include: string[] = []): Record<string, unknown> {
  const { text, detected } = decodeSie(bytes);
  const encoding = encodingReport(text, detected);
  const integrity = integrityReport(text);
  const c = parseSie(text);

  const unbalanced = c.verifications.filter((v) => !v.balanced);
  const wants = (k: string) => include.includes(k);
  const sample = <T,>(rows: T[]) => rows.slice(0, 5);

  return {
    action: 'read_sie_file',
    encoding,
    integrity,
    company: c.company,
    fiscal_years: c.fiscal_years,
    contains: {
      accounts: c.accounts.length,
      opening_balances: c.opening_balances.length,
      closing_balances: c.closing_balances.length,
      result_rows: c.results.length,
      verifications: c.verifications.length,
      transaction_lines: c.verifications.reduce((a, v) => a + v.lines.length, 0),
      unbalanced_verifications: unbalanced.length,
      unrecognised_records: c.unknown_records,
    },
    // Full lists only on request: 1 243 accounts in every response would flood a
    // context for a caller who only wanted the balances.
    accounts: wants('accounts') ? c.accounts : sample(c.accounts),
    opening_balances: wants('balances') ? c.opening_balances : sample(c.opening_balances),
    closing_balances: wants('balances') ? c.closing_balances : sample(c.closing_balances),
    verifications: wants('verifications') ? c.verifications : sample(c.verifications),
    unbalanced: unbalanced.slice(0, 10),
    _contract: SIE_CONTRACT,
    _next: {
      accounts: `${c.accounts.length} accounts — this is the customer's EXISTING chart, not a standard. It will not match FlowWink's locale pack account for account; that is a mapping job, not an import. Do not feed it to import_accounting_standard, which is for published standards only.`,
      opening_balances: `${c.opening_balances.length} #IB rows — manage_opening_balances, one fiscal year at a time. Note #IB year 0 is the year in #RAR 0.`,
      verifications: `${c.verifications.length} verifications / ${c.verifications.reduce((a, v) => a + v.lines.length, 0)} lines — this is what the company ACTUALLY books. Group the recurring patterns and send them to propose_posting_templates; that is the one thing FlowWink can never guess on its own.`,
      full_lists: include.length
        ? undefined
        : 'Only the first 5 rows of each section are shown. Pass include: ["accounts","balances","verifications"] for the full lists.',
    },
  };
}
