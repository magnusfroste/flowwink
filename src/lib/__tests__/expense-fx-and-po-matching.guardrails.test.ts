import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expensesModule } from '@/lib/modules/expenses-module';

/**
 * The expense talks currency and knows its purchase order.
 *
 * Until 2026-10-07 book_expense_report summed amount_cents straight into the ledger
 * (100 EUR booked as 100 kr; expenses.exchange_rate was set by nothing), and an
 * expense that paid for an order left the order's remaining value untouched, so the
 * vendor's invoice for the same delivery matched "0 % variance" once more. These
 * guards keep the conversion strict (no silent 1:1) and the claim on ONE reader.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const migration = read('supabase/migrations/20261005110000_utlagget-talar-valuta-och-vet-sin-inkopsorder.sql');

describe('expenses in a foreign currency', () => {
  it('a receipt without a rate is kept as missing — never converted 1:1', () => {
    expect(migration).toMatch(/exchange_rate_or_null/);
    expect(migration).toMatch(/NEW\.fx_rate_source := 'missing'/);
    expect(migration).toMatch(/NEW\.base_amount_cents := NULL/);
    // the forgiving lookup (1 for a missing pair) is for revaluations, not receipts
    expect(migration).not.toMatch(/NEW\.exchange_rate := public\.get_exchange_rate/);
  });

  it('the base currency is the platform\'s, not a literal', () => {
    expect(migration).toMatch(/public\.platform_default_currency\(\)/);
    const trigger = migration.slice(migration.indexOf('expense_fx_trg() RETURNS trigger'), migration.indexOf('aa_expense_fx_trg'));
    expect(trigger).not.toMatch(/'SEK'/);
  });

  it('the ledger, the report total and the payout read the base amounts; booking refuses a missing rate', () => {
    for (const fn of ['book_expense_report', 'submit_expense_report', 'mark_expense_report_paid']) {
      const body = migration.slice(migration.indexOf(`FUNCTION public.${fn}(`));
      const end = body.indexOf('$function$;');
      expect(body.slice(0, end)).toMatch(/SUM\(COALESCE\(base_amount_cents, amount_cents\)/);
      expect(body.slice(0, end)).not.toMatch(/SUM\(amount_cents\)/);
    }
    expect(migration).toMatch(/No exchange rate for %s/);
    expect(migration).toMatch(/UPDATE public\.expenses SET currency = currency WHERE report_id = p_report_id AND fx_rate_source = 'missing'/);
  });

  it('the skill tells the agent how currency and a manual rate work', () => {
    const skill = expensesModule.skillSeeds?.find((s) => s.name === 'manage_expenses');
    const props = (skill?.tool_definition as { function: { parameters: { properties: Record<string, unknown> } } }).function.parameters.properties;
    expect(props).toHaveProperty('exchange_rate');
    expect(props).toHaveProperty('purchase_order_id');
    expect(skill?.instructions).toMatch(/base_amount_cents/);
    expect(skill?.instructions).toMatch(/set_exchange_rate/);
  });

  it('the list shows the converted amount and flags a missing rate', () => {
    const list = read('src/components/admin/expenses/ExpensesListTab.tsx');
    expect(list).toContain("fx_rate_source === 'missing'");
    expect(list).toContain('base_amount_cents');
  });
});

describe('expenses that pay for a purchase order', () => {
  it('the claim on an order has ONE reader — po_invoiced_value_cents — and it counts expenses, credits included', () => {
    const body = migration.slice(migration.indexOf('FUNCTION public.po_invoiced_value_cents('), migration.indexOf('COMMENT ON FUNCTION public.po_invoiced_value_cents'));
    expect(body).toMatch(/FROM\s+public\.vendor_invoices vi/);
    expect(body).toMatch(/vendor_invoice_credited_net_cents\(vi\.id\)/);
    expect(body).toMatch(/FROM public\.expenses e[\s\S]*WHERE e\.purchase_order_id = p_purchase_order_id/);
    // the expense evaluation subtracts its own claim rather than keeping a second reader
    expect(migration).toMatch(/v_claimed := public\.po_invoiced_value_cents\(p_purchase_order_id\)/);
    expect(migration).not.toMatch(/po_claimed_value_cents/);
  });

  it('match_expense_to_po refuses a draft order, a missing rate and an over-claim without p_force', () => {
    expect(migration).toMatch(/an expense can only pay for an order that was sent or confirmed/);
    expect(migration).toMatch(/set one before matching/);
    expect(migration).toMatch(/exceeds what remains on %/);
    expect(migration).toMatch(/Only a draft or submitted expense can be matched/);
  });

  it('the status follows the amount (trigger) and the FX trigger runs first', () => {
    expect(migration).toMatch(/CREATE TRIGGER aa_expense_fx_trg/);
    expect(migration).toMatch(/CREATE TRIGGER ab_expense_po_match_trg[\s\S]*UPDATE OF purchase_order_id, amount_cents, vat_cents, currency, exchange_rate/);
  });

  it('is a skill in the expenses module riding the RPC, with a PO picker in the dialog', () => {
    const skill = expensesModule.skillSeeds?.find((s) => s.name === 'match_expense_to_po');
    expect(skill?.handler).toBe('rpc:match_expense_to_po');
    expect(read('src/components/admin/expenses/AddExpenseDialog.tsx')).toContain('purchase_order_id: purchaseOrderId');
    expect(read('src/hooks/useExpenses.ts')).toContain('purchase_order:purchase_orders(po_number)');
  });

  it('the process battery runs both', () => {
    const scenario = read('scripts/process-battery/scenarios/procure-to-pay.ts');
    expect(scenario).toMatch(/'match_expense_to_po'/);
    expect(scenario).toMatch(/no exchange rate for NOK/i);
    expect(scenario).toMatch(/exceeds what remains/);
    expect(scenario).toMatch(/po_invoiced_value_cents\(\$1\)/);
  });
});
