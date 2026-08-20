import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: the order-to-cash chain must keep its links in COLUMNS, keep its
 * two order status axes apart, and never leave a document half-written.
 *
 * Every property here is the residue of a bug that reached live data
 * (order-to-cash QA 2026-08-20):
 *
 *  1. invoices had no order_id. send_invoice_for_order keyed idempotency on the
 *     text "order:<uuid>" inside invoices.notes — an editable field. Rewriting
 *     the note severed the link and the next call issued a SECOND live invoice
 *     for the same order: a phantom 18 687,50 kr receivable against a customer
 *     who had already paid.
 *
 *  2. manage_quote update deleted every line before inserting the new ones,
 *     with no validation and no transaction. One bad line left a quote with
 *     zero rows — and, because recalc_quote_totals refused to write when the
 *     quote was empty, the OLD total still on the header.
 *
 *  3. manage_orders wrote every value to orders.status. `deliver` on a paid
 *     order overwrote 'paid' with 'delivered' and the money axis lost the only
 *     fact it carried.
 *
 *  4. send_dunning_reminders wrote invoice-shaped rows into dunning_actions,
 *     which belongs to subscription dunning. dry_run skipped the INSERT, so
 *     every rehearsal passed and the first real run rolled itself back.
 */

const root = process.cwd();
const agentExecute = readFileSync(join(root, 'supabase/functions/agent-execute/index.ts'), 'utf8');
const migrationsDir = join(root, 'supabase/migrations');

function migrationContaining(needle: string): string {
  const file = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .reverse()
    .find((f) => readFileSync(join(migrationsDir, f), 'utf8').includes(needle));
  expect(file, `no migration contains ${needle}`).toBeTruthy();
  return readFileSync(join(migrationsDir, file!), 'utf8');
}

