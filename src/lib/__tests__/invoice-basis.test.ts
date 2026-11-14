import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INVOICE_BASIS_COLUMNS, invoiceBasisCsvRows, invoiceBasisFilename, money, type InvoiceBasisRow } from '@/lib/invoice-basis';
import { generateCSV } from '@/lib/csv-utils';
import { invoicingModule } from '@/lib/modules/invoicing-module';
import { classifyCall } from '../../../supabase/functions/_shared/skills/read-surface';

/**
 * Invoice basis out, the external number back (#862 part 1.1–1.3).
 *
 * The books are kept in another system; the invoices have to reach it once,
 * and only once. No new entity — an issued invoice IS the basis, with three
 * facts on it (ready → exported → confirmed).
 */
const root = join(__dirname, '../../..');
const migration = readFileSync(join(root, 'supabase/migrations/20261114090000_fakturaunderlag-ut.sql'), 'utf-8');

const inv = (o: Partial<InvoiceBasisRow>): InvoiceBasisRow => ({
  invoice_id: 'i1', invoice_number: 'INV-2026-00001', invoice_type: 'invoice', issue_date: '2026-10-05', due_date: '2026-11-04',
  currency: 'SEK', customer_name: 'Anna Andersson', customer_email: 'anna@example.test', org_number: '556000-0000', vat_number: 'SE556000000001',
  company_name: 'Exempel AB', contract_id: null, subscription_id: 's1', tax_rate: 25,
  lines: [{ description: 'Abonnemang oktober', quantity: 2, unit_price_cents: 49950 }, { description: 'Uppstart, "express"', quantity: 1, unit_price_cents: 100000 }],
  subtotal_cents: 199900, tax_cents: 49975, total_cents: 249875, export_status: 'ready', external_ref: null, ...o,
});

describe('invoice basis — the file', () => {
  it('amounts are written one way, whatever the instance locale', () => {
    expect(money(123450)).toBe('1234.50');
    expect(money(5)).toBe('0.05');
    expect(money(-249875)).toBe('-2498.75');   // a credit note
    expect(money(0)).toBe('0.00');
    expect(money(null)).toBe('');              // missing is not zero
  });

  it('one row per line, the invoice repeated on each', () => {
    const rows = invoiceBasisCsvRows([inv({})]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      invoice_number: 'INV-2026-00001', customer_name: 'Exempel AB', org_number: '556000-0000', currency: 'SEK',
      line_no: '1', description: 'Abonnemang oktober', quantity: '2', unit_price: '499.50', line_amount: '999.00', tax_rate: '25',
      invoice_total: '2498.75', subscription_ref: 's1', export_status: 'ready',
    });
    expect(rows[1]).toMatchObject({ line_no: '2', line_amount: '1000.00', invoice_total: '2498.75' });
  });

  it('an invoice without lines is still in the file', () => {
    const rows = invoiceBasisCsvRows([inv({ lines: [], company_name: null })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ invoice_number: 'INV-2026-00001', customer_name: 'Anna Andersson', line_no: '', description: '', line_amount: '' });
  });

  it('the CSV quotes what needs quoting and names its period', () => {
    const csv = generateCSV(invoiceBasisCsvRows([inv({})]), INVOICE_BASIS_COLUMNS);
    const [header, , second] = csv.split('\n');
    expect(header.split(',')).toEqual(INVOICE_BASIS_COLUMNS.map((c) => c.header));
    expect(second).toContain('"Uppstart, ""express"""');
    expect(invoiceBasisFilename('2026-10-01', '2026-10-31', 'ready')).toBe('invoice-basis_2026-10-01_2026-10-31_ready.csv');
  });
});

describe('invoice basis — the contract', () => {
  const skill = (name: string) => {
    const s = invoicingModule.skillSeeds?.find((x) => x.name === name);
    expect(s, name).toBeTruthy();
    return s!;
  };
  const params = (name: string) => Object.keys(((skill(name).tool_definition as { function: { parameters: { properties: Record<string, unknown> } } }).function.parameters.properties));
  const sqlParams = (fn: string) => {
    const m = migration.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(([^)]*)\\)`));
    expect(m, fn).toBeTruthy();
    return [...m![1].matchAll(/\b(p_[a-z_]+)\b/g)].map((x) => x[1]);
  };

  it('every skill names its parameters exactly as its function does', () => {
    for (const name of ['list_invoice_basis', 'mark_invoice_basis_exported', 'confirm_invoice_export']) {
      expect(skill(name).handler).toBe(`rpc:${name}`);
      expect(params(name).sort()).toEqual(sqlParams(name).sort());
    }
  });

  it('the list is a read; the two writes say what they risk and how they are undone', () => {
    expect(classifyCall('list_invoice_basis', {})).toBe('read');
    expect(migration).toMatch(/FUNCTION public\.list_invoice_basis\([\s\S]*?\nSTABLE\n/);
    for (const name of ['mark_invoice_basis_exported', 'confirm_invoice_export']) {
      const def = skill(name).tool_definition as { risk?: string; reversible?: boolean; reversal?: string };
      expect(def.risk).toBe('low');
      expect(def.reversible).toBe(true);
      expect(def.reversal).toBeTruthy();
    }
  });

  it('only an issued invoice is basis', () => {
    expect(migration.match(/NOT IN \('draft', 'cancelled', 'void'\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration).toMatch(/v_inv\.status::text IN \('draft', 'cancelled', 'void'\)/);
  });

  it('the same basis is never imported twice', () => {
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS invoices_external_ref_key\s+ON public\.invoices \(external_ref\) WHERE external_ref IS NOT NULL/);
    // The same reference again is a no-op; another one, or one that belongs elsewhere, is refused.
    expect(migration).toMatch(/IF v_inv\.external_ref = v_ref THEN[\s\S]*?'idempotent', true/);
    expect(migration.match(/'code', 'ALREADY_EXISTS'/g)).toHaveLength(2);
    // A refusal is an answer, not an exception: no `error`, never retried.
    expect(migration).not.toMatch(/jsonb_build_object\('status', 'refused'[^)]*'error'/);
  });

  it('nobody outside Invoicing hands the invoices over, and nothing here names one system', () => {
    for (const fn of ['list_invoice_basis', 'mark_invoice_basis_exported', 'confirm_invoice_export']) {
      const body = migration.slice(migration.indexOf(`FUNCTION public.${fn}(`));
      expect(body.slice(0, body.indexOf('$$;')), fn).toMatch(/IF NOT public\.invoice_basis_caller_ok\(\) THEN/);
      expect(migration).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon;`));
    }
    expect(migration).toMatch(/auth\.role\(\) = 'service_role'[\s\S]*can_access_module\(auth\.uid\(\), 'invoicing'\)/);
    // The platform carries no ledger's name in its code — comments and examples may.
    const code = migration.replace(/--[^\n]*/g, '');
    expect(code).not.toMatch(/fortnox|visma/i);
  });

  it('the admin file is the same read the gateway makes', () => {
    const dialog = readFileSync(join(root, 'src/components/admin/invoices/InvoiceBasisExportDialog.tsx'), 'utf-8');
    expect(dialog).toMatch(/rpc\('list_invoice_basis' as never/);
    expect(dialog).toMatch(/rpc\('mark_invoice_basis_exported' as never/);
    expect(dialog).not.toMatch(/\.from\('invoices'\)/);
  });
});
