import { useMemo, useState } from 'react';
import { useAccountBalances } from '@/hooks/useAccounting';
import { useAccountingPreferences } from '@/hooks/useSiteSettings';
import { useAccountingRealtime } from '@/hooks/useAccountingRealtime';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronRight } from 'lucide-react';
import { useFiscalYear } from './FiscalYearContext';
import { AccountingTabHeader } from './AccountingTabHeader';

type Balance = {
  account_code: string;
  account_name: string;
  account_type: string;
  balance: number;
  opening_cents?: number;
};

export function BalanceSheetTab() {
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
    const nonZero = (b: Balance) =>
      showInactive || b.balance !== 0 || (b.opening_cents ?? 0) !== 0;
    const sort = <T extends { account_code: string }>(arr: T[]) =>
      [...arr].sort((a, b) => a.account_code.localeCompare(b.account_code));
    const assets = sort((balances as Balance[]).filter((b) => b.account_type === 'asset').filter(nonZero));
    const liabilities = sort((balances as Balance[]).filter((b) => b.account_type === 'liability').filter(nonZero));
    const equity = sort((balances as Balance[]).filter((b) => b.account_type === 'equity').filter(nonZero));

    const totals = (arr: Balance[]) => {
      const opening = arr.reduce((s, a) => s + (a.opening_cents ?? 0), 0);
      const closing = arr.reduce((s, a) => s + a.balance, 0);
      return { opening, closing, change: closing - opening };
    };

    const assetsT = totals(assets);
    const equityT = totals(equity);
    const liabT = totals(liabilities);
    const eqLiabT = {
      opening: equityT.opening + liabT.opening,
      closing: equityT.closing + liabT.closing,
      change: equityT.change + liabT.change,
    };

    const allOpeningZero = (balances as Balance[]).every((b) => (b.opening_cents ?? 0) === 0);

    return { assets, liabilities, equity, assetsT, equityT, liabT, eqLiabT, allOpeningZero };
  }, [balances, showInactive]);

  if (isLoading) return <Skeleton className="h-96" />;
  if (!report) return null;

  const mutedOpening = report.allOpeningZero;

  return (
    <div className="space-y-4">
      <AccountingTabHeader
        title="Balance Sheet"
        description="What the business owns and owes at year-end, alongside the opening position and the change during the year."
      />
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
        <Section accounts={report.assets} fmt={fmt} mutedOpening={mutedOpening} />
        <TotalRow
          label="Total assets"
          opening={fmt(report.assetsT.opening)}
          change={fmt(report.assetsT.change)}
          closing={fmt(report.assetsT.closing)}
          mutedOpening={mutedOpening}
          strong
        />
      </div>

      <div className="px-6 pt-8 pb-6">
        <ColumnHeader fiscalYear={fiscalYear} label="Equity & liabilities" />
        <SubGroup label="Equity">
          <Section accounts={report.equity} fmt={fmt} mutedOpening={mutedOpening} />
          <TotalRow
            label="Total equity"
            opening={fmt(report.equityT.opening)}
            change={fmt(report.equityT.change)}
            closing={fmt(report.equityT.closing)}
            mutedOpening={mutedOpening}
            strong
          />
        </SubGroup>
        <SubGroup label="Liabilities">
          <Section accounts={report.liabilities} fmt={fmt} mutedOpening={mutedOpening} />
          <TotalRow
            label="Total liabilities"
            opening={fmt(report.liabT.opening)}
            change={fmt(report.liabT.change)}
            closing={fmt(report.liabT.closing)}
            mutedOpening={mutedOpening}
            strong
          />
        </SubGroup>
        <TotalRow
          label="Total equity & liabilities"
          opening={fmt(report.eqLiabT.opening)}
          change={fmt(report.eqLiabT.change)}
          closing={fmt(report.eqLiabT.closing)}
          mutedOpening={mutedOpening}
          strong
        />
      </div>
    </div>
    </div>
  );
}

function ColumnHeader({ fiscalYear, label }: { fiscalYear: number | string; label: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-6 pb-3 border-b">
      <div className="font-semibold">{label}</div>
      <div className="text-right text-xs text-muted-foreground w-28">
        <div>Opening balance</div>
        <div>{fiscalYear}-01-01</div>
      </div>
      <div className="text-right text-xs text-muted-foreground w-24">Change</div>
      <div className="text-right text-xs text-muted-foreground w-28">
        <div>Closing balance</div>
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
  mutedOpening,
}: {
  accounts: Balance[];
  fmt: (n: number) => string;
  mutedOpening?: boolean;
}) {
  if (accounts.length === 0) {
    return <div className="py-2 text-sm text-muted-foreground italic">No entries</div>;
  }
  return (
    <div>
      {accounts.map((a) => {
        const opening = a.opening_cents ?? 0;
        const change = a.balance - opening;
        return (
          <div
            key={a.account_code}
            className="grid grid-cols-[1fr_auto_auto_auto] gap-6 py-1.5 text-sm border-b border-border/40 last:border-b-0"
          >
            <div>
              <span className="font-mono text-muted-foreground">{a.account_code}</span>{' '}
              <span>{a.account_name}</span>
            </div>
            <div
              className={`text-right font-mono tabular-nums w-28 ${
                mutedOpening || opening === 0 ? 'text-muted-foreground/50' : ''
              }`}
            >
              {fmt(opening)}
            </div>
            <div className="text-right font-mono tabular-nums w-24">{fmt(change)}</div>
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
  change,
  closing,
  strong,
  mutedOpening,
}: {
  label: string;
  opening: string;
  change: string;
  closing: string;
  strong?: boolean;
  mutedOpening?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[1fr_auto_auto_auto] gap-6 border-t py-2.5 ${
        strong ? 'font-semibold' : 'font-medium'
      }`}
    >
      <div>{label}</div>
      <div
        className={`text-right font-mono tabular-nums w-28 ${
          mutedOpening ? 'text-muted-foreground/50' : ''
        }`}
      >
        {opening}
      </div>
      <div className="text-right font-mono tabular-nums w-24">{change}</div>
      <div className="text-right font-mono tabular-nums w-28">{closing}</div>
    </div>
  );
}
