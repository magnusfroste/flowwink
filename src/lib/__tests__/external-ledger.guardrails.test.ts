import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The books are kept somewhere else (#862 part 1.4, 2026-11-10).
 *
 * A customer keeps the ledger in Fortnox; FlowWink booked every invoice, paid
 * order and vendor invoice anyway — a second set of books nobody asked for.
 * accounting_preferences.ledger = 'external' is the declared fact and
 * books_kept_here() its one reader.
 *
 * Discovered, not enumerated: EVERY trigger function whose latest body books
 * by itself (calls public.book_*) must ask books_kept_here() first — a new
 * automatic booking cannot be added without it.
 */
const root = join(__dirname, '../../..');
const dir = join(root, 'supabase/migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

/** Latest CREATE OR REPLACE body per trigger function. */
function latestTriggerFunctions(): Map<string, { file: string; body: string }> {
  const out = new Map<string, { file: string; body: string }>();
  const re = /CREATE OR REPLACE FUNCTION\s+"?public"?\."?([a-z_0-9]+)"?\s*\(\s*\)\s*RETURNS\s+"?trigger"?[\s\S]*?AS\s+(\$[a-z_]*\$)([\s\S]*?)\2/gi;
  for (const file of files) {
    const sql = readFileSync(join(dir, file), 'utf-8');
    for (const m of sql.matchAll(re)) out.set(m[1], { file, body: m[3] });
  }
  return out;
}

describe('external ledger', () => {
  const fns = latestTriggerFunctions();
  const code = (body: string) => body.replace(/--[^\n]*/g, '');

  it('every trigger that books by itself asks whether the books are kept here', () => {
    const bookers = [...fns].filter(([, f]) => /public\.book_[a-z_]+\s*\(/.test(code(f.body)));
    expect(bookers.map(([n]) => n).sort()).toEqual(expect.arrayContaining(
      ['book_vendor_invoice_on_register', 'on_invoice_status_book', 'on_order_paid_book'],
    ));
    const silent = bookers.filter(([, f]) => !/IF NOT public\.books_kept_here\(\) THEN RETURN NEW; END IF;/.test(f.body))
      .map(([n, f]) => `${n} (${f.file})`);
    expect(silent).toEqual([]);
  });

  it('the dial has one reader, and it defaults to keeping the books here', () => {
    const sql = readFileSync(join(dir, '20261110120000_bockerna-fors-nagon-annanstans.sql'), 'utf-8');
    expect(sql).toMatch(/key = 'accounting_preferences'\),\s*'internal'\) <> 'external'/);
    const prefs = readFileSync(join(root, 'src/hooks/useSiteSettings.tsx'), 'utf-8');
    expect(prefs).toMatch(/ledger\?: 'internal' \| 'external';/);
    expect(prefs).toMatch(/ledger: 'internal',/);
    expect(readFileSync(join(root, 'src/components/admin/accounting/SettingsTab.tsx'), 'utf-8'))
      .toMatch(/patch\(\{ ledger: v as AccountingPreferences\['ledger'\] \}\)/);
  });

  it('sending an invoice is never refused for lack of an accounting grant', () => {
    const body = fns.get('on_invoice_status_book')!.body;
    const sent = body.slice(body.indexOf("IF NEW.status = 'sent'::invoice_status THEN", body.indexOf("TG_OP = 'UPDATE'")));
    expect(sent.slice(0, sent.indexOf("ELSIF NEW.status = 'paid'"))).toMatch(/BEGIN\s+v_res := public\.book_invoice_issued\(NEW\.id\);\s+EXCEPTION WHEN others THEN/);
    // The one deliberate refusal stays.
    expect(sent).toMatch(/LIKE 'No exchange rate%'/);
  });
});
