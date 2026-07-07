import { useMemo, useState } from 'react';
import { useAccountBalances } from '@/hooks/useAccounting';
import { useAccountingPreferences } from '@/hooks/useSiteSettings';
import { useAccountingRealtime } from '@/hooks/useAccountingRealtime';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronRight } from 'lucide-react';
import { useFiscalYear } from './FiscalYearContext';

type Balance = {
  account_code: string;
  account_name: string;
  account_type: string;
  balance: number;
  opening_balance?: number;
};

export function BalanceSheetTab() {
  useAccountingRealtime();
  const { data: balances, isLoading } = useAccountBalances();
  const { data: prefs } = useAccountingPreferences();
  const { year: fiscalYear } = useFiscalYear();
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
    const nonZero = (b: Balance) =>
      showInactive || b.balance !== 0 || (b.opening_balance ?? 0) !== 0;
    const sort = <T extends { account_code: string }>(arr: T[]) =>
      [...arr].sort((a, b) => a.account_code.localeCompare(b.account_code));
    const assets = sort((balances as Balance[]).filter((b) => b.account_type === 'asset').filter(nonZero));
    const liabilities = sort((balances as Balance[]).filter((b) => b.account_type === 'liability').filter(nonZero));
    const equity = sort((balances as Balance[]).filter((b) => b.account_type === 'equity').filter(nonZero));

    const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
    const totalLiabilities = liabilities.reduce((s, l) => s + l.balance, 0);
    const totalEquity = equity.reduce((s, e) => s + e.balance, 0);
    const openingAssets = assets.reduce((s, a) => s + (a.opening_balance ?? 0), 0);
    const openingLiab = liabilities.reduce((s, a) => s + (a.opening_balance ?? 0), 0);
    const openingEquity = equity.reduce((s, a) => s + (a.opening_balance ?? 0), 0);
    return {
      assets,
      liabilities,
      equity,
      totalAssets,
      totalLiabilities,
      totalEquity,
      openingAssets,
      openingLiab,
      openingEquity,
    };
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

      <div className="px-6 pt-6">
        <ColumnHeader fiscalYear={fiscalYear} label="Assets" />
        <Section
          accounts={report.assets}
          fmt={fmt}
        />
        <TotalRow
          label="Total assets"
          opening={fmt(report.openingAssets)}
          delta={fmt(report.totalAssets - report.openingAssets)}
          closing={fmt(report.totalAssets)}
          strong
        />
      </div>

      <div className="px-6 pt-8 pb-6">
        <ColumnHeader fiscalYear={fiscalYear} label="Equity & liabilities" />
        <SubGroup label="Equity">
          <Section accounts={report.equity} fmt={fmt} />
        </SubGroup>
        <SubGroup label="Liabilities">
          <Section accounts={report.liabilities} fmt={fmt} />
        </SubGroup>
        <TotalRow
          label="Total equity & liabilities"
          opening={fmt(report.openingEquity + report.openingLiab)}
          delta={fmt(
            report.totalEquity + report.totalLiabilities - report.openingEquity - report.openingLiab,
          )}
          closing={fmt(report.totalEquity + report.totalLiabilities)}
          strong
        />
      </div>
    </div>
  );
}

function ColumnHeader({ fiscalYear, label }: { fiscalYear: number | string; label: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-6 pb-3 border-b">
      <div className="font-semibold">{label}</div>
      <div className="text-right text-xs text-muted-foreground w-28">
        <div>Opening</div>
        <div>{fiscalYear}-01-01</div>
      </div>
      <div className="text-right text-xs text-muted-foreground w-24">Result</div>
      <div className="text-right text-xs text-muted-foreground w-28">
        <div>Closing</div>
        <div>{fiscalYear}-12-31</div>
      </div>
    </div>
  );
}

function SubGroup({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="pt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 py-1 text-sm font-medium hover:text-foreground/80"
      >
        <ChevronRight className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`} />
        {label}
      </button>
      {open && <div className="pl-6">{children}</div>}
    </div>
  );
}

function Section({
  accounts,
  fmt,
}: {
  accounts: Balance[];
  fmt: (n: number) => string;
}) {
  if (accounts.length === 0) {
    return <div className="py-2 text-sm text-muted-foreground italic">No entries</div>;
  }
  return (
    <div>
      {accounts.map((a) => {
        const opening = a.opening_balance ?? 0;
        const delta = a.balance - opening;
        return (
          <div
            key={a.account_code}
            className="grid grid-cols-[1fr_auto_auto_auto] gap-6 py-1.5 text-sm border-b border-border/40 last:border-b-0"
          >
            <div>
              <span className="font-mono text-muted-foreground">{a.account_code}</span>{' '}
              <span>{a.account_name}</span>
            </div>
            <div className="text-right font-mono tabular-nums text-muted-foreground w-28">
              {fmt(opening)}
            </div>
            <div className="text-right font-mono tabular-nums w-24">{fmt(delta)}</div>
            <div className="text-right font-mono tabular-nums w-28">{fmt(a.balance)}</div>
          </div>
        );
      })}
    </div>
  );
}

function TotalRow({
  label,
  opening,
  delta,
  closing,
  strong,
}: {
  label: string;
  opening: string;
  delta: string;
  closing: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[1fr_auto_auto_auto] gap-6 border-t py-2.5 ${
        strong ? 'font-semibold' : 'font-medium'
      }`}
    >
      <div>{label}</div>
      <div className="text-right font-mono tabular-nums w-28">{opening}</div>
      <div className="text-right font-mono tabular-nums w-24">{delta}</div>
      <div className="text-right font-mono tabular-nums w-28">{closing}</div>
    </div>
  );
}
