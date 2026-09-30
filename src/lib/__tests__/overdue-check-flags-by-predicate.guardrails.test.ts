import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * invoice_overdue_check flags by PREDICATE, not by the rows it read.
 * The listing is capped (200, max 500) and ordered oldest-due first; flagging
 * only the listed rows left the newest past-due invoices 'sent' forever once
 * an instance held more than the cap, and reported the cap as the count
 * (process battery, 2026-09-30). The UPDATE must carry the predicate itself,
 * the count must be exact, and a capped listing must say so.
 */
const src = readFileSync(join(__dirname, '../../../supabase/functions/agent-execute/index.ts'), 'utf8');
const start = src.indexOf("if (action === 'overdue') {");
const block = src.slice(start, src.indexOf("if (action === 'create') {", start));

describe('invoice_overdue_check', () => {
  it('flags every matching invoice with one predicate update, never a list of ids', () => {
    expect(block).toMatch(/\.update\(\{ status: 'overdue'[^]*?\}, \{ count: 'exact' \}\)\s*\.eq\('status', 'sent'\)\.lt\('due_date', today\)\.is\('paid_at', null\)/);
    expect(block).not.toMatch(/\.in\('id', toFlag\)/);
  });

  it('counts exactly and admits a capped listing', () => {
    expect(block).toMatch(/select\('id', \{ count: 'exact', head: true \}\)/);
    expect(block).toMatch(/truncated: overdueCount > rows\.length/);
  });
});
