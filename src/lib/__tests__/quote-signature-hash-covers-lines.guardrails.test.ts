import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildQuoteSignaturePayload,
  invoiceLinesForSignedQuote,
  QUOTE_CONTENT_HASH_ALG,
  resolveSignedQuoteLines,
} from '../../../supabase/functions/_shared/quote-lines';
import { resolveQuoteLines } from '../quote-lines';

/**
 * Skyddsräcke: en signatur får ALDRIG hasha en tom radlista när offerten har
 * rader.
 *
 * Varför räcket finns (skarpt reproducerat 2026-08-23): `quote-sign` hashade
 * `quote.line_items ?? []`. Offertrader lever på TVÅ ställen — agent/MCP-vägen,
 * mall- och affärsderiverade offerter samt `comms-send` skriver TABELLEN
 * `quote_items`, medan adminpanelen skriver JSONB-kolumnen
 * `quotes.line_items`. För varje offert i den första gruppen är kolumnen tom,
 * så den lagrade hashen var — bit för bit verifierad — sha256 av
 * offertdokumentet MED TOM RADLISTA.
 *
 * Certifikatsidan påstod samtidigt ordagrant att en matchande hash bevisar att
 * dokumentet inte ändrats. Det var falskt: priset kunden signerade ingick inte
 * i beviset. Någon kunde skriva om varenda rad och hashen fortsatte stämma.
 *
 * Ett juridiskt artefakt som ljuger är allvarligare än ett som saknas. Därför
 * är hela kedjan fail-closed: kan raderna inte läsas VÄGRAR signeringen, den
 * hashar aldrig en lista den inte kunde redogöra för.
 *
 * Gamla signaturer räknas ALDRIG om — det vore att förfalska historik. De bär
 * bar hex; nya bär `sha256-quote-v2:<hex>`. Certifikatsidan läser stämpeln och
 * redovisar varje signatur för exakt vad den täcker.
 */

const root = process.cwd();
const signFn = readFileSync(join(root, 'supabase/functions/quote-sign/index.ts'), 'utf8');
const certPage = readFileSync(join(root, 'src/pages/SignatureCertificatePage.tsx'), 'utf8');
const publicQuoteSql = readFileSync(
  join(root, 'supabase/migrations/20260808120000_public-quote-by-token.sql'),
  'utf8',
);
const contractSignFn = readFileSync(join(root, 'supabase/functions/contract-sign/index.ts'), 'utf8');

/** Offertlammet: en agent-skriven rad, 1 798 kr exkl. moms → 2 247,50 kr. */
const AGENT_ROW = {
  description: 'Konsultinsats',
  quantity: 1,
  unit: 'h',
  unit_price_cents: 179800,
  line_total_cents: 224750,
  position: 0,
};
const AGENT_QUOTE_TOTAL_CENTS = 224750;

const QUOTE_HEADER = {
  quote_number: 'QUO-0125',
  title: 'Migrering',
  intro_text: null,
  terms_text: null,
  subtotal_cents: 179800,
  tax_cents: 44950,
  total_cents: AGENT_QUOTE_TOTAL_CENTS,
  currency: 'SEK',
  valid_until: '2026-09-30',
  version: 1,
};

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

