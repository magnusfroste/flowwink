import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  canConvertQuoteToInvoice,
  decideQuoteSave,
  mapQuoteItemRow,
  resolveQuoteLines,
} from '../quote-lines';
import { computeInvoiceTotals } from '@/hooks/useInvoices';

/**
 * Skyddsräcke: ett Spara får ALDRIG radera rader det aldrig läste in.
 *
 * Varför räcket finns (skarpt reproducerat 2026-08-22): offertrader lever på
 * TVÅ ställen. MCP/agent-vägen skriver rader till tabellen `quote_items` (och
 * triggern `recalc_quote_totals` håller offertens totaler i takt med dem),
 * medan admin-UI:t alltid har skrivit JSONB-kolumnen `quotes.line_items` och
 * räknat totalerna själv.
 *
 * En agent-skriven offert har alltså rader i `quote_items` och en TOM
 * `line_items`. Panelen läste den tomma kolumnen, räknade
 * `computeInvoiceTotals([], 0.25)` → 0 och skrev tillbaka både raderna och
 * nollan: en offert på 2 247,50 kr blev 0 kr av ETT klick på Spara, utan att
 * någon ändrat något. QUO-0125 var accepterad OCH betald och renderades i
 * samma panel — ett klick från samma öde.
 *
 * Räcket är fail-closed av princip: varje gren som inte kan BEVISA att raderna
 * lästes vägrar skriva rader och totaler. Att vägra spara går att ta tillbaka;
 * en nollad accepterad offert gör det inte.
 *
 * Sammanslagningen av de två lagren är ett separat beslut — det här testet
 * pinnar bara att blödningen är stoppad så länge båda finns.
 */

const root = process.cwd();
const sheet = readFileSync(join(root, 'src/components/admin/quotes/QuoteDetailSheet.tsx'), 'utf8');
const quotesHook = readFileSync(join(root, 'src/hooks/useQuotes.ts'), 'utf8');

/** Offertlammet ur QA-körningen: en rad, 2 247,50 kr inklusive moms. */
const AGENT_ROW = {
  id: 'row-1',
  description: 'Konsultinsats',
  quantity: 1,
  unit_price_cents: 179800,
  position: 0,
};
const AGENT_QUOTE_TOTAL_CENTS = 224750;

describe('resolveQuoteLines: raderna kommer från den källa som faktiskt bär dem', () => {
  it('tabellen vinner när den har rader — och de raderna är inte panelens att redigera', () => {
    const resolved = resolveQuoteLines({
      itemsLoaded: true,
      itemRows: [AGENT_ROW],
      jsonbLines: [], // agent-skriven offert: JSONB-kolumnen är tom
    });
    expect(resolved.origin).toBe('quote_items');
    expect(resolved.items).toHaveLength(1);
    expect(resolved.items[0].unit_price_cents).toBe(179800);
    expect(resolved.editable).toBe(false);
  });

  it('rader från tabellen sorteras på position, inte på hämtordning', () => {
    const resolved = resolveQuoteLines({
      itemsLoaded: true,
      itemRows: [
        { ...AGENT_ROW, id: 'b', description: 'B', position: 1 },
        { ...AGENT_ROW, id: 'a', description: 'A', position: 0 },
      ],
      jsonbLines: [],
    });
    expect(resolved.items.map((i) => i.description)).toEqual(['A', 'B']);
  });

  it('admin-komponerade offerter faller tillbaka på JSONB-kolumnen och är redigerbara', () => {
    const resolved = resolveQuoteLines({
      itemsLoaded: true,
      itemRows: [],
      jsonbLines: [{ description: 'Handskriven', qty: 2, unit_price_cents: 50000 }],
    });
    expect(resolved.origin).toBe('line_items');
    expect(resolved.editable).toBe(true);
  });

  it('en oavslutad läsning svarar "unknown" — aldrig "inga rader"', () => {
    const resolved = resolveQuoteLines({ itemsLoaded: false, itemRows: undefined, jsonbLines: [] });
    expect(resolved.origin).toBe('unknown');
    expect(resolved.editable).toBe(false);
  });

  it('mappningen talar panelens språk: quantity → qty', () => {
    expect(mapQuoteItemRow(AGENT_ROW)).toMatchObject({ qty: 1, unit_price_cents: 179800 });
    expect(mapQuoteItemRow({ discount_pct: 0 })).not.toHaveProperty('discount_pct');
    expect(mapQuoteItemRow({ discount_pct: 10 })).toMatchObject({ discount_pct: 10 });
  });
});

