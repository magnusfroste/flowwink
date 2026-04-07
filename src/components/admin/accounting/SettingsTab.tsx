import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Settings, Globe, Check, Database, RefreshCw } from 'lucide-react';
import { useAccountingLocale, ACCOUNTING_LOCALES } from '@/hooks/useAccountingLocale';
import { useChartOfAccounts } from '@/hooks/useAccounting';
import { IFRS_TEMPLATES } from '@/data/templates-ifrs';
import { US_GAAP_TEMPLATES } from '@/data/templates-usgaap';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function SettingsTab() {
  const { locale, setLocale } = useAccountingLocale();
  const { data: accounts } = useChartOfAccounts();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [seeding, setSeeding] = useState(false);

  // Count accounts per locale
  const localeCounts = (accounts || []).reduce<Record<string, number>>((acc, a) => {
    // We can't see locale from the current query, so we show total
    return acc;
  }, {});

  const handleSeedLocale = async (targetLocale: string) => {
    setSeeding(true);
    try {
      // Check if locale already has accounts
      const { count } = await supabase
        .from('chart_of_accounts')
        .select('id', { count: 'exact', head: true })
        .eq('locale', targetLocale);

      if ((count ?? 0) > 0) {
        toast({ title: 'Already seeded', description: `${targetLocale} accounts already exist` });
        setSeeding(false);
        return;
      }

      // Get accounts to seed based on locale
      const accountsToSeed = getAccountsForLocale(targetLocale);
      if (accountsToSeed.length === 0) {
        toast({ title: 'No data', description: 'No accounts defined for this locale', variant: 'destructive' });
        setSeeding(false);
        return;
      }

      const { error } = await supabase.from('chart_of_accounts').insert(accountsToSeed);
      if (error) throw error;

      // Also seed templates
      const templatesToSeed = getTemplatesForLocale(targetLocale);
      if (templatesToSeed.length > 0) {
        await supabase.from('accounting_templates').insert(templatesToSeed);
      }

      queryClient.invalidateQueries({ queryKey: ['chart-of-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-templates'] });
      toast({ title: 'Seeded successfully', description: `${accountsToSeed.length} accounts added for ${targetLocale}` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSeeding(false);
    }
  };

  const selectedInfo = ACCOUNTING_LOCALES.find((l) => l.value === locale);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Chart of Accounts
          </CardTitle>
          <CardDescription>
            Select which accounting standard to use. Each standard has its own chart of accounts and templates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ACCOUNTING_LOCALES.map((opt) => {
            const isActive = locale === opt.value;
            return (
              <div
                key={opt.value}
                className={`flex items-center justify-between p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                  isActive
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/40'
                }`}
                onClick={() => setLocale(opt.value)}
              >
                <div className="flex items-center gap-3">
                  {isActive && <Check className="h-5 w-5 text-primary shrink-0" />}
                  <div>
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-sm text-muted-foreground">{opt.description}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isActive && <Badge>Active</Badge>}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSeedLocale(opt.value);
                    }}
                    disabled={seeding}
                  >
                    <Database className="h-3 w-3 mr-1" />
                    {seeding ? 'Seeding...' : 'Seed'}
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {selectedInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Settings className="h-4 w-4" />
              Active: {selectedInfo.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Journal entries, ledger, and reports will use accounts from the <strong>{selectedInfo.label}</strong> chart.
              You can switch at any time — existing entries keep their original account references.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Locale-specific account data
// ============================================================

function getAccountsForLocale(locale: string) {
  if (locale === 'ifrs-generic') return IFRS_ACCOUNTS;
  if (locale === 'us-gaap') return US_GAAP_ACCOUNTS;
  return []; // BAS 2024 is seeded by the bootstrap
}

function getTemplatesForLocale(locale: string) {
  if (locale === 'ifrs-generic') return IFRS_TEMPLATES;
  if (locale === 'us-gaap') return US_GAAP_TEMPLATES;
  return []; // BAS 2024 templates are seeded by the bootstrap
}

const IFRS_ACCOUNTS = [
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

const US_GAAP_ACCOUNTS = [
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
    template_name: 'Customer Payment Received',
    description: 'Customer pays an outstanding invoice',
    category: 'payment',
    keywords: ['payment', 'received', 'cash', 'collection'],
    is_system: true,
    locale: 'ifrs-generic',
    template_lines: [
      { account_code: '1000', account_name: 'Cash and Cash Equivalents', type: 'debit', description: 'Cash in' },
      { account_code: '1100', account_name: 'Trade Receivables', type: 'credit', description: 'Receivable cleared' },
    ],
  },
  {
    template_name: 'Supplier Invoice',
    description: 'Received invoice from a supplier',
    category: 'expense',
    keywords: ['supplier', 'vendor', 'purchase', 'bill'],
    is_system: true,
    locale: 'ifrs-generic',
    template_lines: [
      { account_code: '5000', account_name: 'Cost of Sales', type: 'debit', description: 'Expense recognized' },
      { account_code: '2000', account_name: 'Trade Payables', type: 'credit', description: 'Liability to supplier' },
    ],
  },
  {
    template_name: 'Payroll Entry',
    description: 'Monthly payroll with employee benefits',
    category: 'payroll',
    keywords: ['salary', 'payroll', 'wages', 'staff'],
    is_system: true,
    locale: 'ifrs-generic',
    template_lines: [
      { account_code: '6000', account_name: 'Employee Benefits Expense', type: 'debit', description: 'Salary cost' },
      { account_code: '2400', account_name: 'Employee Benefits Payable', type: 'credit', description: 'Tax withholding' },
      { account_code: '1000', account_name: 'Cash and Cash Equivalents', type: 'credit', description: 'Net pay' },
    ],
  },
];

const US_GAAP_TEMPLATES = [
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
    template_name: 'Customer Payment',
    description: 'Receiving payment on accounts receivable',
    category: 'payment',
    keywords: ['payment', 'received', 'collection', 'deposit'],
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
    template_name: 'Payroll',
    description: 'Employee payroll with withholdings',
    category: 'payroll',
    keywords: ['payroll', 'salary', 'wages', 'compensation'],
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
];
