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

/**
 * Generic payload passed to accounting export adapters.
 * Country-specific formats (SIE/DATEV/FEC/SAF-T/IIF) consume this same shape
 * and serialize it to their target format.
 */
export interface AccountingExportPayload {
  company: {
    name: string;
    org_number?: string | null;
    currency: string;
  };
  fiscal_year: {
    start: string; // YYYY-MM-DD
    end: string;   // YYYY-MM-DD
  };
  chart: ChartAccount[];
  entries: Array<{
    entry_number: string | number;
    entry_date: string; // YYYY-MM-DD
    description: string;
    lines: Array<{
      account_code: string;
      debit_cents: number;
      credit_cents: number;
      description?: string | null;
    }>;
  }>;
  /** Optional opening balances per account */
  opening_balances?: Array<{ account_code: string; balance_cents: number }>;
}

export interface AccountingExportOptions {
  /** Inclusive date range to filter entries */
  date_from?: string;
  date_to?: string;
  /** Generator name shown in file header */
  generated_by?: string;
}

export interface AccountingExportAdapter {
  /** Format id, e.g. 'sie4', 'datev', 'fec', 'saft-oecd', 'iif', 'csv-generic' */
  id: string;
  /** Human label, e.g. "SIE 4 (Sweden)", "DATEV CSV (Germany)" */
  label: string;
  /** Short description of when to use this format */
  description?: string;
  /** File extension without dot */
  extension: string;
  /** MIME type */
  mime: string;
  /** Why this format exists in this market */
  purpose: 'auditor_handoff' | 'tax_authority' | 'system_migration' | 'general';
  /** Serialize the canonical payload to the target format */
  generate(payload: AccountingExportPayload, options?: AccountingExportOptions): string;
}

/**
 * Year-end proposal returned by pack-specific callbacks.
 * Core orchestration (`run_year_end` / `propose_accruals`) calls
 * `pack.year_end_proposals?.(year)` to let the locale pack contribute
 * country-specific bookings (SE: periodiseringsfond / överavskrivningar,
 * DE: Rückstellungen, US: deferred tax adjustments, ...). The core stays
 * neutral; the pack owns the rules.
 */
export interface AccrualProposal {
  /** Stable id within the pack, e.g. 'se-periodiseringsfond' */
  id: string;
  /** Human label shown to the operator */
  label: string;
  /** Why the proposal exists — auditor-facing rationale */
  rationale: string;
  /** Suggested journal lines (canonical shape) */
  lines: Array<{
    account_code: string;
    debit_cents: number;
    credit_cents: number;
    description?: string;
  }>;
  /** Optional confidence 0-1 so the UI can flag low-confidence proposals */
  confidence?: number;
  /** Optional metadata blob carried through to the staged operation */
  meta?: Record<string, unknown>;
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
   * Standardised accounting export formats for auditor handoff / system
   * migration / tax authorities. Every pack MUST register at least one
   * (e.g. SIE 4 in SE, DATEV in DE, FEC in FR, SAF-T in PT/NO, OECD SAF-T
   * as the international baseline in the generic pack).
   */
  accounting_export_adapters: AccountingExportAdapter[];

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

  /**
   * Optional callback invoked by core year-end orchestration so the pack can
   * contribute country-specific accrual / disposition proposals. Core never
   * inspects the contents — it just stages them for operator approval.
   * Leave undefined when the market has no extra year-end mechanics.
   */
  year_end_proposals?: (year: number) => Promise<AccrualProposal[]>;
}
