/**
 * Invoice basis for an external ledger (#862 part 1) — the pure half of the
 * CSV in the admin. The rows come from list_invoice_basis(), the same read an
 * agent or a bridge makes over the gateway; this only lays them out.
 *
 * One CSV row per invoice LINE, the invoice's own facts repeated on each, so
 * the file can be read by a ledger's import and by a person in a spreadsheet.
 * Amounts are written in the currency's main unit with a dot (1234.50) — the
 * invoice's `currency` column says which; an importer never has to guess the
 * separator from the instance's locale.
 */

export interface InvoiceBasisLine {
  description?: string | null;
  quantity?: number | null;
  unit_price_cents?: number | null;
  /** Per-line rate when the invoice mixes rates; the invoice's tax_rate otherwise. */
  tax_rate?: number | null;
}

export interface InvoiceBasisRow {
  invoice_id: string;
  invoice_number: string;
  invoice_type?: string | null;
  issue_date: string | null;
  due_date: string | null;
  currency: string | null;
  customer_name: string | null;
  customer_email: string | null;
  org_number: string | null;
  vat_number: string | null;
  company_name?: string | null;
  contract_id: string | null;
  subscription_id: string | null;
  lines: InvoiceBasisLine[] | null;
  tax_rate: number | null;
  subtotal_cents: number | null;
  tax_cents: number | null;
  total_cents: number | null;
  export_status: 'ready' | 'exported' | 'confirmed';
  external_ref: string | null;
}

export interface InvoiceBasisAnswer {
  counts?: { ready: number; exported: number; confirmed: number };
  count: number;
  truncated?: boolean;
  invoices: InvoiceBasisRow[];
}

export interface InvoiceBasisCsvRow extends Record<string, unknown> {
  invoice_number: string;
  invoice_type: string;
  issue_date: string;
  due_date: string;
  customer_name: string;
  org_number: string;
  vat_number: string;
  customer_email: string;
  currency: string;
  line_no: string;
  description: string;
  quantity: string;
  unit_price: string;
  line_amount: string;
  tax_rate: string;
  invoice_subtotal: string;
  invoice_tax: string;
  invoice_total: string;
  contract_ref: string;
  subscription_ref: string;
  export_status: string;
  external_ref: string;
}

export const INVOICE_BASIS_COLUMNS: { key: keyof InvoiceBasisCsvRow; header: string }[] = [
  { key: 'invoice_number', header: 'invoice_number' },
  { key: 'invoice_type', header: 'invoice_type' },
  { key: 'issue_date', header: 'issue_date' },
  { key: 'due_date', header: 'due_date' },
  { key: 'customer_name', header: 'customer_name' },
  { key: 'org_number', header: 'org_number' },
  { key: 'vat_number', header: 'vat_number' },
  { key: 'customer_email', header: 'customer_email' },
  { key: 'currency', header: 'currency' },
  { key: 'line_no', header: 'line_no' },
  { key: 'description', header: 'description' },
  { key: 'quantity', header: 'quantity' },
  { key: 'unit_price', header: 'unit_price' },
  { key: 'line_amount', header: 'line_amount' },
  { key: 'tax_rate', header: 'tax_rate' },
  { key: 'invoice_subtotal', header: 'invoice_subtotal' },
  { key: 'invoice_tax', header: 'invoice_tax' },
  { key: 'invoice_total', header: 'invoice_total' },
  { key: 'contract_ref', header: 'contract_ref' },
  { key: 'subscription_ref', header: 'subscription_ref' },
  { key: 'export_status', header: 'export_status' },
  { key: 'external_ref', header: 'external_ref' },
];

/** Hundredths → "1234.50". Null stays empty: a missing amount is not zero. */
export function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(Number(cents))) return '';
  const n = Math.round(Number(cents));
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

const num = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '' : String(Number(v)));

/** One row per invoice line; an invoice without lines still gets one row, so it is never missing from the file. */
export function invoiceBasisCsvRows(invoices: InvoiceBasisRow[]): InvoiceBasisCsvRow[] {
  const out: InvoiceBasisCsvRow[] = [];
  for (const inv of invoices) {
    const head = {
      invoice_number: inv.invoice_number,
      invoice_type: inv.invoice_type ?? '',
      issue_date: inv.issue_date ?? '',
      due_date: inv.due_date ?? '',
      customer_name: inv.company_name || inv.customer_name || '',
      org_number: inv.org_number ?? '',
      vat_number: inv.vat_number ?? '',
      customer_email: inv.customer_email ?? '',
      currency: inv.currency ?? '',
      invoice_subtotal: money(inv.subtotal_cents),
      invoice_tax: money(inv.tax_cents),
      invoice_total: money(inv.total_cents),
      contract_ref: inv.contract_id ?? '',
      subscription_ref: inv.subscription_id ?? '',
      export_status: inv.export_status,
      external_ref: inv.external_ref ?? '',
    };
    const lines = Array.isArray(inv.lines) && inv.lines.length ? inv.lines : [null];
    lines.forEach((line, i) => {
      const qty = line?.quantity ?? null;
      const unit = line?.unit_price_cents ?? null;
      out.push({
        ...head,
        line_no: line ? String(i + 1) : '',
        description: line?.description ?? '',
        quantity: num(qty),
        unit_price: money(unit),
        line_amount: qty !== null && unit !== null ? money(Number(qty) * Number(unit)) : '',
        tax_rate: num(line?.tax_rate ?? inv.tax_rate),
      });
    });
  }
  return out;
}

/** The file's name says what it holds: the period and how much of it. */
export function invoiceBasisFilename(from: string, to: string, status: string): string {
  return `invoice-basis_${from || 'start'}_${to || 'today'}_${status}.csv`;
}
