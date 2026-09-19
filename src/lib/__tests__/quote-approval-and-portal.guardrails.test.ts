import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Parity round 2026-09-19, quotes. Approval chains never reached quotes, and
 * the single-rule path did not hold together: the "pending approval is not
 * sent" rule lived in two callers, a quote above the threshold could be sent
 * without anyone asking, and an APPROVED quote stayed `pending_approval`, which
 * the admin send refuses — it could never be sent from the UI.
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

describe('a quote is sent when its approval is done', () => {
  it('the rule lives on the table: a send needs an approved request that covers the amount', () => {
    const b = latestFunctionBody('quote_send_needs_its_approval');
    expect(b).toMatch(/OLD\.status::text NOT IN \('draft', 'pending_approval'\)/);
    expect(b).toMatch(/r\.amount_cents >= COALESCE\(NEW\.total_cents, 0\)/);
    expect(b).toMatch(/NOT v_has_chain OR r\.chain_id IS NOT NULL/);
    expect(b).toMatch(/evaluate_approval_required\('quote'/);
    expect(migrations).toMatch(/CREATE TRIGGER quote_send_needs_its_approval\s+BEFORE UPDATE OF status ON public\.quotes/);
  });

  it('the decision lands on the quote — approved or rejected, it is a draft again', () => {
    const b = latestFunctionBody('sync_quote_on_approval');
    expect(b).toMatch(/IN \('approved', 'rejected'\)/);
    expect(b).toMatch(/SET status = 'draft'/);
    expect(b).toMatch(/approval_request_id = NEW\.id/);
    expect(migrations).toMatch(/CREATE TRIGGER trg_sync_quote_on_approval\s+AFTER UPDATE OF status ON public\.approval_requests/);
  });

  it('one door: the chain when one exists, the single rule otherwise', () => {
    const b = latestFunctionBody('request_quote_approval');
    expect(b).toMatch(/FROM public\.quotes WHERE id = p_quote_id FOR UPDATE/);
    expect(b).toMatch(/public\.request_entity_approval\('quote'/);
    expect(b).toMatch(/evaluate_approval_required\('quote'/);
    expect(b).toMatch(/p_only_if_required/);
  });

  it('both callers go through the door and carry no rule of their own', () => {
    const edge = read('supabase/functions/agent-execute/index.ts');
    const i = edge.indexOf("if (action === 'request_approval') {");
    const branch = edge.slice(i, edge.indexOf("if (action === 'list_templates')", i));
    expect(branch).toMatch(/rpc\('request_quote_approval'/);
    expect(branch).not.toMatch(/from\('approval_requests'\)\.insert/);
    const hook = read('src/hooks/useQuoteWorkflow.ts');
    expect(hook).toMatch(/rpc\('request_quote_approval' as never/);
    expect(hook).not.toMatch(/update\(\{ status: 'pending_approval'/);
  });

  it('an approval covers an amount — for every entity type', () => {
    const b = latestFunctionBody('request_entity_approval');
    expect(b).toMatch(/v_existing\.amount_cents >= p_amount_cents/);
  });

  it('an operator can build a chain for quotes', () => {
    expect(read('src/pages/admin/ApprovalChainsPage.tsx')).toMatch(/const ENTITY_TYPES = \[[^\]]*'quote'/);
  });
});

describe('the customer sees their quotes in the portal', () => {
  it('through a function that answers only what was sent to them', () => {
    const b = latestFunctionBody('my_quotes');
    expect(b).toMatch(/lower\(q\.customer_email\) = v_email/);
    expect(b).toMatch(/IN \('sent', 'viewed', 'accepted', 'rejected', 'expired'\)/);
    expect(b).not.toMatch(/'notes'|approval_request_id|owner_id|discount/);
    expect(migrations).toMatch(/REVOKE ALL ON FUNCTION public\.my_quotes\(\) FROM PUBLIC, anon;\s+GRANT EXECUTE ON FUNCTION public\.my_quotes\(\) TO authenticated;/);
  });

  it('no row policy opens the quotes table to customers', () => {
    const policies = [...migrations.matchAll(/CREATE POLICY "([^"]+)"\s+ON public\.quotes\b[\s\S]*?;/g)].map((m) => m[0]);
    for (const p of policies) expect(p, 'quotes policies stay staff-only').not.toMatch(/customer_email|auth\.jwt\(\)/);
  });

  it('the page is routed and sits in the portal nav behind the quotes module', () => {
    expect(read('src/App.tsx')).toMatch(/\{ path: "quotes", element: <MyQuotesPage \/> \}/);
    const layout = read('src/pages/account/AccountLayout.tsx');
    expect(layout).toMatch(/quotesEnabled \? quotesNav : \[\]/);
    expect(read('src/pages/account/MyQuotesPage.tsx')).toMatch(/to=\{`\/quote\/\$\{q\.accept_token\}`\}/);
  });
});
