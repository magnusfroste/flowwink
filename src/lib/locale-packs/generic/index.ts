/**
 * Generic IFRS Locale Pack — minimal skeleton
 *
 * Reasonable defaults for any market that doesn't have its own pack yet.
 * Uses the IFRS chart already present in src/data/accounts-ifrs.ts and
 * a generic CSV payroll format. No country-specific tax rules.
 */
import type { AccountingLocalePack, PayrollAdapter, BankImportAdapter } from '../types';
import { IFRS_ACCOUNTS } from '@/data/accounts-ifrs';
import { IFRS_TEMPLATES } from '@/data/templates-ifrs';
import type { PayrollExportRow } from '../types';

function escapeCsv(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[,"\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const csvPayroll: PayrollAdapter = {
  id: 'csv-generic',
  label: 'Generic Payroll CSV',
  extension: 'csv',
  mime: 'text/csv',
  generate: (rows: PayrollExportRow[], year, month) => {
    const period = `${year}-${String(month).padStart(2, '0')}`;
    const headers = [
      'Period', 'EmployeeID', 'Name', 'Email',
      'VacationDays', 'SickDays', 'ParentalDays', 'OtherLeaveDays',
      'ExpenseReimbursement', 'Representation', 'ExpenseCount',
    ];
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push([
        period,
        escapeCsv(r.employee_id),
        escapeCsv(r.employee_name),
        escapeCsv(r.employee_email || ''),
        r.vacation_days, r.sick_days, r.parental_days, r.other_leave_days,
        (r.expense_reimbursement_cents / 100).toFixed(2),
        (r.representation_cents / 100).toFixed(2),
        r.expense_count,
      ].join(','));
    }
    return lines.join('\r\n');
  },
};

const camt053: BankImportAdapter = {
  id: 'camt053',
  label: 'CAMT.053 (ISO 20022)',
  extensions: ['xml'],
};

const mt940: BankImportAdapter = {
  id: 'mt940',
  label: 'MT940 (SWIFT)',
  extensions: ['sta', 'mt940', 'txt'],
};

const ofx: BankImportAdapter = {
  id: 'ofx',
  label: 'OFX',
  extensions: ['ofx'],
};

const csvBank: BankImportAdapter = {
  id: 'csv-generic',
  label: 'Bank CSV',
  extensions: ['csv'],
};

export const ifrsGenericPack: AccountingLocalePack = {
  id: 'ifrs-generic',
  label: 'IFRS — Generic',
  description: 'International Financial Reporting Standards baseline. Works in any market without country-specific rules.',
  countries: ['*'],

  currency: {
    code: 'EUR',
    symbol: '€',
    decimals: 2,
    intl_locale: 'en-IE',
  },

  vat: {
    default_rate: 0,
    rates: [
      { label: 'Zero / not applicable', rate: 0 },
      { label: 'Custom (override per invoice)', rate: 0 },
    ],
  },

  chart: IFRS_ACCOUNTS as any,
  templates: IFRS_TEMPLATES as any,

  payroll_adapters: [csvPayroll],
  bank_import_adapters: [camt053, mt940, ofx, csvBank],
  tax_return_adapters: [],

  ai_instructions: {
    journal_entry:
      'Use IFRS-aligned account codes from the chart of accounts. Ensure debits equal credits. Match accounting templates by keywords when possible. No assumed VAT rate — ask the user if unclear.',
    invoicing:
      'Default currency EUR (override per site). VAT/tax rate is per-invoice — do not assume a default. Use ISO 4217 currency codes.',
    purchasing:
      'Tax rate is per-line and per-vendor — do not assume a default. Calculate totals: subtotal = sum(qty * unit_price), tax = sum(qty * unit_price * tax_rate/100).',
  },
};
