/**
 * Accounting Locale Pack — Plugin Contract
 * ─────────────────────────────────────────
 * A locale pack is a self-contained "country/standard" plugin that supplies
 * everything modules need to operate against a specific accounting regime
 * (chart of accounts, VAT rules, payroll & bank file formats, etc.).
 *
 * FlowWink core stays accounting-neutral. Modules read from the *active* pack
 * via `getActivePack()` instead of importing country-specific code directly.
 *
 * To add a new market (DE/UK/US/...):
 *   1. Create src/lib/locale-packs/<id>/index.ts implementing AccountingLocalePack
 *   2. Register it in src/lib/locale-packs/index.ts
 *   3. Done. No core changes required.
 */

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';
export type NormalBalance = 'debit' | 'credit';

export interface ChartAccount {
  account_code: string;
  account_name: string;
  account_type: AccountType;
  account_category: string;
  normal_balance: NormalBalance;
  /** Locale id, e.g. 'se-bas2024'. Set automatically when seeded. */
  locale?: string;
}

export interface AccountingTemplateLine {
  account_code: string;
  account_name: string;
  debit_pct?: number;
  credit_pct?: number;
}

export interface AccountingTemplate {
  template_name: string;
  description?: string;
  category: 'revenue' | 'expense' | 'payment' | 'payroll' | 'tax' | 'asset' | 'adjustment';
  keywords?: string[];
  is_system?: boolean;
  template_lines: AccountingTemplateLine[];
  locale?: string;
}

export interface VatRule {
  /** Human label, e.g. "Standard rate" */
  label: string;
  /** Decimal rate, e.g. 0.25 for 25% */
  rate: number;
  /** Optional account code for output VAT */
  output_account?: string;
  /** Optional account code for input VAT */
  input_account?: string;
}

export interface VatPolicy {
  /** Default rate applied when none specified (decimal, e.g. 0.25) */
  default_rate: number;
  /** All available rates for this market (standard, reduced, zero, exempt, etc.) */
  rates: VatRule[];
}

export interface CurrencyPolicy {
  /** ISO 4217 code, e.g. 'SEK', 'EUR', 'USD' */
  code: string;
  /** Display symbol */
  symbol: string;
  /** Decimal places (usually 2) */
  decimals: number;
  /** Locale string for Intl.NumberFormat, e.g. 'sv-SE' */
  intl_locale: string;
}

/** Generic row used by payroll/bank adapters. Keep minimal & format-agnostic. */
export interface PayrollExportRow {
  employee_id: string;
  employee_name: string;
  employee_email?: string | null;
  personal_number?: string | null;
  vacation_days: number;
  sick_days: number;
  parental_days: number;
  other_leave_days: number;
  expense_reimbursement_cents: number;
  representation_cents: number;
  expense_count: number;
}

export interface PayrollAdapter {
  /** Format id, e.g. 'paxml', 'csv-generic', 'bacs', 'adp-csv' */
  id: string;
  label: string;
  /** File extension without dot */
  extension: string;
  /** MIME type */
  mime: string;
  generate(rows: PayrollExportRow[], year: number, month: number): string;
}

export interface BankImportAdapter {
  /** Format id, e.g. 'sie', 'camt053', 'mt940', 'ofx', 'csv-generic' */
  id: string;
  label: string;
  /** Accepted file extensions */
  extensions: string[];
  /** Server-side parser is invoked via reconciliation-import-file edge function;
   *  this entry is metadata only so UI can offer the right format options. */
}

export interface TaxReturnAdapter {
  id: string;
  label: string;
  /** e.g. 'monthly' | 'quarterly' | 'annual' */
  period: 'monthly' | 'quarterly' | 'annual';
  /** Edge function name that generates the return */
  edge_function?: string;
}

export interface AccountingLocalePack {
  /** Stable id, e.g. 'se-bas2024' */
  id: string;
  /** Human label, e.g. 'Sweden — BAS 2024' */
  label: string;
  /** Short description shown in settings */
  description: string;
  /** ISO country code(s) this pack targets, e.g. ['SE'] or ['*'] for generic */
  countries: string[];

  currency: CurrencyPolicy;
  vat: VatPolicy;

  /** Full chart of accounts to seed on first activation */
  chart: ChartAccount[];
  /** Reusable booking templates */
  templates: AccountingTemplate[];

  /** Available payroll export formats; first one is default */
  payroll_adapters: PayrollAdapter[];
  /** Available bank-statement import formats */
  bank_import_adapters: BankImportAdapter[];
  /** Optional tax-return generators (VAT return, year-end, etc.) */
  tax_return_adapters?: TaxReturnAdapter[];

  /**
   * Pack-specific instructions appended to skill prompts so the AI uses
   * the right account codes & local conventions.
   * Keep concise — full chart is already in DB.
   */
  ai_instructions: {
    journal_entry: string;
    invoicing: string;
    purchasing: string;
  };
}
