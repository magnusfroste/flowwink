import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: where an invoice came from is the business's note, not the
 * customer's (2026-11-19).
 *
 * The customer's invoice page read "Notes — Generated from contract <uuid>".
 * Four SQL functions and one admin dialog wrote provenance into invoices.notes,
 * the field the page and the PDF print. The rule is the row's: a trigger moves
 * such a line to invoices.origin_note whoever writes it, so the next writer is
 * covered without knowing.
 */
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf-8');
const sql = read('supabase/migrations/20261119180000_var-fakturan-kom-ifran-ar-foretagets-anteckning.sql');

describe('where an invoice came from is internal', () => {
  it('the rule is a trigger on every insert, not a fix per writer', () => {
    expect(sql).toMatch(/CREATE TRIGGER aa_invoices_origin_is_internal\s+BEFORE INSERT ON public\.invoices/);
    expect(sql).toMatch(/NEW\.origin_note := /);
    expect(sql).toMatch(/NEW\.notes := v\.customer_notes/);
  });

  it('what a customer can use stays, and a person\'s own note is never touched', () => {
    expect(sql).toMatch(/customer_notes IS DISTINCT FROM 'PO: 4711'/);
    expect(sql).toMatch(/a note a person wrote was touched/);
  });

  it('an issued invoice is left as it was sent — only drafts are cleaned', () => {
    const update = sql.slice(sql.indexOf('UPDATE public.invoices i'), sql.indexOf('CREATE OR REPLACE FUNCTION public.bulk_invoice_from_timesheets'));
    expect(update).toMatch(/d\.status = 'draft'/);
  });

  it('the customer\'s page and the PDF never read origin_note', () => {
    expect(read('src/pages/PublicInvoicePage.tsx')).not.toMatch(/origin_note/);
    expect(read('supabase/functions/generate-invoice-pdf/index.ts')).not.toMatch(/origin_note/);
  });

  it('the timesheet invoice asks the one number series', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.bulk_invoice_from_timesheets'));
    expect(fn).toMatch(/next_document_number\('invoice', 'INV'\)/);
    expect(fn).not.toMatch(/LPAD\(v_nextnum/);
  });
});
