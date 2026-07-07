import { useMemo, useState } from 'react';
import { useAccountBalances } from '@/hooks/useAccounting';
import { useAccountingPreferences } from '@/hooks/useSiteSettings';
import { useAccountingRealtime } from '@/hooks/useAccountingRealtime';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronRight } from 'lucide-react';
import { useFiscalYear } from './FiscalYearContext';

export function ProfitLossTab() {
  useAccountingRealtime();
  const { year: fiscalYear } = useFiscalYear();
  const { data: balances, isLoading } = useAccountBalances(fiscalYear);
  const { data: prefs } = useAccountingPreferences();
  const [showDecimals, setShowDecimals] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const fmt = (cents: number) => {
    const decimals = showDecimals ? (prefs?.decimals ?? 2) : 0;
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
    const filter = (b: { balance: number }) => showInactive || b.balance !== 0;
    const revenue = balances
      .filter((b) => b.account_type === 'revenue' || b.account_type === 'income')
      .filter(filter)
      .sort((a, b) => a.account_code.localeCompare(b.account_code));
    const expenses = balances
      .filter((b) => b.account_type === 'expense')
      .filter(filter)
      .sort((a, b) => a.account_code.localeCompare(b.account_code));
    const totalRevenue = revenue.reduce((s, r) => s + r.balance, 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.balance, 0);
    const netResult = totalRevenue - totalExpenses;
    return { revenue, expenses, totalRevenue, totalExpenses, netResult };
  }, [balances, showInactive]);

  if (isLoading) return <Skeleton className="h-96" />;
  if (!report) return null;

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-6 px-6 py-4 border-b">
        <div className="text-sm font-medium">{fiscalYear}</div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Checkbox checked={showDecimals} onCheckedChange={(v) => setShowDecimals(!!v)} />
          Show decimals
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Checkbox checked={showInactive} onCheckedChange={(v) => setShowInactive(!!v)} />
          Show inactive
        </label>
      </div>

      <div className="px-6 pt-6 pb-2">
        <Section
          title="Operating income"
          period={fiscalYear}
          accounts={report.revenue}
          fmt={fmt}
          sign={1}
        />
        <TotalRow label="Total operating income" amount={fmt(report.totalRevenue)} />
      </div>

      <div className="px-6 pt-6 pb-2">
        <Section
          title="Operating expenses"
          period={fiscalYear}
          accounts={report.expenses}
          fmt={fmt}
          sign={-1}
        />
        <TotalRow label="Total operating expenses" amount={fmt(-report.totalExpenses)} />
      </div>

      <div className="px-6 pt-6 pb-2">
        <SectionTitle title="Operating result" period={fiscalYear} />
        <TotalRow label="Total operating result" amount={fmt(report.netResult)} />
      </div>

      <div className="px-6 pt-6 pb-6">
        <SectionTitle title="Calculated result" period={fiscalYear} />
        <TotalRow label="Calculated result" amount={fmt(report.netResult)} strong />
      </div>
    </div>
  );
}

function SectionTitle({ title, period }: { title: string; period: number | string }) {
  return (
    <div className="flex items-baseline justify-between pb-2">
      <div className="font-semibold">{title}</div>
      <div className="text-xs text-muted-foreground">{period}</div>
    </div>
  );
}

function Section({
  title,
  period,
  accounts,
  fmt,
  sign,
}: {
  title: string;
  period: number | string;
  accounts: Array<{ account_code: string; account_name: string; balance: number }>;
  fmt: (n: number) => string;
  sign: 1 | -1;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <SectionTitle title={title} period={period} />
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 py-2 text-sm text-muted-foreground hover:text-foreground w-full"
      >
        <ChevronRight
          className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span>{open ? 'Hide accounts' : `Show ${accounts.length} accounts`}</span>
      </button>
      {open && (
        <div className="pl-6">
          {accounts.length === 0 ? (
            <div className="py-2 text-sm text-muted-foreground italic">No entries</div>
          ) : (
            accounts.map((a) => (
              <div
                key={a.account_code}
                className="flex items-baseline justify-between py-1.5 text-sm border-b border-border/40 last:border-b-0"
              >
                <div>
                  <span className="font-mono text-muted-foreground">{a.account_code}</span>{' '}
                  <span>{a.account_name}</span>
                </div>
                <div className="font-mono tabular-nums">{fmt(sign * a.balance)}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function TotalRow({
  label,
  amount,
  strong,
}: {
  label: string;
  amount: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between border-t py-2.5 ${
        strong ? 'font-semibold' : 'font-medium'
      }`}
    >
      <div>{label}</div>
      <div className="font-mono tabular-nums">{amount}</div>
    </div>
  );
}
