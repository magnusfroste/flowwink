/**
 * Sweden — BAS 2024 Locale Pack
 *
 * Wraps the existing BAS chart, templates, PAXml payroll generator and SIE
 * import metadata into the unified AccountingLocalePack contract.
 */
import type {
  AccountingLocalePack,
  PayrollAdapter,
  BankImportAdapter,
  TaxReturnAdapter,
} from '../types';
import { BAS_2024_ACCOUNTS } from '@/data/bas2024-accounts';
import { BAS_2024_TEMPLATES } from '@/data/templates-bas2024';
import { generatePAXml, generateFortnoxCSV } from '@/hooks/usePayroll';

const paxmlAdapter: PayrollAdapter = {
  id: 'paxml',
  label: 'PAXml 2.0 (Visma/Hogia/Kontek)',
  extension: 'xml',
  mime: 'application/xml',
  generate: (rows, year, month) => generatePAXml(rows as any, year, month),
};

const fortnoxCsvAdapter: PayrollAdapter = {
  id: 'fortnox-csv',
  label: 'Fortnox CSV',
  extension: 'csv',
  mime: 'text/csv',
  generate: (rows, year, month) => generateFortnoxCSV(rows as any, year, month),
};

const sieAdapter: BankImportAdapter = {
  id: 'sie',
  label: 'SIE 4 (Swedish standard)',
  extensions: ['si', 'sie'],
};

const camt053Adapter: BankImportAdapter = {
  id: 'camt053',
  label: 'CAMT.053 (ISO 20022)',
  extensions: ['xml'],
};

const csvBankAdapter: BankImportAdapter = {
  id: 'csv-generic',
  label: 'Bank CSV',
  extensions: ['csv'],
};

const vatReturnAdapter: TaxReturnAdapter = {
  id: 'se-vat-return',
  label: 'Momsdeklaration (Skatteverket)',
  period: 'monthly',
  edge_function: 'accounting-vat-return-se',
};

export const sePack: AccountingLocalePack = {
  id: 'se-bas2024',
  label: 'Sweden — BAS 2024',
  description: 'Swedish BAS 2024 chart of accounts, 25% VAT default, PAXml payroll, SIE bank import.',
  countries: ['SE'],

  currency: {
    code: 'SEK',
    symbol: 'kr',
    decimals: 2,
    intl_locale: 'sv-SE',
  },

  vat: {
    default_rate: 0.25,
    rates: [
      { label: 'Standard 25%', rate: 0.25, output_account: '2610', input_account: '2640' },
      { label: 'Reduced 12% (food, restaurants)', rate: 0.12, output_account: '2620', input_account: '2640' },
      { label: 'Reduced 6% (books, transport, culture)', rate: 0.06, output_account: '2630', input_account: '2640' },
      { label: 'Zero-rated / exempt', rate: 0 },
    ],
  },

  chart: BAS_2024_ACCOUNTS as any,
  templates: BAS_2024_TEMPLATES as any,

  payroll_adapters: [paxmlAdapter, fortnoxCsvAdapter],
  bank_import_adapters: [sieAdapter, camt053Adapter, csvBankAdapter],
  tax_return_adapters: [vatReturnAdapter],

  ai_instructions: {
    journal_entry:
      'Use BAS 2024 account codes (4-digit). Ensure debits equal credits. For sales invoices: Debit 1510 Kundfordringar, Credit 3010 Försäljning + Credit 2610 Utgående moms 25%. Match accounting templates by keywords when possible.',
    invoicing:
      'Default currency SEK. Default VAT 25% (rate 0.25). Reduced rates: 12% (food/restaurant), 6% (books/transport/culture). Invoice numbering: INV-XXXXX.',
    purchasing:
      'Default tax_rate is 25% for Swedish vendors. Calculate totals: subtotal = sum(qty * unit_price), tax = sum(qty * unit_price * tax_rate/100).',
  },
};
