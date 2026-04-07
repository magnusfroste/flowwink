/**
 * Generic IFRS Accounting Templates
 */

export const IFRS_TEMPLATES = [
  {
    template_name: 'Service Invoice (with VAT)',
    description: 'Invoice for services rendered with VAT',
    category: 'revenue',
    keywords: ['invoice', 'service', 'sale', 'revenue', 'vat'],
    is_system: true,
    locale: 'ifrs-generic',
    template_lines: [
      { account_code: '1100', account_name: 'Trade Receivables', type: 'debit', description: 'Customer owes' },
      { account_code: '4100', account_name: 'Service Revenue', type: 'credit', description: 'Revenue recognized' },
      { account_code: '2100', account_name: 'VAT / Sales Tax Payable', type: 'credit', description: 'VAT liability' },
    ],
  },
  {
    template_name: 'Product Sale (with VAT)',
    description: 'Sale of goods with VAT',
    category: 'revenue',
    keywords: ['product', 'goods', 'sale', 'inventory', 'merchandise'],
    is_system: true,
    locale: 'ifrs-generic',
    template_lines: [
      { account_code: '1100', account_name: 'Trade Receivables', type: 'debit', description: 'Customer owes' },
      { account_code: '4000', account_name: 'Revenue from Contracts', type: 'credit', description: 'Revenue' },
      { account_code: '2100', account_name: 'VAT / Sales Tax Payable', type: 'credit', description: 'VAT' },
    ],
  },
  {
    template_name: 'Customer Payment Received',
    description: 'Customer pays an outstanding invoice',
    category: 'payment',
    keywords: ['payment', 'received', 'cash', 'collection', 'deposit'],
    is_system: true,
    locale: 'ifrs-generic',
    template_lines: [
      { account_code: '1000', account_name: 'Cash and Cash Equivalents', type: 'debit', description: 'Cash in' },
      { account_code: '1100', account_name: 'Trade Receivables', type: 'credit', description: 'Receivable cleared' },
    ],
  },
  {
    template_name: 'Supplier Invoice (with VAT)',
    description: 'Received invoice from a supplier with deductible VAT',
    category: 'expense',
    keywords: ['supplier', 'vendor', 'purchase', 'bill', 'procurement'],
    is_system: true,
    locale: 'ifrs-generic',
    template_lines: [
      { account_code: '5000', account_name: 'Cost of Sales', type: 'debit', description: 'Expense recognized' },
      { account_code: '2000', account_name: 'Trade Payables', type: 'credit', description: 'Liability to supplier' },
    ],
  },
  {
    template_name: 'Supplier Payment',
    description: 'Paying a supplier invoice',
    category: 'payment',
    keywords: ['pay supplier', 'vendor payment', 'bill payment', 'outgoing'],
    is_system: true,
    locale: 'ifrs-generic',
    template_lines: [
      { account_code: '2000', account_name: 'Trade Payables', type: 'debit', description: 'Liability cleared' },
      { account_code: '1000', account_name: 'Cash and Cash Equivalents', type: 'credit', description: 'Cash out' },
    ],
  },
  {
    template_name: 'Payroll Entry',
    description: 'Monthly payroll with employee benefits',
    category: 'payroll',
    keywords: ['salary', 'payroll', 'wages', 'staff', 'compensation'],
    is_system: true,
    locale: 'ifrs-generic',
    template_lines: [
      { account_code: '6000', account_name: 'Employee Benefits Expense', type: 'debit', description: 'Salary cost' },
      { account_code: '2400', account_name: 'Employee Benefits Payable', type: 'credit', description: 'Tax withholding' },
      { account_code: '1000', account_name: 'Cash and Cash Equivalents', type: 'credit', description: 'Net pay' },
    ],
  },
  {
    template_name: 'Rent Payment',
    description: 'Monthly office or premises rent',
    category: 'expense',
    keywords: ['rent', 'lease', 'office', 'premises', 'occupancy'],
    is_system: true,
    locale: 'ifrs-generic',
    template_lines: [
      { account_code: '6200', account_name: 'Rent & Occupancy', type: 'debit', description: 'Rent expense' },
      { account_code: '1000', account_name: 'Cash and Cash Equivalents', type: 'credit', description: 'Cash out' },
    ],
  },
  {
    template_name: 'Depreciation',
    description: 'Monthly depreciation of property, plant & equipment',
    category: 'adjustment',
    keywords: ['depreciation', 'amortization', 'write-down', 'fixed assets'],
    is_system: true,
    locale: 'ifrs-generic',
    template_lines: [
      { account_code: '6100', account_name: 'Depreciation & Amortization', type: 'debit', description: 'Depreciation expense' },
      { account_code: '1500', account_name: 'Property, Plant & Equipment', type: 'credit', description: 'Accumulated depreciation' },
    ],
  },
  {
    template_name: 'Bank Charges',
    description: 'Monthly bank fees and service charges',
    category: 'expense',
    keywords: ['bank', 'fee', 'charges', 'service charge', 'transaction fee'],
    is_system: true,
    locale: 'ifrs-generic',
    template_lines: [
      { account_code: '6800', account_name: 'Bank Charges', type: 'debit', description: 'Bank fee' },
      { account_code: '1000', account_name: 'Cash and Cash Equivalents', type: 'credit', description: 'Cash out' },
    ],
  },
  {
    template_name: 'Bad Debt Write-off',
    description: 'Write off uncollectable receivable',
    category: 'adjustment',
    keywords: ['bad debt', 'write-off', 'uncollectable', 'provision'],
    is_system: true,
    locale: 'ifrs-generic',
    template_lines: [
      { account_code: '6700', account_name: 'Office & General', type: 'debit', description: 'Bad debt expense' },
      { account_code: '1100', account_name: 'Trade Receivables', type: 'credit', description: 'Written off' },
    ],
  },
];
