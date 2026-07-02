import { useMemo } from 'react';
import { useAccountBalances } from '@/hooks/useAccounting';
import { useAccountingPreferences } from '@/hooks/useSiteSettings';
import { useBrandingSettings } from '@/hooks/useSiteSettings';
import { Skeleton } from '@/components/ui/skeleton';

export function ProfitLossTab() {
  const { data: balances, isLoading } = useAccountBalances();
  const { data: prefs } = useAccountingPreferences();
  const { data: branding } = useBrandingSettings();

  const fmt = (cents: number) => {
    const decimals = prefs?.decimals ?? 2;
    const decSep = prefs?.decimalSeparator ?? ',';
    const thouSep = prefs?.thousandsSeparator ?? ' ';
    const neg = cents < 0;
    const n = Math.abs(cents) / 100;
    const [intPart, decPart] = n.toFixed(decimals).split('.');
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thouSep);
    const body = decimals > 0 ? `${grouped}${decSep}${decPart}` : grouped;
    return neg ? `\u2212${body}` : body;
  };

  const report = useMemo(() => {
    if (!balances) return null;
    const revenue = balances
      .filter((b) => b.account_type === 'revenue' || b.account_type === 'income')
      .filter((b) => b.balance !== 0)
      .sort((a, b) => a.account_code.localeCompare(b.account_code));
    const expenses = balances
      .filter((b) => b.account_type === 'expense')
      .filter((b) => b.balance !== 0)
      .sort((a, b) => a.account_code.localeCompare(b.account_code));
    const totalRevenue = revenue.reduce((s, r) => s + r.balance, 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.balance, 0);
    const netResult = totalRevenue - totalExpenses;
    return { revenue, expenses, totalRevenue, totalExpenses, netResult };
  }, [balances]);

  if (isLoading) return <Skeleton className="h-96" />;
  if (!report) return null;

  const orgName = branding?.organizationName || 'Organization';
  const today = new Date();
  const fiscalYear = today.getFullYear();
  const generated = today.toISOString().slice(0, 16).replace('T', ' ');

  return (
    <div className="rounded-lg border bg-card">
      {/* Report header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 px-6 pt-6 pb-4 border-b">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Profit &amp; Loss</h2>
          <div className="mt-3 text-sm">
            <div className="font-semibold">{orgName}</div>
          </div>
        </div>
        <div className="text-sm text-muted-foreground grid grid-cols-[auto_auto] gap-x-4 gap-y-1">
          <span>Fiscal year</span><span className="text-foreground">{fiscalYear}</span>
          <span>Report period</span><span className="text-foreground">{fiscalYear}-01-01 – {fiscalYear}-12-31</span>
          <span>Generated</span><span className="text-foreground">{generated}</span>
        </div>
      </div>

      {/* Report table */}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left font-semibold px-6 py-2 w-full">Account</th>
            <th className="text-right font-semibold px-6 py-2 whitespace-nowrap">Accumulated</th>
          </tr>
        </thead>
        <tbody>
          <GroupHeader label="Operating income" amount={fmt(report.totalRevenue)} />
          <SubHeader label="Net revenue" amount={fmt(report.totalRevenue)} />
          {report.revenue.length === 0 && <EmptyRow />}
          {report.revenue.map((a) => (
            <AccountRow key={a.account_code} code={a.account_code} name={a.account_name} amount={fmt(a.balance)} />
          ))}

          <GroupHeader label="Operating expenses" amount={fmt(-report.totalExpenses)} />
          <SubHeader label="Other external expenses" amount={fmt(-report.totalExpenses)} />
          {report.expenses.length === 0 && <EmptyRow />}
          {report.expenses.map((a) => (
            <AccountRow key={a.account_code} code={a.account_code} name={a.account_name} amount={fmt(-a.balance)} />
          ))}

          <GroupHeader label="Net result" amount={fmt(report.netResult)} />
          <SubHeader label="Result for the year" amount={fmt(report.netResult)} />
        </tbody>
        <tfoot>
          <tr className="bg-foreground text-background">
            <td className="px-6 py-3 font-semibold">Calculated result</td>
            <td className="px-6 py-3 text-right font-mono font-semibold">{fmt(report.netResult)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function GroupHeader({ label, amount }: { label: string; amount: string }) {
  return (
    <tr className="bg-foreground text-background">
      <td className="px-6 py-2.5 font-semibold">{label}</td>
      <td className="px-6 py-2.5 text-right font-mono font-semibold">{amount}</td>
    </tr>
  );
}

function SubHeader({ label, amount }: { label: string; amount: string }) {
  return (
    <tr className="border-y bg-muted/60">
      <td className="px-6 py-2 font-semibold">{label}</td>
      <td className="px-6 py-2 text-right font-mono font-semibold">{amount}</td>
    </tr>
  );
}

function AccountRow({ code, name, amount }: { code: string; name: string; amount: string }) {
  return (
    <tr className="odd:bg-muted/20">
      <td className="px-6 py-1.5 pl-10 text-muted-foreground">
        <span className="font-mono">{code}</span> - {name}
      </td>
      <td className="px-6 py-1.5 text-right font-mono">{amount}</td>
    </tr>
  );
}

function EmptyRow() {
  return (
    <tr>
      <td colSpan={2} className="px-6 py-3 pl-10 text-sm text-muted-foreground italic">No entries</td>
    </tr>
  );
}
