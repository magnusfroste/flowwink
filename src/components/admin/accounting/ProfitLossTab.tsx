import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, FileText } from 'lucide-react';
import { useAccountBalances } from '@/hooks/useAccounting';
import { Skeleton } from '@/components/ui/skeleton';

const formatCents = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'SEK', minimumFractionDigits: 0 }).format(cents / 100);

export function ProfitLossTab() {
  const { data: balances, isLoading } = useAccountBalances();

  const report = useMemo(() => {
    if (!balances) return null;

    const revenue = balances
      .filter((b) => b.account_type === 'income')
      .map((b) => ({ ...b, total: b.balance }));
    const expenses = balances
      .filter((b) => b.account_type === 'expense')
      .map((b) => ({ ...b, total: b.balance }));

    const totalRevenue = revenue.reduce((s, r) => s + r.total, 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.total, 0);
    const netResult = totalRevenue - totalExpenses;

    return { revenue, expenses, totalRevenue, totalExpenses, netResult };
  }, [balances]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCents(report.totalRevenue)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCents(report.totalExpenses)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Result</CardTitle>
            <FileText className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                report.netResult >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {formatCents(report.netResult)}
            </div>
            <Badge variant={report.netResult >= 0 ? 'default' : 'destructive'} className="mt-2">
              {report.netResult >= 0 ? 'Profit' : 'Loss'}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {report.revenue.length === 0 ? (
                <p className="text-sm text-muted-foreground">No revenue recorded</p>
              ) : (
                report.revenue.map((item) => (
                  <div
                    key={item.account_code}
                    className="flex items-center justify-between py-2 border-b border-border/20 last:border-0"
                  >
                    <div className="text-sm">
                      <span className="font-mono mr-2">{item.account_code}</span>
                      {item.account_name}
                    </div>
                    <div className="font-semibold text-green-600">
                      {formatCents(item.total)}
                    </div>
                  </div>
                ))
              )}
              {report.revenue.length > 0 && (
                <div className="flex justify-between pt-3 border-t font-semibold">
                  <span>Total</span>
                  <span className="text-green-600">{formatCents(report.totalRevenue)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-600" />
              Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {report.expenses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No expenses recorded</p>
              ) : (
                report.expenses.map((item) => (
                  <div
                    key={item.account_code}
                    className="flex items-center justify-between py-2 border-b border-border/20 last:border-0"
                  >
                    <div className="text-sm">
                      <span className="font-mono mr-2">{item.account_code}</span>
                      {item.account_name}
                    </div>
                    <div className="font-semibold text-red-600">
                      {formatCents(item.total)}
                    </div>
                  </div>
                ))
              )}
              {report.expenses.length > 0 && (
                <div className="flex justify-between pt-3 border-t font-semibold">
                  <span>Total</span>
                  <span className="text-red-600">{formatCents(report.totalExpenses)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
