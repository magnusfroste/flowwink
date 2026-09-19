import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * accounting_reports fed the trial balance, the income statement, the balance
 * sheet and the general ledger from ONE unbounded select. PostgREST cuts that at
 * 1 000 rows and says nothing: with 2 322 posted lines the trial balance reported
 * 3.3 M where the ledger held 7.95 M, and "balanced" was luck (process battery,
 * 2026-09-19). The chart (1 262 accounts in se-bas2024) was cut the same way.
 */

const root = join(__dirname, '../../..');
const agentExecute = readFileSync(join(root, 'supabase/functions/agent-execute/index.ts'), 'utf8');
const vatReturn = readFileSync(join(root, 'supabase/functions/_shared/handlers/accounting-vat-return-se.ts'), 'utf8');

describe('the accounting reports read the whole ledger', () => {
  const start = agentExecute.indexOf("const linesRead = await readAllRows<LedgerLine>(supabase, 'journal_entry_lines'");
  const block = agentExecute.slice(start, start + 2600);

  it('lines and chart come through readAllRows, ordered by a unique column', () => {
    expect(start).toBeGreaterThan(-1);
    expect(block).toMatch(/orderBy: 'id'/);
    expect(block).toMatch(/readAllRows<ChartRow>\(supabase, 'chart_of_accounts'/);
  });

  it('a read that could not reach the end refuses instead of reporting a short total', () => {
    expect(block).toMatch(/if \(linesRead\.truncated\) throw new Error\(/);
    expect(block).toMatch(/chartRead\.error \|\| chartRead\.truncated\) throw new Error\(/);
  });

  it('the report branch has no unbounded select on the ledger left', () => {
    const reportBranch = agentExecute.slice(start - 1500, agentExecute.indexOf("if (report_type === 'trial_balance')", start));
    expect(reportBranch).not.toMatch(/await linesQuery;/);
    expect(reportBranch).not.toMatch(/from\('journal_entry_lines'\)\.select\(/);
  });

  it('the VAT return pages in a stable order', () => {
    const i = vatReturn.indexOf(".from('journal_entry_lines')");
    expect(vatReturn.slice(i, i + 700)).toMatch(/\.order\('id', \{ ascending: true \}\)\s*\.range\(/);
  });
});

describe('the journal refuses what the ledger cannot carry', () => {
  it('an entry names only accounts that exist — asked about its own codes, not the whole chart', () => {
    const i = agentExecute.indexOf('const lineCodes = [...new Set(');
    expect(i).toBeGreaterThan(-1);
    const b = agentExecute.slice(i, i + 900);
    expect(b).toMatch(/\.in\('account_code', lineCodes\)/);
    expect(b).toMatch(/Unknown account/);
  });

  it('a void is remembered by the reversal\'s own link, so a closed period cannot hide it', () => {
    const i = agentExecute.indexOf("if (action === 'void') {");
    const b = agentExecute.slice(i, i + 3800);
    expect(b).toMatch(/\.eq\('reverses', entry_id\)/);
    expect(b).toMatch(/if \(original\.reversed_by \|\| priorReversal\)/);
    expect(b).toMatch(/const \{ error: stampErr \}/);
  });
});
