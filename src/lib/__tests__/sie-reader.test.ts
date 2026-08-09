import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  decodeCp437, decodeSie, encodingReport, integrityReport,
  splitFields, parseSie, readSieFile,
} from '../../../supabase/functions/_shared/sie-reader';

/**
 * SIE 4 is specified as IBM CP437, and Bokio still writes it that way — a real
 * 2023 export encodes ö as the single byte 0x94. Everything that reads such a
 * file as TEXT destroys it first: File.text() in a browser and every ordinary
 * agent file tool decode UTF-8, 0x94 is not valid UTF-8, and the character
 * becomes U+FFFD before any skill sees it. Nothing downstream can undo that.
 *
 * Verified against two real Bokio exports of the same fiscal year: the original
 * (CP437, 2106 Swedish characters intact) and the same file after a text editor
 * re-saved it (UTF-8, 2109 replacement characters, zero survivors).
 */

const enc = (s: string, cp437 = true) => {
  // Encode a string the way a CP437 writer would, for the bytes we care about.
  const MAP: Record<string, number> = { å: 0x86, ä: 0x84, ö: 0x94, Å: 0x8f, Ä: 0x8e, Ö: 0x99, é: 0x82 };
  const out: number[] = [];
  for (const ch of s) {
    if (cp437 && MAP[ch] !== undefined) out.push(MAP[ch]);
    else for (const b of new TextEncoder().encode(ch)) out.push(b);
  }
  return new Uint8Array(out);
};

describe('CP437 is not Latin-1, and guessing loses data', () => {
  it('decodes the bytes a Swedish SIE file actually contains', () => {
    expect(decodeCp437(new Uint8Array([0x86, 0x84, 0x94, 0x8f, 0x8e, 0x99]))).toBe('åäöÅÄÖ');
  });

  it('the same byte gives three different wrong answers, and none of them throws', () => {
    // "för" as a CP437 writer emits it: 66 94 72.
    const bytes = new Uint8Array([0x66, 0x94, 0x72]);
    expect(decodeCp437(bytes)).toBe('för');
    // "Latin-1" is not even one thing: every WHATWG runtime maps that label to
    // windows-1252, where 0x94 is a curly quote. So the ö becomes ”.
    expect(new TextDecoder('latin1').decode(bytes)).toBe('f”r');
    expect(new TextDecoder('iso-8859-1').decode(bytes)).toBe('f”r');
    // UTF-8 at least leaves a visible scar.
    expect(new TextDecoder('utf-8').decode(bytes)).toBe('f\uFFFDr');

    // The dangerous one is Latin-1: f”r looks like a stray quote, a typo, a
    // formatting glitch — anything but an encoding failure. Which is why the
    // adapter comment calling CP437 "Latin-1" pointed at the failure mode
    // nobody would have investigated.
  });
});

describe('detection reads the bytes, never the header', () => {
  it('a genuine CP437 file is detected as CP437', () => {
    const { text, detected } = decodeSie(enc('#FORMAT PC8\n#KONTO 1011 "Balanserade utgifter för forskning"'));
    expect(detected).toBe('cp437');
    expect(text).toContain('för forskning');
  });

  it('valid UTF-8 is taken as UTF-8 even when the file still claims PC8', () => {
    // A re-saved file IS UTF-8 now. Re-reading it as CP437 would mangle it a
    // second time — ∩┐╜ where at least ? looked like damage.
    const { text, detected } = decodeSie(new TextEncoder().encode('#FORMAT PC8\n#KONTO 1011 "för"'));
    expect(detected).toBe('utf-8');
    expect(text).toContain('för');
  });

  it('reports agreement, and explains the disagreement when there is one', () => {
    const ok = encodingReport('#FORMAT PC8', 'cp437');
    expect(ok.agrees).toBe(true);

    const bad = encodingReport('#FORMAT PC8', 'utf-8');
    expect(bad.agrees).toBe(false);
    expect(bad.note).toMatch(/re-saved by something that read and rewrote it/);
    expect(bad.note).toMatch(/corrupt it a second time/);
  });

  it('a file with no #FORMAT record is not called a mismatch', () => {
    expect(encodingReport('#FLAGGA 0', 'utf-8').agrees).toBe(true);
  });
});

