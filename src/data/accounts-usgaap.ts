/**
 * US GAAP Chart of Accounts
 */
export const US_GAAP_ACCOUNTS = [
  // Assets
  { account_code: '1010', account_name: 'Cash', account_type: 'asset', account_category: 'Current Assets', normal_balance: 'debit', locale: 'us-gaap' },
  { account_code: '1020', account_name: 'Checking Account', account_type: 'asset', account_category: 'Current Assets', normal_balance: 'debit', locale: 'us-gaap' },
  { account_code: '1100', account_name: 'Accounts Receivable', account_type: 'asset', account_category: 'Current Assets', normal_balance: 'debit', locale: 'us-gaap' },
  { account_code: '1200', account_name: 'Inventory', account_type: 'asset', account_category: 'Current Assets', normal_balance: 'debit', locale: 'us-gaap' },
  { account_code: '1300', account_name: 'Prepaid Expenses', account_type: 'asset', account_category: 'Current Assets', normal_balance: 'debit', locale: 'us-gaap' },
  { account_code: '1500', account_name: 'Equipment', account_type: 'asset', account_category: 'Fixed Assets', normal_balance: 'debit', locale: 'us-gaap' },
  { account_code: '1510', account_name: 'Accumulated Depreciation', account_type: 'asset', account_category: 'Fixed Assets', normal_balance: 'credit', locale: 'us-gaap' },
  { account_code: '1600', account_name: 'Goodwill', account_type: 'asset', account_category: 'Intangible Assets', normal_balance: 'debit', locale: 'us-gaap' },
  // Liabilities
  { account_code: '2000', account_name: 'Accounts Payable', account_type: 'liability', account_category: 'Current Liabilities', normal_balance: 'credit', locale: 'us-gaap' },
  { account_code: '2100', account_name: 'Sales Tax Payable', account_type: 'liability', account_category: 'Current Liabilities', normal_balance: 'credit', locale: 'us-gaap' },
  { account_code: '2200', account_name: 'Wages Payable', account_type: 'liability', account_category: 'Current Liabilities', normal_balance: 'credit', locale: 'us-gaap' },
  { account_code: '2300', account_name: 'Federal Income Tax Payable', account_type: 'liability', account_category: 'Current Liabilities', normal_balance: 'credit', locale: 'us-gaap' },
  { account_code: '2400', account_name: 'State Income Tax Payable', account_type: 'liability', account_category: 'Current Liabilities', normal_balance: 'credit', locale: 'us-gaap' },
  { account_code: '2500', account_name: 'Payroll Tax Payable', account_type: 'liability', account_category: 'Current Liabilities', normal_balance: 'credit', locale: 'us-gaap' },
  { account_code: '2600', account_name: 'Accrued Liabilities', account_type: 'liability', account_category: 'Current Liabilities', normal_balance: 'credit', locale: 'us-gaap' },
  { account_code: '2700', account_name: 'Notes Payable (Long-term)', account_type: 'liability', account_category: 'Long-Term Liabilities', normal_balance: 'credit', locale: 'us-gaap' },
  // Equity
  { account_code: '3000', account_name: 'Common Stock', account_type: 'equity', account_category: 'Equity', normal_balance: 'credit', locale: 'us-gaap' },
  { account_code: '3100', account_name: 'Additional Paid-in Capital', account_type: 'equity', account_category: 'Equity', normal_balance: 'credit', locale: 'us-gaap' },
  { account_code: '3200', account_name: 'Retained Earnings', account_type: 'equity', account_category: 'Equity', normal_balance: 'credit', locale: 'us-gaap' },
  { account_code: '3300', account_name: 'Owner Draws', account_type: 'equity', account_category: 'Equity', normal_balance: 'debit', locale: 'us-gaap' },
  // Revenue
  { account_code: '4000', account_name: 'Sales Revenue', account_type: 'revenue', account_category: 'Revenue', normal_balance: 'credit', locale: 'us-gaap' },
  { account_code: '4100', account_name: 'Service Revenue', account_type: 'revenue', account_category: 'Revenue', normal_balance: 'credit', locale: 'us-gaap' },
  { account_code: '4200', account_name: 'Interest Income', account_type: 'revenue', account_category: 'Other Income', normal_balance: 'credit', locale: 'us-gaap' },
  { account_code: '4300', account_name: 'Other Income', account_type: 'revenue', account_category: 'Other Income', normal_balance: 'credit', locale: 'us-gaap' },
  // Expenses
  { account_code: '5000', account_name: 'Cost of Goods Sold', account_type: 'expense', account_category: 'COGS', normal_balance: 'debit', locale: 'us-gaap' },
  { account_code: '6000', account_name: 'Salaries & Wages', account_type: 'expense', account_category: 'Operating Expenses', normal_balance: 'debit', locale: 'us-gaap' },
  { account_code: '6100', account_name: 'Payroll Taxes', account_type: 'expense', account_category: 'Operating Expenses', normal_balance: 'debit', locale: 'us-gaap' },
  { account_code: '6200', account_name: 'Rent Expense', account_type: 'expense', account_category: 'Operating Expenses', normal_balance: 'debit', locale: 'us-gaap' },
  { account_code: '6300', account_name: 'Utilities', account_type: 'expense', account_category: 'Operating Expenses', normal_balance: 'debit', locale: 'us-gaap' },
  { account_code: '6400', account_name: 'Office Supplies', account_type: 'expense', account_category: 'Operating Expenses', normal_balance: 'debit', locale: 'us-gaap' },
  { account_code: '6500', account_name: 'Insurance', account_type: 'expense', account_category: 'Operating Expenses', normal_balance: 'debit', locale: 'us-gaap' },
  { account_code: '6600', account_name: 'Depreciation Expense', account_type: 'expense', account_category: 'Operating Expenses', normal_balance: 'debit', locale: 'us-gaap' },
  { account_code: '6700', account_name: 'Advertising', account_type: 'expense', account_category: 'Operating Expenses', normal_balance: 'debit', locale: 'us-gaap' },
  { account_code: '6800', account_name: 'Professional Fees', account_type: 'expense', account_category: 'Operating Expenses', normal_balance: 'debit', locale: 'us-gaap' },
  { account_code: '6900', account_name: 'Bank Service Charges', account_type: 'expense', account_category: 'Operating Expenses', normal_balance: 'debit', locale: 'us-gaap' },
  { account_code: '7000', account_name: 'Interest Expense', account_type: 'expense', account_category: 'Financial', normal_balance: 'debit', locale: 'us-gaap' },
  { account_code: '8000', account_name: 'Income Tax Expense', account_type: 'expense', account_category: 'Tax', normal_balance: 'debit', locale: 'us-gaap' },
];
