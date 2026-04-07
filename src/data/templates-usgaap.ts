/**
 * US GAAP Accounting Templates
 */

export const US_GAAP_TEMPLATES = [
  {
    template_name: 'Sales Invoice',
    description: 'Invoice for goods or services sold',
    category: 'revenue',
    keywords: ['invoice', 'sale', 'revenue', 'billing'],
    is_system: true,
    locale: 'us-gaap',
    template_lines: [
      { account_code: '1100', account_name: 'Accounts Receivable', type: 'debit', description: 'Customer owes' },
      { account_code: '4000', account_name: 'Sales Revenue', type: 'credit', description: 'Revenue' },
      { account_code: '2100', account_name: 'Sales Tax Payable', type: 'credit', description: 'Sales tax' },
    ],
  },
  {
    template_name: 'Service Invoice',
    description: 'Invoice for services rendered',
    category: 'revenue',
    keywords: ['service', 'consulting', 'professional', 'fee'],
    is_system: true,
    locale: 'us-gaap',
    template_lines: [
      { account_code: '1100', account_name: 'Accounts Receivable', type: 'debit', description: 'Customer owes' },
      { account_code: '4100', account_name: 'Service Revenue', type: 'credit', description: 'Service revenue' },
    ],
  },
  {
    template_name: 'Customer Payment',
    description: 'Receiving payment on accounts receivable',
    category: 'payment',
    keywords: ['payment', 'received', 'collection', 'deposit', 'check'],
    is_system: true,
    locale: 'us-gaap',
    template_lines: [
      { account_code: '1020', account_name: 'Checking Account', type: 'debit', description: 'Cash in' },
      { account_code: '1100', account_name: 'Accounts Receivable', type: 'credit', description: 'AR cleared' },
    ],
  },
  {
    template_name: 'Vendor Bill',
    description: 'Received bill from vendor',
    category: 'expense',
    keywords: ['vendor', 'bill', 'purchase', 'supplier', 'AP'],
    is_system: true,
    locale: 'us-gaap',
    template_lines: [
      { account_code: '5000', account_name: 'Cost of Goods Sold', type: 'debit', description: 'Expense' },
      { account_code: '2000', account_name: 'Accounts Payable', type: 'credit', description: 'Owed to vendor' },
    ],
  },
  {
    template_name: 'Vendor Payment',
    description: 'Paying a vendor bill',
    category: 'payment',
    keywords: ['pay vendor', 'bill payment', 'AP payment', 'outgoing'],
    is_system: true,
    locale: 'us-gaap',
    template_lines: [
      { account_code: '2000', account_name: 'Accounts Payable', type: 'debit', description: 'AP cleared' },
      { account_code: '1020', account_name: 'Checking Account', type: 'credit', description: 'Cash out' },
    ],
  },
  {
    template_name: 'Payroll',
    description: 'Employee payroll with withholdings',
    category: 'payroll',
    keywords: ['payroll', 'salary', 'wages', 'compensation', 'W2'],
    is_system: true,
    locale: 'us-gaap',
    template_lines: [
      { account_code: '6000', account_name: 'Salaries & Wages', type: 'debit', description: 'Gross pay' },
      { account_code: '6100', account_name: 'Payroll Taxes', type: 'debit', description: 'Employer taxes' },
      { account_code: '2300', account_name: 'Federal Income Tax Payable', type: 'credit', description: 'Withholding' },
      { account_code: '2500', account_name: 'Payroll Tax Payable', type: 'credit', description: 'FICA etc.' },
      { account_code: '1020', account_name: 'Checking Account', type: 'credit', description: 'Net pay' },
    ],
  },
  {
    template_name: 'Rent Payment',
    description: 'Monthly rent for office or workspace',
    category: 'expense',
    keywords: ['rent', 'lease', 'office', 'space'],
    is_system: true,
    locale: 'us-gaap',
    template_lines: [
      { account_code: '6200', account_name: 'Rent Expense', type: 'debit', description: 'Rent' },
      { account_code: '1020', account_name: 'Checking Account', type: 'credit', description: 'Cash out' },
    ],
  },
  {
    template_name: 'Depreciation',
    description: 'Monthly depreciation of equipment',
    category: 'adjustment',
    keywords: ['depreciation', 'write-down', 'equipment', 'fixed asset'],
    is_system: true,
    locale: 'us-gaap',
    template_lines: [
      { account_code: '6600', account_name: 'Depreciation Expense', type: 'debit', description: 'Depreciation' },
      { account_code: '1510', account_name: 'Accumulated Depreciation', type: 'credit', description: 'Contra asset' },
    ],
  },
  {
    template_name: 'Owner Draw',
    description: 'Owner withdraws funds from business',
    category: 'adjustment',
    keywords: ['draw', 'withdrawal', 'owner', 'distribution'],
    is_system: true,
    locale: 'us-gaap',
    template_lines: [
      { account_code: '3300', account_name: 'Owner Draws', type: 'debit', description: 'Owner draw' },
      { account_code: '1020', account_name: 'Checking Account', type: 'credit', description: 'Cash out' },
    ],
  },
  {
    template_name: 'Bad Debt Expense',
    description: 'Write off uncollectable accounts receivable',
    category: 'adjustment',
    keywords: ['bad debt', 'write-off', 'uncollectable', 'allowance'],
    is_system: true,
    locale: 'us-gaap',
    template_lines: [
      { account_code: '6800', account_name: 'Professional Fees', type: 'debit', description: 'Bad debt expense' },
      { account_code: '1100', account_name: 'Accounts Receivable', type: 'credit', description: 'Written off' },
    ],
  },
];
