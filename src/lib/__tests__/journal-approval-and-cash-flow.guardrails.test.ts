import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Parity round 2026-09-19, accounting: approval of manual journal entries, a
 * cash-flow forecast, and an admin surface for consolidation. The rules that
 * must survive the next rewrite.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => read(`supabase/migrations/${f}`)).join('\n');

function latestFunctionBody(fn: string): string {
  const start = migrations.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
  expect(start, `${fn} is defined in a migration`).toBeGreaterThan(-1);
  return migrations.slice(start, migrations.indexOf('$function$;', start));
}

describe('a manual journal entry above an approval rule waits for approval', () => {
  it('"manual" has one definition, and the UI and agent sources are in it', () => {
    const b = latestFunctionBody('journal_entry_is_manual');
    for (const source of ['manual', 'upload', 'mcp', 'chat', 'flowpilot', 'agent']) expect(b).toContain(`'${source}'`);
    // The sources the callers actually write are the ones listed.
    expect(read('src/hooks/useAccounting.ts')).toMatch(/source: input\.source \|\| 'manual'/);
    const edge = read('supabase/functions/agent-execute/index.ts');
    expect(edge).toMatch(/_callerAgent === 'chat' \? 'chat'[\s\S]{0,200}: 'agent'\);/);
  });

  it('the check runs when the lines are committed — header and lines are two requests', () => {
    expect(migrations).toMatch(/CREATE CONSTRAINT TRIGGER journal_entry_manual_waits_for_approval\s+AFTER INSERT ON public\.journal_entry_lines\s+DEFERRABLE INITIALLY DEFERRED/);
    const b = latestFunctionBody('journal_entry_manual_waits_for_approval');
    expect(b).toMatch(/NOT public\.journal_entry_is_manual\(v_je\.source\)/);
    expect(b).toMatch(/SET status = 'draft'/);
    expect(b).toMatch(/request_journal_entry_approval_internal/);
  });

  it('a draft is posted only with an approval that covers its amount', () => {
    const b = latestFunctionBody('journal_entry_post_needs_its_approval');
    expect(b).toMatch(/OLD\.status = 'draft' AND NEW\.status = 'posted'/);
    expect(b).toMatch(/journal_entry_approval_covered\(NEW\.id, v_amount\)/);
    expect(latestFunctionBody('journal_entry_approval_covered')).toMatch(/r\.amount_cents >= p_amount_cents/);
    expect(migrations).toMatch(/CREATE TRIGGER journal_entry_post_needs_its_approval\s+BEFORE UPDATE OF status ON public\.journal_entries/);
  });

  it('both callers read the entry back and say when it is held', () => {
    const edge = read('supabase/functions/agent-execute/index.ts');
    expect(edge).toMatch(/approval_required: true, \.\.\.heldForApproval/);
    expect(read('src/hooks/useAccounting.ts')).toMatch(/Saved as draft — awaiting approval/);
  });

  it('operators can set a rule or a chain for journal entries, and a draft can be posted from the UI', () => {
    expect(read('src/pages/admin/ApprovalsPage.tsx')).toMatch(/<SelectItem value="journal_entry">/);
    expect(read('src/pages/admin/ApprovalChainsPage.tsx')).toMatch(/const ENTITY_TYPES = \[[^\]]*'journal_entry'/);
    expect(read('src/components/admin/accounting/JournalEntryDetail.tsx')).toMatch(/entry\.status === 'draft' && <DraftEntryActions/);
    const actions = read('src/components/admin/accounting/DraftEntryActions.tsx');
    expect(actions).toMatch(/'request_journal_entry_approval'/);
    expect(actions).toMatch(/'post_journal_entry'/);
  });
});

describe('the cash-flow forecast', () => {
  it('starts from the posted bank and cash balance and nets applied supplier credits', () => {
    const b = latestFunctionBody('cash_flow_forecast');
    expect(b).toMatch(/role IN \('bank', 'cash_register'\)/);
    expect(b).toMatch(/e\.status = 'posted' AND e\.entry_date <= CURRENT_DATE/);
    expect(b).toMatch(/vendor_credit_memos m\s+WHERE m\.vendor_invoice_id = vi\.id AND m\.status = 'applied'/);
    expect(b).toMatch(/'not_included'/);
    expect(b).toMatch(/'not_converted_currencies'/);
  });

  it('has both surfaces', () => {
    type Seed = { name: string; handler: string };
    const artifact = JSON.parse(read('supabase/seed/module-skills.json')) as { modules: Array<{ skills: Seed[] }> };
    const skills = artifact.modules.flatMap((m) => m.skills);
    for (const name of ['cash_flow_forecast', 'request_journal_entry_approval', 'post_journal_entry', 'consolidation_report']) {
      expect(skills.find((s) => s.name === name)?.handler, name).toBe(`rpc:${name}`);
    }
    const page = read('src/pages/admin/AccountingPage.tsx');
    expect(page).toMatch(/<TabsContent value="cashflow"><CashFlowTab \/><\/TabsContent>/);
    expect(page).toMatch(/<TabsContent value="consolidation"><ConsolidationTab \/><\/TabsContent>/);
    expect(read('src/components/admin/accounting/ConsolidationTab.tsx')).toMatch(/rpc\('consolidation_report' as never/);
  });
});
