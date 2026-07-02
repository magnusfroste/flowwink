import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BookOpen, Search } from 'lucide-react';
import { useAccountBalances } from '@/hooks/useAccounting';
import { useAccountingPreferences, useBrandingSettings } from '@/hooks/useSiteSettings';
import { Skeleton } from '@/components/ui/skeleton';

type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

const TYPE_ORDER: AccountType[] = ['asset', 'liability', 'equity', 'income', 'expense'];

const TYPE_LABEL: Record<AccountType, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  income: 'Income',
  expense: 'Expenses',
};

export function LedgerTab() {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | AccountType>('all');
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

  const filtered = useMemo(
    () =>
      (balances || []).filter((b) => {
        const hasActivity = b.debit_total !== 0 || b.credit_total !== 0;
        if (!hasActivity) return false;
        const matchesSearch =
          !search ||
          b.account_code.includes(search) ||
          b.account_name.toLowerCase().includes(search.toLowerCase());
        const matchesType = filterType === 'all' || b.account_type === filterType;
        return matchesSearch && matchesType;
      }),
    [balances, search, filterType],
  );

  const grouped = useMemo(() => {
    const g: Record<AccountType, typeof filtered> = {
      asset: [], liability: [], equity: [], income: [], expense: [],
    };
    for (const b of filtered) {
      const t = (b.account_type as AccountType) ?? 'asset';
      (g[t] ??= []).push(b);
    }
    for (const t of TYPE_ORDER) {
      g[t]?.sort((a, b) => a.account_code.localeCompare(b.account_code));
    }
    return g;
  }, [filtered]);

  const totals = useMemo(() => {
    let debit = 0, credit = 0;
    for (const b of filtered) { debit += b.debit_total; credit += b.credit_total; }
    return { debit, credit, diff: debit - credit };
  }, [filtered]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10" />
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
      </div>
    );
  }

  const orgName = branding?.organizationName || 'Organization';
  const today = new Date();
  const fiscalYear = today.getFullYear();
  const generated = today.toISOString().slice(0, 16).replace('T', ' ');

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search account code or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterType} onValueChange={(v) => setFilterType(v as any)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {TYPE_ORDER.map((t) => (
              <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border bg-card py-12 text-center">
          <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No accounts with activity</h3>
          <p className="text-sm text-muted-foreground">
            Post journal entries to see account balances here
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          {/* Report header */}
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 px-6 pt-6 pb-4 border-b">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">General Ledger</h2>
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
                <th className="text-right font-semibold px-6 py-2 whitespace-nowrap w-36">Debit</th>
                <th className="text-right font-semibold px-6 py-2 whitespace-nowrap w-36">Credit</th>
                <th className="text-right font-semibold px-6 py-2 whitespace-nowrap w-40">Balance</th>
              </tr>
            </thead>
            <tbody>
              {TYPE_ORDER.map((type) => {
                const rows = grouped[type];
                if (!rows || rows.length === 0) return null;
                const subDebit = rows.reduce((s, r) => s + r.debit_total, 0);
                const subCredit = rows.reduce((s, r) => s + r.credit_total, 0);
                const subBalance = rows.reduce((s, r) => s + r.balance, 0);

                return (
                  <RenderGroup
                    key={type}
                    label={TYPE_LABEL[type]}
                    rows={rows}
                    subDebit={subDebit}
                    subCredit={subCredit}
                    subBalance={subBalance}
                    fmt={fmt}
                  />
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-foreground text-background">
                <td className="px-6 py-3 font-semibold">
                  {totals.diff === 0 ? 'Total (balanced)' : 'Total'}
                </td>
                <td className="px-6 py-3 text-right font-mono font-semibold">{fmt(totals.debit)}</td>
                <td className="px-6 py-3 text-right font-mono font-semibold">{fmt(totals.credit)}</td>
                <td className="px-6 py-3 text-right font-mono font-semibold">
                  {totals.diff === 0 ? fmt(0) : `Δ ${fmt(totals.diff)}`}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function RenderGroup({
  label, rows, subDebit, subCredit, subBalance, fmt,
}: {
  label: string;
  rows: any[];
  subDebit: number;
  subCredit: number;
  subBalance: number;
  fmt: (c: number) => string;
}) {
  return (
    <>
      <tr className="bg-foreground text-background">
        <td className="px-6 py-2.5 font-semibold">{label}</td>
        <td className="px-6 py-2.5 text-right font-mono font-semibold">{fmt(subDebit)}</td>
        <td className="px-6 py-2.5 text-right font-mono font-semibold">{fmt(subCredit)}</td>
        <td className="px-6 py-2.5 text-right font-mono font-semibold">{fmt(subBalance)}</td>
      </tr>
      {rows.map((account) => (
        <tr key={account.account_code} className="odd:bg-muted/20">
          <td className="px-6 py-1.5 pl-10 text-muted-foreground">
            <span className="font-mono">{account.account_code}</span> - {account.account_name}
          </td>
          <td className="px-6 py-1.5 text-right font-mono">{fmt(account.debit_total)}</td>
          <td className="px-6 py-1.5 text-right font-mono">{fmt(account.credit_total)}</td>
          <td className="px-6 py-1.5 text-right font-mono font-medium">{fmt(account.balance)}</td>
        </tr>
      ))}
      <tr className="border-t">
        <td className="px-6 py-2 pl-10 font-semibold">Total {label.toLowerCase()}</td>
        <td className="px-6 py-2 text-right font-mono font-semibold">{fmt(subDebit)}</td>
        <td className="px-6 py-2 text-right font-mono font-semibold">{fmt(subCredit)}</td>
        <td className="px-6 py-2 text-right font-mono font-semibold">{fmt(subBalance)}</td>
      </tr>
    </>
  );
}
