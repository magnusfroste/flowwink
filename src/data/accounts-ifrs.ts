/**
 * Generic IFRS Chart of Accounts
 */
export const IFRS_ACCOUNTS = [
  // Assets
  { account_code: '1000', account_name: 'Cash and Cash Equivalents', account_type: 'asset', account_category: 'Current Assets', normal_balance: 'debit', locale: 'ifrs-generic' },
  { account_code: '1100', account_name: 'Trade Receivables', account_type: 'asset', account_category: 'Current Assets', normal_balance: 'debit', locale: 'ifrs-generic' },
  { account_code: '1200', account_name: 'Inventories', account_type: 'asset', account_category: 'Current Assets', normal_balance: 'debit', locale: 'ifrs-generic' },
  { account_code: '1300', account_name: 'Prepaid Expenses', account_type: 'asset', account_category: 'Current Assets', normal_balance: 'debit', locale: 'ifrs-generic' },
  { account_code: '1400', account_name: 'Other Current Assets', account_type: 'asset', account_category: 'Current Assets', normal_balance: 'debit', locale: 'ifrs-generic' },
  { account_code: '1500', account_name: 'Property, Plant & Equipment', account_type: 'asset', account_category: 'Non-Current Assets', normal_balance: 'debit', locale: 'ifrs-generic' },
  { account_code: '1600', account_name: 'Intangible Assets', account_type: 'asset', account_category: 'Non-Current Assets', normal_balance: 'debit', locale: 'ifrs-generic' },
  { account_code: '1700', account_name: 'Right-of-Use Assets', account_type: 'asset', account_category: 'Non-Current Assets', normal_balance: 'debit', locale: 'ifrs-generic' },
  { account_code: '1800', account_name: 'Investments', account_type: 'asset', account_category: 'Non-Current Assets', normal_balance: 'debit', locale: 'ifrs-generic' },
  // Liabilities
  { account_code: '2000', account_name: 'Trade Payables', account_type: 'liability', account_category: 'Current Liabilities', normal_balance: 'credit', locale: 'ifrs-generic' },
  { account_code: '2100', account_name: 'VAT / Sales Tax Payable', account_type: 'liability', account_category: 'Current Liabilities', normal_balance: 'credit', locale: 'ifrs-generic' },
  { account_code: '2200', account_name: 'Accrued Expenses', account_type: 'liability', account_category: 'Current Liabilities', normal_balance: 'credit', locale: 'ifrs-generic' },
  { account_code: '2300', account_name: 'Short-term Borrowings', account_type: 'liability', account_category: 'Current Liabilities', normal_balance: 'credit', locale: 'ifrs-generic' },
  { account_code: '2400', account_name: 'Employee Benefits Payable', account_type: 'liability', account_category: 'Current Liabilities', normal_balance: 'credit', locale: 'ifrs-generic' },
  { account_code: '2500', account_name: 'Income Tax Payable', account_type: 'liability', account_category: 'Current Liabilities', normal_balance: 'credit', locale: 'ifrs-generic' },
  { account_code: '2600', account_name: 'Long-term Borrowings', account_type: 'liability', account_category: 'Non-Current Liabilities', normal_balance: 'credit', locale: 'ifrs-generic' },
  { account_code: '2700', account_name: 'Lease Liabilities', account_type: 'liability', account_category: 'Non-Current Liabilities', normal_balance: 'credit', locale: 'ifrs-generic' },
  // Equity
  { account_code: '3000', account_name: 'Share Capital', account_type: 'equity', account_category: 'Equity', normal_balance: 'credit', locale: 'ifrs-generic' },
  { account_code: '3100', account_name: 'Retained Earnings', account_type: 'equity', account_category: 'Equity', normal_balance: 'credit', locale: 'ifrs-generic' },
  { account_code: '3200', account_name: 'Other Reserves', account_type: 'equity', account_category: 'Equity', normal_balance: 'credit', locale: 'ifrs-generic' },
  // Revenue
  { account_code: '4000', account_name: 'Revenue from Contracts', account_type: 'revenue', account_category: 'Revenue', normal_balance: 'credit', locale: 'ifrs-generic' },
  { account_code: '4100', account_name: 'Service Revenue', account_type: 'revenue', account_category: 'Revenue', normal_balance: 'credit', locale: 'ifrs-generic' },
  { account_code: '4200', account_name: 'Other Operating Income', account_type: 'revenue', account_category: 'Revenue', normal_balance: 'credit', locale: 'ifrs-generic' },
  { account_code: '4900', account_name: 'Finance Income', account_type: 'revenue', account_category: 'Financial', normal_balance: 'credit', locale: 'ifrs-generic' },
  // Expenses
  { account_code: '5000', account_name: 'Cost of Sales', account_type: 'expense', account_category: 'Cost of Sales', normal_balance: 'debit', locale: 'ifrs-generic' },
  { account_code: '6000', account_name: 'Employee Benefits Expense', account_type: 'expense', account_category: 'Operating Expenses', normal_balance: 'debit', locale: 'ifrs-generic' },
  { account_code: '6100', account_name: 'Depreciation & Amortization', account_type: 'expense', account_category: 'Operating Expenses', normal_balance: 'debit', locale: 'ifrs-generic' },
  { account_code: '6200', account_name: 'Rent & Occupancy', account_type: 'expense', account_category: 'Operating Expenses', normal_balance: 'debit', locale: 'ifrs-generic' },
  { account_code: '6300', account_name: 'Marketing & Advertising', account_type: 'expense', account_category: 'Operating Expenses', normal_balance: 'debit', locale: 'ifrs-generic' },
  { account_code: '6400', account_name: 'Professional Services', account_type: 'expense', account_category: 'Operating Expenses', normal_balance: 'debit', locale: 'ifrs-generic' },
  { account_code: '6500', account_name: 'IT & Software', account_type: 'expense', account_category: 'Operating Expenses', normal_balance: 'debit', locale: 'ifrs-generic' },
  { account_code: '6600', account_name: 'Travel & Entertainment', account_type: 'expense', account_category: 'Operating Expenses', normal_balance: 'debit', locale: 'ifrs-generic' },
  { account_code: '6700', account_name: 'Office & General', account_type: 'expense', account_category: 'Operating Expenses', normal_balance: 'debit', locale: 'ifrs-generic' },
  { account_code: '6800', account_name: 'Bank Charges', account_type: 'expense', account_category: 'Operating Expenses', normal_balance: 'debit', locale: 'ifrs-generic' },
  { account_code: '7000', account_name: 'Finance Costs', account_type: 'expense', account_category: 'Financial', normal_balance: 'debit', locale: 'ifrs-generic' },
  { account_code: '8000', account_name: 'Income Tax Expense', account_type: 'expense', account_category: 'Tax', normal_balance: 'debit', locale: 'ifrs-generic' },
];
