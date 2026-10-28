import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Three things Hermes had to clean up on Nordbrygg (2026-10-25) that a row
 * should never be born with: an invoice without a due date, a subscription in
 * a currency the business does not trade in, and a chat that cannot act.
 */
describe('born right', () => {
  it('an invoice created without a due date gets one from its payment terms', () => {
    const src = read('supabase/functions/agent-execute/index.ts');
    expect(src).toMatch(/const termsDays = Number\(String\(a\.payment_terms \?\? ''\)\.match\(\/\(\\d\{1,3\}\)\/\)\?\.\[1\]\);/);
    expect(src).toMatch(/due_date: a\.due_date \|\| defaultDue,/);
    expect(src).toMatch(/payment_terms: a\.payment_terms \|\| `Net \$\{dueDays\}`,/);
  });
  it('every commercial currency column is upper-cased and defaults to the business currency', () => {
    const sql = read('supabase/migrations/20261027180000_valutan-och-forfallodagen-fods-ratt.sql');
    expect(sql).toMatch(/ALTER TABLE public\.subscriptions ALTER COLUMN currency SET DEFAULT public\.business_currency\(\)/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.normalize_currency\(\)/);
    expect(sql).toMatch(/ARRAY\['invoices', 'quotes', 'subscriptions', 'deals', 'contracts', 'orders', 'service_orders'\]/);
  });
  it('the chat acts and hands off unless switched off — absent means on', () => {
    expect(read('src/hooks/useChat.tsx')).toMatch(/toolCallingEnabled: settings\?\.toolCallingEnabled \?\? true,/);
    expect(read('src/hooks/useChat.tsx')).toMatch(/humanHandoffEnabled: settings\?\.humanHandoffEnabled \?\? true,/);
    const fn = read('supabase/functions/chat-completion/index.ts');
    expect(fn).toMatch(/\(settings\?\.toolCallingEnabled \?\? true\) && provider\.supportsToolCalling/);
    expect(fn).toMatch(/\(settings\?\.humanHandoffEnabled \?\? true\) && provider\.supportsToolCalling/);
    const form = read('src/pages/admin/ChatSettingsPage.tsx');
    expect(form).toMatch(/formData\.toolCallingEnabled \?\? true/);
    expect(form).toMatch(/formData\.humanHandoffEnabled \?\? true/);
    expect(form).not.toMatch(/toolCallingEnabled \?\? false/);
  });
});