describe('damage that arrived with the file is named as such', () => {
  it('counts replacement characters and says they were already there', () => {
    const r = integrityReport('#KONTO 1011 "f�r forskning"');
    expect(r.replacement_chars).toBe(1);
    expect(r.intact).toBe(false);
    // The whole point: without this the customer sees mojibake in FlowWink and
    // concludes FlowWink broke it.
    expect(r.note).toMatch(/ALREADY in the file when it arrived/);
    expect(r.note).toMatch(/cannot be recovered/);
  });

  it('a clean file says so plainly', () => {
    expect(integrityReport('#KONTO 1011 "för forskning"').intact).toBe(true);
  });
});

describe('field splitting survives the names that matter', () => {
  it('keeps quoted strings with spaces whole — a naive split loses every account name', () => {
    expect(splitFields('#KONTO 1011 "Balanserade utgifter för forskning och utveckling"'))
      .toEqual(['#KONTO', '1011', 'Balanserade utgifter för forskning och utveckling']);
  });

  it('handles the {} object block SIE puts in every #TRANS', () => {
    expect(splitFields('#TRANS 1930 {} -1840.00 20230118 "Martin & Servera"'))
      .toEqual(['#TRANS', '1930', '{}', '-1840.00', '20230118', 'Martin & Servera']);
  });

  it('unescapes \\" inside a quoted field', () => {
    expect(splitFields('#FNAMN "AB \\"Kalle\\" & Co"')).toEqual(['#FNAMN', 'AB "Kalle" & Co']);
  });
});

describe('parsing the record types that carry the value', () => {
  const SAMPLE = [
    '#FLAGGA 0', '#PROGRAM "Bokio" 1.0', '#FORMAT PC8', '#GEN 20230902', '#SIETYP 4',
    '#ORGNR 5566161658', '#FNAMN "LiteIT Svenska AB"',
    '#RAR 0 20230101 20231231', '#RAR -1 20220101 20221231',
    '#KONTO 1930 "Företagskonto"', '#KTYP 1930 T',
    '#KONTO 3001 "Försäljning inom Sverige, 25 % moms"',
    '#IB 0 1930 45000.00', '#UB 0 1930 52000.00',
    '#VER "V" "2" 20230102 "SEB" 20230102', '{',
    '\t#TRANS 1930 {} -1840.00 20230102 "Avgift"',
    '\t#TRANS 6570 {} 1840.00 20230102 ""', '}',
    '#VER "V" "3" 20230113 "Obalanserad" 20230113', '{',
    '\t#TRANS 1930 {} -100.00', '\t#TRANS 6570 {} 90.00', '}',
  ].join('\r\n');

  const c = parseSie(SAMPLE);

  it('reads the company and every fiscal year', () => {
    expect(c.company).toMatchObject({ orgnr: '5566161658', name: 'LiteIT Svenska AB', sie_type: '4' });
    expect(c.company.generated).toBe('2023-09-02');
    expect(c.fiscal_years).toEqual([
      { index: 0, from: '2023-01-01', to: '2023-12-31' },
      { index: -1, from: '2022-01-01', to: '2022-12-31' },
    ]);
  });

  it('merges #KONTO and #KTYP into one account', () => {
    expect(c.accounts).toHaveLength(2);
    expect(c.accounts[0]).toEqual({ code: '1930', name: 'Företagskonto', type: 'T' });
  });

  it('separates opening from closing balances', () => {
    expect(c.opening_balances).toEqual([{ year: 0, account: '1930', amount: 45000 }]);
    expect(c.closing_balances).toEqual([{ year: 0, account: '1930', amount: 52000 }]);
  });

  it('reads the #TRANS block that follows a #VER on later lines', () => {
    expect(c.verifications[0]).toMatchObject({ series: 'V', number: '2', date: '2023-01-02', text: 'SEB' });
    expect(c.verifications[0].lines).toHaveLength(2);
    expect(c.verifications[0].lines[0]).toMatchObject({ account: '1930', amount: -1840, text: 'Avgift' });
  });

  it('flags a verification whose lines do not sum to zero — a defect in the SOURCE', () => {
    expect(c.verifications[0].balanced).toBe(true);
    expect(c.verifications[1].balanced).toBe(false);
    expect(c.verifications[1].sum).toBe(-10);
  });
});