describe('REPRODUKTIONEN: hashen täcker de faktiska raderna', () => {
  it('en agent-skriven offert hashar rader ur quote_items — inte den tomma JSONB-kolumnen', () => {
    const resolved = resolveSignedQuoteLines({
      itemsReadOk: true,
      itemRows: [AGENT_ROW],
      jsonbLines: [], // så ser en agent-skriven offert ut
      totalCents: AGENT_QUOTE_TOTAL_CENTS,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.origin).toBe('quote_items');
    expect(resolved.lines).toHaveLength(1);
    expect(resolved.lines[0].unit_price_cents).toBe(179800);

    const payload = buildQuoteSignaturePayload({ quote: QUOTE_HEADER, lines: resolved.lines });
    expect(JSON.parse(payload).line_items).toHaveLength(1);
  });

  it('DEN GAMLA BUGGEN: hashen över tom radlista är en ANNAN hash — den får aldrig återuppstå', () => {
    const resolved = resolveSignedQuoteLines({
      itemsReadOk: true,
      itemRows: [AGENT_ROW],
      jsonbLines: [],
      totalCents: AGENT_QUOTE_TOTAL_CENTS,
    });
    if (!resolved.ok) throw new Error('unreachable');

    const withLines = sha256(buildQuoteSignaturePayload({ quote: QUOTE_HEADER, lines: resolved.lines }));
    const oldEmptyList = sha256(buildQuoteSignaturePayload({ quote: QUOTE_HEADER, lines: [] }));
    expect(withLines).not.toBe(oldEmptyList);
  });

  it('att ändra EN krona på EN rad ändrar hashen — det är hela poängen med beviset', () => {
    const base = resolveSignedQuoteLines({
      itemsReadOk: true, itemRows: [AGENT_ROW], jsonbLines: [], totalCents: AGENT_QUOTE_TOTAL_CENTS,
    });
    const tampered = resolveSignedQuoteLines({
      itemsReadOk: true,
      itemRows: [{ ...AGENT_ROW, unit_price_cents: 179700 }],
      jsonbLines: [],
      totalCents: AGENT_QUOTE_TOTAL_CENTS,
    });
    if (!base.ok || !tampered.ok) throw new Error('unreachable');
    expect(sha256(buildQuoteSignaturePayload({ quote: QUOTE_HEADER, lines: base.lines })))
      .not.toBe(sha256(buildQuoteSignaturePayload({ quote: QUOTE_HEADER, lines: tampered.lines })));
  });

  it('kundens val av en valfri rad ingår i beviset — det är en annan affär', () => {
    const optional = { ...AGENT_ROW, is_optional: true };
    const picked = resolveSignedQuoteLines({
      itemsReadOk: true, itemRows: [{ ...optional, selected_by_customer: true }],
      jsonbLines: [], totalCents: AGENT_QUOTE_TOTAL_CENTS,
    });
    const declined = resolveSignedQuoteLines({
      itemsReadOk: true, itemRows: [{ ...optional, selected_by_customer: false }],
      jsonbLines: [], totalCents: AGENT_QUOTE_TOTAL_CENTS,
    });
    if (!picked.ok || !declined.ok) throw new Error('unreachable');
    expect(sha256(buildQuoteSignaturePayload({ quote: QUOTE_HEADER, lines: picked.lines })))
      .not.toBe(sha256(buildQuoteSignaturePayload({ quote: QUOTE_HEADER, lines: declined.lines })));
  });
});

describe('fail closed: ett bevis som inte kunde byggas får aldrig se ut som ett bevis', () => {
  it('en misslyckad läsning av quote_items vägrar — den tolkas ALDRIG som "inga rader"', () => {
    const resolved = resolveSignedQuoteLines({
      itemsReadOk: false,
      itemRows: undefined,
      jsonbLines: [],
      totalCents: AGENT_QUOTE_TOTAL_CENTS,
    });
    expect(resolved.ok).toBe(false);
    expect(resolved.ok === false && resolved.code).toBe('quote_lines_unreadable');
  });

  it('en offert med total men utan läsbara rader vägrar — priset går inte att bevisa', () => {
    const resolved = resolveSignedQuoteLines({
      itemsReadOk: true, itemRows: [], jsonbLines: [], totalCents: AGENT_QUOTE_TOTAL_CENTS,
    });
    expect(resolved.ok).toBe(false);
    expect(resolved.ok === false && resolved.code).toBe('quote_lines_missing');
  });

  it('NEGATIVTEST: en admin-komponerad offert signeras precis som vanligt', () => {
    const resolved = resolveSignedQuoteLines({
      itemsReadOk: true,
      itemRows: [],
      jsonbLines: [{ description: 'Handskriven', qty: 2, unit_price_cents: 50000 }],
      totalCents: 125000,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.origin).toBe('line_items');
    // JSONB säger `qty`, tabellen säger `quantity` — samma normalisering som
    // get_public_quote gör åt kundens sida.
    expect(resolved.lines[0]).toMatchObject({ quantity: 2, line_total_cents: 100000 });
  });

  it('NEGATIVTEST: en tom offert utan pengar är inget att skydda — den får signeras', () => {
    const resolved = resolveSignedQuoteLines({
      itemsReadOk: true, itemRows: [], jsonbLines: [], totalCents: 0,
    });
    expect(resolved.ok).toBe(true);
    expect(resolved.ok && resolved.lines).toEqual([]);
  });

  it('signeringsfunktionen frågar spärren INNAN den hashar, och avbryter på nej', () => {
    const resolveAt = signFn.indexOf('resolveSignedQuoteLines(');
    const hashAt = signFn.indexOf('buildQuoteSignaturePayload(');
    expect(resolveAt).toBeGreaterThan(-1);
    expect(resolveAt).toBeLessThan(hashAt);
    expect(signFn).toMatch(/if \(!resolved\.ok && body\.action === 'accept'\)[\s\S]{0,400}return new Response/);
    // Den gamla, radlösa nyttolasten får inte finnas kvar någonstans i filen.
    expect(signFn).not.toMatch(/line_items: quote\.line_items \?\? \[\]/);
  });

  it('spärren gäller ACCEPT — ett nej får alltid lämnas, men utan påhittad hash', () => {
    // Att vägra en accept skyddar priset. Att vägra ett AVBÖJANDE låser bara in
    // kunden i en offert hen inte kan svara på — och ingen tvistar om priset på
    // ett erbjudande som tackades nej till. Saknad hash är ärligt; en hash över
    // en lista vi inte kunde redogöra för är det inte.
    expect(signFn).toMatch(/const contentHash = resolved\.ok[\s\S]{0,300}: null;/);
    expect(signFn).toMatch(/A DECLINE is not gated/);
  });
});

describe('EN regel om var raderna bor — de tre uttrycken måste vara överens', () => {
  it('tabellen vinner i alla tre lagren: SQL, adminpanelen och signeringen', () => {
    // 1. SQL (kundens sida): quote_items först, JSONB som fallback.
    expect(publicQuoteSql).toMatch(/FROM public\.quote_items qi WHERE qi\.quote_id = v_quote\.id/);
    expect(publicQuoteSql).toMatch(/IF jsonb_array_length\(v_items\) = 0 THEN/);

    // 2 + 3. Adminpanelens resolver och signeringens resolver ger samma ursprung
    //         för samma indata.
    const input = { itemRows: [AGENT_ROW], jsonbLines: [{ description: 'x', qty: 1, unit_price_cents: 1 }] };
    expect(resolveQuoteLines({ itemsLoaded: true, ...input }).origin).toBe('quote_items');
    const edge = resolveSignedQuoteLines({ itemsReadOk: true, ...input, totalCents: AGENT_QUOTE_TOTAL_CENTS });
    expect(edge.ok && edge.origin).toBe('quote_items');
  });

  it('signeringens radform speglar den kunden faktiskt läste (get_public_quote)', () => {
    const resolved = resolveSignedQuoteLines({
      itemsReadOk: true, itemRows: [AGENT_ROW], jsonbLines: [], totalCents: AGENT_QUOTE_TOTAL_CENTS,
    });
    if (!resolved.ok) throw new Error('unreachable');
    // Fälten som SQL:en bygger sitt item-objekt av — id undantaget, som är en
    // radidentitet och inte innehåll.
    for (const field of ['description', 'quantity', 'unit', 'unit_price_cents',
                         'line_total_cents', 'is_optional', 'selected_by_customer']) {
      expect(publicQuoteSql).toContain(`'${field}',`);
      expect(resolved.lines[0]).toHaveProperty(field);
    }
  });
});

describe('fakturan bär de rader som signerades', () => {
  it('den agent-skrivna offerten ger en faktura MED rader (förut: tom faktura, rätt total)', () => {
    const resolved = resolveSignedQuoteLines({
      itemsReadOk: true, itemRows: [AGENT_ROW], jsonbLines: [], totalCents: AGENT_QUOTE_TOTAL_CENTS,
    });
    if (!resolved.ok) throw new Error('unreachable');
    const lines = invoiceLinesForSignedQuote({
      origin: resolved.origin, lines: resolved.lines, jsonbLines: [],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ description: 'Konsultinsats', qty: 1, unit_price_cents: 179800 });
  });

  it('en valfri rad kunden inte kryssade i faktureras inte', () => {
    const resolved = resolveSignedQuoteLines({
      itemsReadOk: true,
      itemRows: [AGENT_ROW, { ...AGENT_ROW, description: 'Tillval', position: 1, is_optional: true, selected_by_customer: false }],
      jsonbLines: [],
      totalCents: AGENT_QUOTE_TOTAL_CENTS,
    });
    if (!resolved.ok) throw new Error('unreachable');
    const lines = invoiceLinesForSignedQuote({ origin: resolved.origin, lines: resolved.lines, jsonbLines: [] });
    expect(lines.map((l) => l.description)).toEqual(['Konsultinsats']);
  });

  it('NEGATIVTEST: JSONB-offerter går igenom orörda — rabatt och produktlänk får inte tappas', () => {
    const jsonb = [{ description: 'Paket', qty: 1, unit_price_cents: 100000, discount_pct: 10, product_id: 'p-1' }];
    const lines = invoiceLinesForSignedQuote({
      origin: 'line_items',
      lines: [{ description: 'Paket', quantity: 1, unit: null, unit_price_cents: 100000, line_total_cents: 100000, is_optional: false, selected_by_customer: true }],
      jsonbLines: jsonb,
    });
    expect(lines).toEqual(jsonb);
  });
});

describe('gamla signaturer redovisas för vad de är — de räknas aldrig om', () => {
  it('nya hashar bär algoritmstämpeln i själva värdet', () => {
    expect(QUOTE_CONTENT_HASH_ALG).toBe('sha256-quote-v2');
    expect(signFn).toMatch(/\$\{QUOTE_CONTENT_HASH_ALG\}:\$\{await sha256Hex\(/);
  });

  it('certifikatsidan läser stämpeln från skrivaren, inte ur en egen kopia', () => {
    expect(certPage).toMatch(
      /import \{ QUOTE_CONTENT_HASH_ALG \} from '\.\.\/\.\.\/supabase\/functions\/_shared\/quote-lines'/,
    );
    expect(certPage).toMatch(/hashCoversLines[\s\S]{0,160}hashAlg === QUOTE_CONTENT_HASH_ALG/);
  });

  it('en bar hex (gammal offertsignatur) redovisas som INTE täckande raderna', () => {
    expect(certPage).toMatch(/not the individual line items/);
    expect(certPage).toMatch(/Hash covers/);
  });

  it('sidan påstår inte längre generellt att en matchande hash bevisar hela dokumentet', () => {
    // Den ursprungliga lögnen, ordagrant. Den får aldrig tillbaka.
    expect(certPage).not.toMatch(/a matching hash proves the document has not been altered/);
    expect(certPage).toMatch(/content listed under/);
  });

  it('avtalssignaturer är inte legacy — deras hash har alltid täckt bilagorna', () => {
    expect(contractSignFn).toMatch(/appendices: appendices\.map/);
    expect(certPage).toMatch(/cert\.kind === 'contract' \? true :/);
  });
});