/** The body of a named block, from its opening marker to a closing marker. */
function slice(src: string, from: string, to: string): string {
  const start = src.indexOf(from);
  expect(start, `marker not found: ${from}`).toBeGreaterThan(-1);
  const end = src.indexOf(to, start);
  expect(end, `end marker not found after ${from}: ${to}`).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('order → invoice: the link is a column, not prose', () => {
  const sql = migrationContaining('ADD COLUMN IF NOT EXISTS order_id uuid');

  it('invoices.order_id exists with a foreign key to orders', () => {
    expect(sql).toMatch(/ALTER TABLE public\.invoices\s+ADD COLUMN IF NOT EXISTS order_id uuid/);
    expect(sql).toContain('invoices_order_id_fkey');
    expect(sql).toMatch(/REFERENCES public\.orders\(id\)/);
  });

  it('pre-existing invoices are backfilled from the old notes pattern', () => {
    expect(sql).toMatch(/UPDATE public\.invoices/);
    expect(sql).toContain("substring(i.notes from 'order:(");
  });

  const fn = slice(agentExecute, 'async function executeSendInvoiceForOrder', '// 6. Email customer');

  it('idempotency is keyed on invoices.order_id', () => {
    expect(fn).toContain(".eq('order_id', order_id)");
  });

  it('the notes scan is only a fallback — and repairs the row when it hits', () => {
    const columnLookup = fn.indexOf(".eq('order_id', order_id)");
    const notesLookup = fn.indexOf("ilike('notes'");
    expect(columnLookup, 'the column lookup must come first').toBeLessThan(notesLookup);
    // When the legacy scan finds an invoice, the link is written to the column
    // so prose is never consulted for that invoice again.
    expect(fn).toMatch(/update\(\{ order_id \}\)/);
  });

  it('a newly created invoice stores order_id', () => {
    expect(fn).toMatch(/orderIdColumn \? \{ order_id \} : \{\}/);
  });

  it('reuse is reported, not silently passed off as a fresh send', () => {
    const tail = slice(agentExecute, '  // 7. Audit trail', '// Blog posts management');
    expect(tail).toContain('reused_existing_invoice');
  });
});

describe('quote lines: validate before you delete', () => {
  const quotesCase = slice(agentExecute, "    case 'quotes': {", "    case 'expenses': {");

  it('rows are built and validated by a function that does not write', () => {
    expect(quotesCase).toContain('const buildQuoteItemRows = async');
    const builder = slice(quotesCase, 'const buildQuoteItemRows = async', 'const insertQuoteItems = async');
    expect(builder, 'the builder must not touch quote_items').not.toContain("from('quote_items')");
    // Unknown product is an error, never an empty 0 kr line.
    expect(builder).toContain("from('products')");
    expect(builder).toMatch(/not found|no product matches/);
  });

  it('update builds every new row BEFORE deleting the old ones', () => {
    const update = slice(quotesCase, "if (action === 'update')", "if (action === 'add_item')");
    const build = update.indexOf('buildQuoteItemRows');
    const del = update.indexOf(".delete().eq('quote_id'");
    expect(build, 'update must build rows').toBeGreaterThan(-1);
    expect(del, 'update must still replace the lines').toBeGreaterThan(-1);
    expect(build, 'build must precede delete — a rejected line leaves the quote intact').toBeLessThan(del);
  });

  it('quote → order conversion exists, copies tax, and links the quote', () => {
    const convert = slice(quotesCase, "if (action === 'convert_to_order')", 'throw new Error(`Unknown quotes action');
    expect(convert).toContain('quote_id: qid');
    expect(convert).toContain('tax_cents');
    expect(convert).toContain('tax_rate');
    // Idempotent: one order per quote.
    expect(convert).toContain(".eq('quote_id', qid)");
  });

  it('orders.quote_id exists with a foreign key to quotes', () => {
    const sql = migrationContaining('ADD COLUMN IF NOT EXISTS quote_id uuid');
    expect(sql).toMatch(/REFERENCES public\.quotes\(id\)/);
  });
});

describe('recalc_quote_totals can say zero', () => {
  const sql = migrationContaining('FUNCTION public.recalc_quote_totals()');

  it('has no item-count guard that would keep a stale total on an empty quote', () => {
    const body = slice(sql, 'CREATE OR REPLACE FUNCTION public.recalc_quote_totals()', '$function$;');
    expect(body).not.toMatch(/IF\s+v_item_count\s*>\s*0\s+THEN/i);
    expect(body).toMatch(/UPDATE public\.quotes/);
  });
});

describe('an order has two status axes and nothing writes across', () => {
  const orders = slice(agentExecute, "if (skillName === 'manage_orders')", "// check_order / lookup_order");

  it('fulfillment values and payment values are separate sets', () => {
    expect(orders).toContain('const FULFILLMENT_AXIS');
    expect(orders).toContain('const PAYMENT_AXIS');
    for (const v of ['picked', 'packed', 'shipped', 'delivered']) {
      expect(orders, `${v} must be on the fulfillment axis`).toMatch(new RegExp(`${v}:\\s*\\{`));
    }
    for (const v of ['pending', 'paid', 'refunded', 'cancelled']) {
      expect(orders, `${v} must be on the payment axis`).toContain(`'${v}'`);
    }
  });

  it('a fulfillment update writes fulfillment_status and never orders.status', () => {
    const update = slice(orders, "if (action === 'update_status'", "if (action === 'timeline'");
    const branch = slice(update, 'if (isFulfillment) {', '} else {');
    expect(branch).toContain('updates.fulfillment_status = value');
    expect(branch, 'shipping an order must not touch whether it is paid').not.toContain('updates.status');
    // and it stamps the fulfillment timeline the handler used to leave empty
    expect(update).toContain('shipped_at');
    expect(update).toContain('delivered_at');
    // tracking is no longer dropped on the floor
    expect(update).toContain('updates.tracking_number');
  });

  it('an unknown value is rejected with the valid values per axis', () => {
    const update = slice(orders, "if (action === 'update_status'", "if (action === 'timeline'");
    expect(update).toMatch(/Unknown order status/);
    expect(update).toContain('Payment/lifecycle axis');
    expect(update).toContain('Fulfillment axis');
  });

  it('revenue is counted on the money axis only', () => {
    const stats = slice(orders, "if (action === 'stats')", 'return { error: `Unknown orders action');
    expect(stats).toContain("o.status === 'paid'");
    expect(stats, "'delivered' is a fulfillment value and cannot be revenue").not.toContain("o.status === 'delivered'");
  });
});

describe('invoice dunning has its own ledger', () => {
  const sql = migrationContaining('CREATE TABLE IF NOT EXISTS public.invoice_dunning_actions');

  it('the new table carries the invoice flow\'s own columns', () => {
    for (const col of ['invoice_id', 'step_name', 'executed_at']) {
      expect(sql, `invoice_dunning_actions.${col}`).toContain(col);
    }
    expect(sql).toMatch(/REFERENCES public\.invoices\(id\)/);
  });

  it('send_dunning_reminders writes there, not into the subscription table', () => {
    const fnBody = slice(sql, 'CREATE OR REPLACE FUNCTION public.send_dunning_reminders', '$function$;');
    expect(fnBody).toContain('INSERT INTO public.invoice_dunning_actions');
    expect(fnBody, 'the subscription ledger is off-limits to the invoice sweep')
      .not.toMatch(/INSERT INTO public\.dunning_actions/);
  });

  it('the subscription table is left exactly as it was', () => {
    expect(sql, 'never reshape a table another flow owns')
      .not.toMatch(/ALTER TABLE public\.dunning_actions\s+(ADD|DROP|RENAME)/);
  });

  it('one reminder per invoice per step per day is enforced by an index', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_dunning_actions_step_per_day/);
  });
});

describe('overdue means overdue', () => {
  const invoices = slice(agentExecute, "    case 'invoices': {", "    case 'social_posts': {");
  const overdue = slice(invoices, "if (action === 'overdue')", "if (action === 'create')");

  it('filters on issued + unpaid + past due, not on "recent"', () => {
    expect(overdue).toContain("in('status', ['sent', 'overdue'])");
    expect(overdue).toContain("lt('due_date'");
    expect(overdue).toContain("is('paid_at', null)");
  });

  it('invoice_overdue_check reaches that branch instead of falling through to list', () => {
    expect(invoices).toContain("skillName === 'invoice_overdue_check'");
  });
});

describe('an omitted currency asks the platform', () => {
  const sql = migrationContaining('FUNCTION public.platform_default_currency()');

  it('create_manual_subscription has no hardcoded currency default', () => {
    const fn = slice(sql, 'CREATE OR REPLACE FUNCTION public.create_manual_subscription', 'END $function$;');
    expect(fn).toMatch(/_currency text DEFAULT NULL/);
    expect(fn).toContain('public.platform_default_currency()');
    // Comments may quote the old literals (that history is the point); CODE may not.
    const code = fn.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(code, 'no literal currency may appear in executable SQL')
      .not.toMatch(/'(EUR|USD|SEK|eur|usd|sek)'/);
  });

  it('the resolver reads the platform setting before anything else', () => {
    const fn = slice(sql, 'CREATE OR REPLACE FUNCTION public.platform_default_currency()', '$$;');
    expect(fn).toContain("key = 'platform_locale'");
    expect(fn, 'the last resort is the database\'s own column default, not a literal')
      .toContain('pg_get_expr');
  });
});
