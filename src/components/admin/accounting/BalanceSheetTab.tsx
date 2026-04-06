import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building, Banknote, Calculator, CheckCircle, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { useAccountBalances } from '@/hooks/useAccounting';
import { Skeleton } from '@/components/ui/skeleton';

const formatCents = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'SEK', minimumFractionDigits: 0 }).format(cents / 100);

export function BalanceSheetTab() {
  const { data: balances, isLoading } = useAccountBalances();
  const [expanded, setExpanded] = useState(new Set(['assets', 'liabilities', 'equity']));

  const report = useMemo(() => {
    if (!balances) return null;

    const assets = balances.filter((b) => b.account_type === 'asset');
    const liabilities = balances.filter((b) => b.account_type === 'liability');
    const equity = balances.filter((b) => b.account_type === 'equity');

    const totalAssets = assets.reduce((s, a) => s + Math.abs(a.balance), 0);
    const totalLiabilities = liabilities.reduce((s, l) => s + Math.abs(l.balance), 0);
    const totalEquity = equity.reduce((s, e) => s + Math.abs(e.balance), 0);

    const isBalanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1;

    return { assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity, isBalanced };
  }, [balances]);

  const toggleSection = (section: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(section) ? next.delete(section) : next.add(section);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    );
  }

  if (!report) return null;

  const renderSection = (
    title: string,
    key: string,
    accounts: typeof report.assets,
    total: number,
    icon: React.ReactNode,
    color: string
  ) => {
    const isExpanded = expanded.has(key);
    return (
      <Card>
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => toggleSection(key)}
        >
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {icon}
              <span>{title}</span>
              <Badge variant="outline" className={color}>
                {formatCents(total)}
              </Badge>
            </div>
            {isExpanded ? (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            )}
          </CardTitle>
        </CardHeader>
        {isExpanded && (
          <CardContent className="pt-0">
            {accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No accounts in this category</p>
            ) : (
              <div className="space-y-2">
                {accounts.map((account) => (
                  <div
                    key={account.account_code}
                    className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                  >
                    <div>
                      <span className="font-mono text-sm mr-2">{account.account_code}</span>
                      <span className="text-sm">{account.account_name}</span>
                    </div>
                    <div className="font-semibold font-mono">
                      {formatCents(Math.abs(account.balance))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Balance check */}
      <Card className={report.isBalanced ? 'border-green-200' : 'border-red-200'}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {report.isBalanced ? (
                <CheckCircle className="h-6 w-6 text-green-600" />
              ) : (
                <AlertCircle className="h-6 w-6 text-red-600" />
              )}
              <div>
                <h3 className="font-semibold">
                  {report.isBalanced ? 'Balanced' : 'Not Balanced'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Assets {report.isBalanced ? '=' : '≠'} Liabilities + Equity
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Difference</div>
              <div
                className={`font-semibold ${
                  report.isBalanced ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {formatCents(
                  Math.abs(report.totalAssets - (report.totalLiabilities + report.totalEquity))
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
            <Building className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCents(report.totalAssets)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Liabilities</CardTitle>
            <Banknote className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCents(report.totalLiabilities)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Equity</CardTitle>
            <Calculator className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {formatCents(report.totalEquity)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sections */}
      {renderSection(
        'Assets',
        'assets',
        report.assets,
        report.totalAssets,
        <Building className="h-5 w-5 text-blue-600" />,
        'text-blue-600 border-blue-200'
      )}
      {renderSection(
        'Liabilities',
        'liabilities',
        report.liabilities,
        report.totalLiabilities,
        <Banknote className="h-5 w-5 text-red-600" />,
        'text-red-600 border-red-200'
      )}
      {renderSection(
        'Equity',
        'equity',
        report.equity,
        report.totalEquity,
        <Calculator className="h-5 w-5 text-purple-600" />,
        'text-purple-600 border-purple-200'
      )}
    </div>
  );
}