describe('decideQuoteSave: den faktiska nollningen, pinnad', () => {
  it('REPRODUKTIONEN — agent-skriven offert: Spara rör varken rader eller totaler', () => {
    const resolved = resolveQuoteLines({
      itemsLoaded: true,
      itemRows: [AGENT_ROW],
      jsonbLines: [],
    });
    const decision = decideQuoteSave({
      origin: resolved.origin,
      editedLineCount: resolved.items.length,
      loadedLineCount: resolved.items.length,
      currentTotalCents: AGENT_QUOTE_TOTAL_CENTS,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.allowed && decision.writeLines).toBe(false);
  });

  it('den gamla buggens exakta indata (tom JSONB + total på offerten) skriver inga nollor', () => {
    // Så här såg panelens värld ut FÖRE fixen: line_items = [] och en total.
    // Att räkna om ur den listan ger noll — och noll får inte nå databasen.
    expect(computeInvoiceTotals([], 0.25)).toEqual({
      subtotal_cents: 0,
      tax_cents: 0,
      total_cents: 0,
    });
    const decision = decideQuoteSave({
      origin: 'none',
      editedLineCount: 0,
      loadedLineCount: 0,
      currentTotalCents: AGENT_QUOTE_TOTAL_CENTS,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.reason).toMatch(/zero|Nothing was saved/i);
  });

  it('en oläst radlista blockerar hela sparningen (fail closed)', () => {
    const decision = decideQuoteSave({
      origin: 'unknown',
      editedLineCount: 0,
      loadedLineCount: 0,
      currentTotalCents: AGENT_QUOTE_TOTAL_CENTS,
    });
    expect(decision.allowed).toBe(false);
  });

  it('NEGATIVTEST: spärren blockerar inte vanlig redigering', () => {
    const decision = decideQuoteSave({
      origin: 'line_items',
      editedLineCount: 2,
      loadedLineCount: 1,
      currentTotalCents: 100000,
    });
    expect(decision).toEqual({ allowed: true, writeLines: true });
  });

  it('NEGATIVTEST: den som medvetet tar bort alla rader får spara noll', () => {
    // Skillnaden mellan "noll för att ingen läste in något" och "noll för att
    // användaren raderade raderna" är hela poängen — bara den andra får skrivas.
    const decision = decideQuoteSave({
      origin: 'line_items',
      editedLineCount: 0,
      loadedLineCount: 3,
      currentTotalCents: 100000,
    });
    expect(decision).toEqual({ allowed: true, writeLines: true });
  });

  it('NEGATIVTEST: en tom offert utan pengar är inget att skydda', () => {
    const decision = decideQuoteSave({
      origin: 'none',
      editedLineCount: 0,
      loadedLineCount: 0,
      currentTotalCents: 0,
    });
    expect(decision).toEqual({ allowed: true, writeLines: true });
  });
});

describe('canConvertQuoteToInvoice: defekten får inte resa vidare till fakturan', () => {
  it('vägrar konvertera en offert vars rader inte gick att läsa', () => {
    const gate = canConvertQuoteToInvoice({
      origin: 'unknown',
      resolvedLineCount: 0,
      totalCents: AGENT_QUOTE_TOTAL_CENTS,
    });
    expect(gate.ok).toBe(false);
  });

  it('vägrar konvertera en offert med total men utan läsbara rader', () => {
    const gate = canConvertQuoteToInvoice({
      origin: 'none',
      resolvedLineCount: 0,
      totalCents: AGENT_QUOTE_TOTAL_CENTS,
    });
    expect(gate.ok).toBe(false);
  });

  it('NEGATIVTEST: agent-skrivna rader konverteras precis som vanligt', () => {
    expect(
      canConvertQuoteToInvoice({
        origin: 'quote_items',
        resolvedLineCount: 1,
        totalCents: AGENT_QUOTE_TOTAL_CENTS,
      }),
    ).toEqual({ ok: true });
  });
});

describe('panelen och hooken är faktiskt kopplade till spärren', () => {
  it('QuoteDetailSheet läser BÅDA källorna', () => {
    expect(sheet).toContain('useQuoteItems');
    expect(sheet).toContain('resolveQuoteLines');
  });

  it('handleSave frågar spärren innan något skrivs', () => {
    const start = sheet.indexOf('const handleSave');
    const end = sheet.indexOf('const handleStatusChange');
    expect(start).toBeGreaterThan(-1);
    const body = sheet.slice(start, end);
    expect(body).toContain('decideQuoteSave');
    expect(body).toMatch(/if \(!decision\.allowed\)[\s\S]{0,120}return;/);
    // Rader, tax_rate och totaler skrivs BARA innanför writeLines-grenen.
    expect(body).toMatch(/if \(decision\.writeLines\) \{[\s\S]*payload\.line_items[\s\S]*Object\.assign\(payload, totals\)/);
    const beforeGate = body.slice(0, body.indexOf('decideQuoteSave'));
    expect(beforeGate).not.toContain('updateQuote.mutate');
  });

  it('formuläret seedas aldrig från en halvläst radlista', () => {
    expect(sheet).toMatch(/if \(resolvedLines\.origin === 'unknown'\) return;/);
  });

  it('useUpdateQuote vägrar räkna om totaler när raderna bor i quote_items', () => {
    const start = quotesHook.indexOf('export function useUpdateQuote');
    const end = quotesHook.indexOf('export function useDeleteQuote');
    const body = quotesHook.slice(start, end);
    expect(body).toContain("from('quote_items')");
    expect(body).toMatch(/itemCount[\s\S]{0,80}> 0[\s\S]{0,200}throw new Error/);
    // En misslyckad läsning får inte tolkas som "inga rader".
    expect(body).toMatch(/itemCountErr[\s\S]{0,200}throw new Error/);
  });

  it('konverteringen till faktura går via samma upplösning', () => {
    const start = quotesHook.indexOf('export function useConvertQuoteToInvoice');
    const body = quotesHook.slice(start);
    expect(body).toContain('resolveQuoteLines');
    expect(body).toContain('canConvertQuoteToInvoice');
    expect(body).toMatch(/line_items: invoiceLines/);
    expect(body).not.toMatch(/line_items: quote\.line_items/);
  });
});