describe('the observation is an observation', () => {
  const r = readSieFile(enc('#FORMAT PC8\r\n#FNAMN "Ångbåten AB"\r\n#KONTO 1930 "Företagskonto"')) as never as Record<string, never>;

  it('writes nothing and says the file is three imports, not one', () => {
    expect(String(r._contract)).toMatch(/Nothing was written/);
    expect(String(r._contract)).toMatch(/three different places/);
  });

  it('sends the chart AWAY from import_accounting_standard', () => {
    // A customer's legacy chart is not a published standard. Sending it there
    // would store one company's account names as a country's standard.
    expect(String((r._next as never as Record<string, string>).accounts))
      .toMatch(/not a standard.*mapping job|mapping job/s);
    expect(String((r._next as never as Record<string, string>).accounts))
      .toMatch(/Do not feed it to import_accounting_standard/);
  });

  it('points the verifications at propose_posting_templates — the reason to read the file', () => {
    expect(String((r._next as never as Record<string, string>).verifications))
      .toMatch(/propose_posting_templates/);
    expect(String((r._next as never as Record<string, string>).verifications))
      .toMatch(/never guess on its own/);
  });

  it('samples by default so a 1200-account chart cannot flood a context', () => {
    const many = ['#FORMAT PC8', ...Array.from({ length: 40 }, (_, i) => `#KONTO ${1000 + i} "K${i}"`)].join('\r\n');
    const sampled = readSieFile(new TextEncoder().encode(many)) as never as Record<string, never[]>;
    const full = readSieFile(new TextEncoder().encode(many), ['accounts']) as never as Record<string, never[]>;
    expect(sampled.accounts).toHaveLength(5);
    expect(full.accounts).toHaveLength(40);
  });
});

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

const agentExecute = readFileSync(
  resolve(__dirname, '../../../supabase/functions/agent-execute/index.ts'), 'utf-8');
const accountingModule = readFileSync(
  resolve(__dirname, '../../../src/lib/modules/accounting-module.ts'), 'utf-8');
const seed = accountingModule.slice(
  accountingModule.indexOf("name: 'read_sie_file'"),
  accountingModule.indexOf("name: 'import_accounting_standard'"));

describe('it takes bytes, and refuses a string', () => {
  it('the handler requires content_base64', () => {
    expect(agentExecute).toMatch(/handler === 'internal:read_sie_file'/);
    expect(agentExecute).toMatch(/content_base64 is required\. Read the SIE file as BYTES/);
  });

  it('and explains WHY a text read is unrecoverable — an agent that does not know will do it', () => {
    expect(agentExecute).toMatch(/destroys every å ä ö before the file reaches this skill/);
  });

  it('the rule is in the DESCRIPTION, the tier read before choosing the call', () => {
    expect(seed).toMatch(/READ THE FILE AS BYTES AND SEND content_base64 — never as text/);
    expect(seed).toMatch(/Use when:/);
    expect(seed).toMatch(/NOT for:/);
  });

  it('a data: prefix is tolerated rather than failing on a common wrapper', () => {
    expect(agentExecute).toMatch(/replace\(\/\^data:\[\^,\]\+,\/, ''\)/);
  });

  it('reads freely — an inventory that writes nothing must not need approval', () => {
    expect(seed).toMatch(/trust_level: 'auto'/);
  });
});
