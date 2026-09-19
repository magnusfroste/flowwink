import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Parity round 2026-09-19, purchasing. Three capabilities had a table and a
 * panel but no door for an agent (amend a sent order, vendor rating, dispute /
 * credit memo) — and behind the panel "Apply" on a vendor credit memo set a
 * status and booked nothing, while pay_vendor_invoice paid the bill in full.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => read(`supabase/migrations/${f}`)).join('\n');

/** The body of the LAST definition of a function — what a fresh install ends up with. */
function latestFunctionBody(fn: string): string {
  const start = migrations.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
  expect(start, `${fn} is defined in a migration`).toBeGreaterThan(-1);
  return migrations.slice(start, migrations.indexOf('$function$;', start));
}

describe('a credit from the vendor reduces the debt', () => {
  it('applying a credit memo books it: payables debited, the VAT share reversed', () => {
    const b = latestFunctionBody('apply_vendor_credit_memo');
    expect(b).toMatch(/FOR UPDATE/);
    expect(b).toMatch(/account_for\('accounts_payable'\)/);
    expect(b).toMatch(/v_memo\.amount_cents::numeric \* v_inv\.tax_cents \/ v_inv\.total_cents/);
    expect(b).toMatch(/would exceed invoice/);
    expect(b).toMatch(/'vendor_credit_memo'/);
  });

  it('the table refuses "applied" without the booking — every writer obeys', () => {
    const b = latestFunctionBody('vendor_credit_memo_applied_means_booked');
    expect(b).toMatch(/flowwink\.credit_memo_apply/);
    expect(b).toMatch(/it is final/);
    expect(migrations).toMatch(/CREATE TRIGGER vendor_credit_memo_applied_means_booked\s+BEFORE INSERT OR UPDATE ON public\.vendor_credit_memos/);
    const hook = read('src/hooks/useVendorDisputes.ts');
    expect(hook).toMatch(/rpc\('apply_vendor_credit_memo'/);
    expect(hook).not.toMatch(/update\(\{ status: 'applied'/);
  });

  it('the payment locks the bill, refuses under open dispute and nets applied credits', () => {
    const b = latestFunctionBody('pay_vendor_invoice');
    expect(b).toMatch(/WHERE id = p_vendor_invoice_id FOR UPDATE/);
    expect(b).toMatch(/is under dispute/);
    expect(b).toMatch(/v_pay := v_inv\.total_cents - v_credited/);
  });

  it('the three-way match counts credits, for the bill and for its siblings', () => {
    expect(latestFunctionBody('po_invoiced_value_cents')).toMatch(/vendor_invoice_credited_net_cents\(vi\.id\)/);
    expect(migrations).toMatch(/anchor missing in vendor_invoice_match_eval/);
    expect(migrations).toMatch(/v_inv\.subtotal_cents := v_inv\.subtotal_cents - public\.vendor_invoice_credited_net_cents\(p_invoice_id\)/);
  });
});

describe('an order changes through one door', () => {
  it('the amendment and its revision are one transaction under the order lock', () => {
    const b = latestFunctionBody('amend_purchase_order');
    expect(b).toMatch(/FROM public\.purchase_orders WHERE id = p_purchase_order_id FOR UPDATE/);
    expect(b).toMatch(/is below the % already received/);
    expect(b).toMatch(/a price is never guessed/);
    expect(b).toMatch(/Nothing changed/);
    expect(b).toMatch(/INSERT INTO public\.purchase_order_revisions/);
    expect(b).toMatch(/v_covered < v_new_total/);
  });

  it('the general update names the door instead of pointing at the editor', () => {
    const src = read('supabase/functions/agent-execute/index.ts');
    expect(src).toMatch(/Use amend_purchase_order\(\{p_purchase_order_id, p_reason, p_lines\}\)/);
    expect(src).not.toMatch(/edit the lines in the purchase order editor/);
  });
});

describe('the doors are skills', () => {
  it('every new function is declared with the exact parameter names it takes', () => {
    type Seed = { name: string; handler: string; tool_definition: { function: { parameters: { properties: Record<string, unknown> } } } };
    const artifact = JSON.parse(read('supabase/seed/module-skills.json')) as { modules: Array<{ skills: Seed[] }> };
    const skills = artifact.modules.flatMap((m) => m.skills);
    for (const name of ['amend_purchase_order', 'list_po_revisions', 'vendor_scorecard', 'rate_vendor',
      'open_vendor_dispute', 'resolve_vendor_dispute', 'issue_vendor_credit_memo', 'apply_vendor_credit_memo']) {
      const skill = skills.find((s) => s.name === name);
      expect(skill, `${name} is seeded`).toBeTruthy();
      expect(skill!.handler).toBe(`rpc:${name}`);
      const head = migrations.slice(migrations.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}(`));
      const signature = head.slice(0, head.indexOf('RETURNS'));
      for (const param of Object.keys(skill!.tool_definition.function.parameters.properties)) {
        expect(signature, `${name} takes ${param}`).toContain(param);
      }
    }
  });

  it('a bill has at most one open dispute, by index', () => {
    expect(migrations).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS vendor_invoice_disputes_one_open\s+ON public\.vendor_invoice_disputes \(vendor_invoice_id\) WHERE status = 'open'/);
  });
});
