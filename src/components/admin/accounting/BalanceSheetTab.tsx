import { useMemo } from 'react';
import { useAccountBalances } from '@/hooks/useAccounting';
import { useAccountingPreferences, useBrandingSettings } from '@/hooks/useSiteSettings';
import { useAccountingRealtime } from '@/hooks/useAccountingRealtime';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { useFiscalYear } from './FiscalYearContext';

export function BalanceSheetTab() {
  useAccountingRealtime();
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
    const nonZero = (b: { balance: number }) => b.balance !== 0;
    const sort = <T extends { account_code: string }>(arr: T[]) =>
      [...arr].sort((a, b) => a.account_code.localeCompare(b.account_code));
    const assets = sort(balances.filter((b) => b.account_type === 'asset').filter(nonZero));
    const liabilities = sort(balances.filter((b) => b.account_type === 'liability').filter(nonZero));
    const equity = sort(balances.filter((b) => b.account_type === 'equity').filter(nonZero));

    const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
    const totalLiabilities = liabilities.reduce((s, l) => s + l.balance, 0);
    const totalEquity = equity.reduce((s, e) => s + e.balance, 0);
    const diff = totalAssets - (totalLiabilities + totalEquity);
    return { assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity, diff };
  }, [balances]);

  if (isLoading) return <Skeleton className="h-96" />;
  if (!report) return null;

  const orgName = branding?.organizationName || 'Organization';
  const today = new Date();
  const fiscalYear = today.getFullYear();
  const generated = today.toISOString().slice(0, 16).replace('T', ' ');
  const balanced = Math.abs(report.diff) < 1;

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 px-6 pt-6 pb-4 border-b">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Balance Sheet</h2>
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

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left font-semibold px-6 py-2 w-full">Account</th>
            <th className="text-right font-semibold px-6 py-2 whitespace-nowrap">Closing balance</th>
          </tr>
        </thead>
        <tbody>
          <GroupHeader label="Assets" amount={fmt(report.totalAssets)} />
          {report.assets.length === 0 && <EmptyRow />}
          {report.assets.map((a) => (
            <AccountRow key={a.account_code} code={a.account_code} name={a.account_name} amount={fmt(a.balance)} />
          ))}
          <SubtotalRow label="Total assets" amount={fmt(report.totalAssets)} />

          <GroupHeader
            label="Equity & liabilities"
            amount={fmt(report.totalEquity + report.totalLiabilities)}
          />
          <SubHeader label="Equity" amount={fmt(report.totalEquity)} />
          {report.equity.length === 0 && <EmptyRow />}
          {report.equity.map((a) => (
            <AccountRow key={a.account_code} code={a.account_code} name={a.account_name} amount={fmt(a.balance)} />
          ))}
          <SubHeader label="Liabilities" amount={fmt(report.totalLiabilities)} />
          {report.liabilities.length === 0 && <EmptyRow />}
          {report.liabilities.map((a) => (
            <AccountRow key={a.account_code} code={a.account_code} name={a.account_name} amount={fmt(a.balance)} />
          ))}
          <SubtotalRow
            label="Total equity & liabilities"
            amount={fmt(report.totalEquity + report.totalLiabilities)}
          />
        </tbody>
        <tfoot>
          <tr className="bg-foreground text-background">
            <td className="px-6 py-3 font-semibold">
              <div className="flex items-center gap-2">
                {balanced ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                Calculated difference
              </div>
            </td>
            <td className="px-6 py-3 text-right font-mono font-semibold">{fmt(report.diff)}</td>
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

function SubtotalRow({ label, amount }: { label: string; amount: string }) {
  return (
    <tr className="border-t">
      <td className="px-6 py-2 pl-10 font-semibold">{label}</td>
      <td className="px-6 py-2 text-right font-mono font-semibold">{amount}</td>
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
