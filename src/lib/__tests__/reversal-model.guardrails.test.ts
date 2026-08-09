import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * A booked verification is never unbooked.
 *
 * Until 2026-08-10, action=void marked the original status='voided' AND wrote a
 * reversal with status='posted'. Every report in the platform filters
 * status='posted', so the original dropped out while its reversal kept counting:
 * each report was wrong by the NEGATIVE of the voided amount. Proven live on dev
 * — book 12 500 kr incl. 25 % VAT, void it, and the VAT return reports boxes
 * 05/10/49 as minus. A voided sale read as a VAT refund, with no error anywhere.
 *
 * The fix is a model, not a patch: the original stays posted, the reversal
 * cancels it, and the link lives in data (reversed_by / reverses) rather than in
 * status. Two mirrored posted entries sum to zero on their own — so correctness
 * stops depending on every future reader remembering to exclude something.
 */

const ROOT = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

const handler = read('supabase/functions/agent-execute/index.ts');
// The create-comment appears earlier in the file for other skills, so anchor the
// end AFTER the void block — a slice that silently ends up empty would make
// every assertion below pass against nothing.
const voidStart = handler.indexOf("if (action === 'void')");
const voidBlock = handler.slice(voidStart, handler.indexOf("// action === 'create'", voidStart));
const migration = read('supabase/migrations/20260810000000_reversal-model-a-booked-entry-is-never-unbooked.sql');
const seed = read('src/lib/modules/accounting-module.ts');

describe('void keeps the original in the books', () => {
  it('the block this file inspects is actually the void handler', () => {
    // Negative control. The first version of this test sliced to a marker that
    // occurs earlier in the file, so voidBlock was '' and four assertions were
    // checking nothing at all.
    expect(voidStart).toBeGreaterThan(0);
    expect(voidBlock.length).toBeGreaterThan(500);
    expect(voidBlock).toMatch(/entry_id is required for void action/);
  });

  it('never rewrites the original entry to a status the reports exclude', () => {
    // The single line that caused it.
    expect(voidBlock).not.toMatch(/update\(\{\s*status:\s*'voided'\s*\}\)/);
    expect(voidBlock).toMatch(/reversed_by: reversal\.id/);
    expect(voidBlock).toMatch(/reverses: entry_id/);
  });

  it('carries the incident where the next reader will meet it', () => {
    expect(voidBlock).toMatch(/a voided sale read as a VAT\s*\/\/ refund/);
    expect(voidBlock).toMatch(/A booked verification is never unbooked/);
  });

  it('refuses a second reversal instead of doubling the error', () => {
    // Reversing twice would leave the books off by the same amount the other
    // way — the exact bug, re-created by hand.
    expect(voidBlock).toMatch(/if \(original\.reversed_by\)/);
    expect(voidBlock).toMatch(/already been reversed/);
    expect(voidBlock).toMatch(/book the fix as a new entry rather than reversing twice/);
  });

  it('says in the response that the original still counts', () => {
    expect(voidBlock).toMatch(/original_status: 'posted'/);
    expect(voidBlock).toMatch(/still posted and still counts/);
  });

  it('dates the reversal today, so a declared period stays declared', () => {
    expect(voidBlock).toMatch(/you do not rewrite a period you\s*\/\/ have already declared/);
  });
});

describe('the link is data, not status', () => {
  it('adds both directions of the link', () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS reversed_by uuid REFERENCES public\.journal_entries\(id\)/);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS reverses\s+uuid REFERENCES public\.journal_entries\(id\)/);
  });

  it('repairs legacy voided entries that DO have a reversal', () => {
    expect(migration).toMatch(/SET reversed_by = p\.reversal_id, status = 'posted'/);
    expect(migration).toMatch(/'Reversal: ' \|\| o\.description/);
  });

  it('and refuses to invent a correction for one that does not', () => {
    // A void with no reversal was a removal, whoever did it. Quietly restoring
    // it to posted would put money back in the books that someone took out.
    expect(migration).toMatch(/inventing a correction for it would be\s*--\s*worse than leaving it out/);
    expect(migration).toMatch(/RAISE WARNING/);
  });
});

describe('the reports need no exception — that is the tell', () => {
  it('the VAT return still simply asks for posted entries', () => {
    const vat = read('supabase/functions/_shared/handlers/accounting-vat-return-se.ts');
    expect(vat).toMatch(/\.eq\('journal_entries\.status', 'posted'\)/);
  });

  it('and so does coverage — one condition, stated once, in both halves', () => {
    const cov = read('supabase/migrations/20260809230000_vat-coverage-counts-what-the-return-counts.sql');
    expect(cov).toMatch(/AND e\.status = 'posted'/);
  });
});

describe('the agent is told what void means before it calls it', () => {
  it('the DESCRIPTION says it does not erase — that is the pre-call tier', () => {
    expect(seed).toMatch(/action=void does NOT erase: a booked verification is never unbooked/);
  });

  it('the instructions name both consequences an agent will actually hit', () => {
    expect(seed).toMatch(/leaves June's VAT return exactly as it was filed/);
    expect(seed).toMatch(/reversing twice is refused/);
  });
});

describe('the UI labels a reversed entry without hiding it', () => {
  const tab = read('src/components/admin/accounting/JournalTab.tsx');
  const hook = read('src/hooks/useAccounting.ts');

  it('shows reversed/reversal from the link, not from status', () => {
    expect(tab).toMatch(/e\.reversed_by \? 'reversed' : e\.reverses \? 'reversal' : e\.status/);
  });

  it('the filter queries the link too, so the list and the books agree', () => {
    expect(hook).toMatch(/statusFilter === 'reversed'/);
    expect(hook).toMatch(/\.not\('reversed_by', 'is', null\)/);
    // The CSV export is the same query in a second place — it drifted before.
    expect(read('src/components/admin/accounting/JournalCsvActions.tsx'))
      .toMatch(/statusFilter === 'reversed'/);
  });
});
