/**
 * Ownership flows down the chain, so nobody sets it twice.
 *
 * Step 1 on top of 20260808300000: a salesperson owns the lead, the deal on
 * that lead is theirs, the quote on that deal is theirs. One decision, at the
 * top. Two rules carry the design:
 *
 *   - Inheritance OUTRANKS the creator. An admin creating a deal on Anna's
 *     lead hands it to Anna, not to themselves.
 *   - Inheritance applies on the agent path. "Never guess" (step 0) means the
 *     creator-fallback stays off under the service role — but the lead's owner
 *     is a human decision already made, and inheriting it is not guessing.
 *
 * Proven live on optic, six directions in a rolled-back transaction: agent
 * deal on an owned lead inherits; admin deal on Anna's lead goes to Anna;
 * agent deal on an unowned lead stays NULL; quote inherits via deal, via
 * lead, and stays NULL with neither.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OWNERSHIP } from '@/lib/ownership';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const sql = read('supabase/migrations/20260808310000_ownership-inheritance.sql');

describe('the priority order is explicit > inherited > creator > null', () => {
  it('deals inherit from their lead before falling back to the creator', () => {
    const deals = sql.slice(sql.indexOf("TG_TABLE_NAME = 'deals'"), sql.indexOf("TG_TABLE_NAME = 'quotes'"));
    const inherit = deals.indexOf('SELECT assigned_to INTO NEW.owner_id');
    const creator = deals.indexOf('NEW.owner_id := v_uid');
    expect(inherit).toBeGreaterThan(-1);
    expect(creator).toBeGreaterThan(inherit);
  });

  it('quotes try the deal first, then the lead, then the creator', () => {
    const quotes = sql.slice(sql.indexOf("TG_TABLE_NAME = 'quotes'"));
    const viaDeal = quotes.indexOf('SELECT owner_id INTO NEW.owner_id FROM public.deals');
    const viaLead = quotes.indexOf('SELECT assigned_to INTO NEW.owner_id FROM public.leads');
    const creator = quotes.indexOf('NEW.owner_id := v_uid');
    expect(viaDeal).toBeGreaterThan(-1);
    expect(viaLead).toBeGreaterThan(viaDeal);
    expect(creator).toBeGreaterThan(viaLead);
  });

  it('inheritance runs unconditionally; only the creator-fallback checks v_uid', () => {
    // The step-0 shape was an early `IF v_uid IS NULL THEN RETURN NEW` — under
    // that, an agent-created deal on Anna's lead would stay unowned. Inheriting
    // a human decision is not guessing.
    expect(sql).not.toMatch(/IF v_uid IS NULL THEN\s*\n\s*RETURN NEW/);
    expect(sql).toMatch(/IF NEW\.owner_id IS NULL AND v_uid IS NOT NULL THEN/);
  });
});

describe('quotes joins the ownership family properly', () => {
  it('gets a real column with SET NULL, not a join-time derivation', () => {
    // SET NULL puts it in the family delete-user handles automatically —
    // the NO ACTION families are the ones that block (see 20260808290000).
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth\.users\(id\) ON DELETE SET NULL/);
  });

  it('gets its trigger', () => {
    expect(sql).toMatch(/CREATE TRIGGER quotes_assign_owner\s+BEFORE INSERT ON public\.quotes/);
  });

  it('is in the ownership map, so the chip cannot spell the wrong column', () => {
    expect(OWNERSHIP.quotes.column).toBe('owner_id');
  });

  it('shows the owner in the quotes list', () => {
    expect(read('src/pages/admin/QuotesPage.tsx')).toMatch(
      /<OwnerChip entity="quotes" recordId=\{q\.id\} ownerId=\{q\.owner_id\}/,
    );
  });

  it('declares the field on the Quote type', () => {
    expect(read('src/hooks/useQuotes.ts')).toMatch(/owner_id\?: string \| null;/);
  });
});

describe('the backfill flows downhill and never overwrites', () => {
  it('fills deals from leads before quotes from deals', () => {
    const dealsAt = sql.indexOf('UPDATE public.deals d SET owner_id = l.assigned_to');
    const quotesAt = sql.indexOf('UPDATE public.quotes q SET owner_id = d.owner_id');
    expect(dealsAt).toBeGreaterThan(-1);
    expect(quotesAt).toBeGreaterThan(dealsAt);
  });

  it('every backfill is guarded on the owner being NULL', () => {
    for (const m of sql.matchAll(/UPDATE public\.(deals|quotes)[\s\S]{0,200}?;/g)) {
      expect(m[0]).toMatch(/owner_id IS NULL/);
    }
  });
});

describe('still a lens, still not a rule', () => {
  it('creates no RLS policy', () => {
    expect(sql).not.toMatch(/CREATE POLICY/i);
  });
});
