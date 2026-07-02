import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BookOpen, Search, ChevronRight } from 'lucide-react';
import { useAccountBalances } from '@/hooks/useAccounting';
import { useAccountingPreferences } from '@/hooks/useSiteSettings';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

// Order matches balance-sheet convention: A / L / E, then P&L: I / E.
const TYPE_ORDER: AccountType[] = ['asset', 'liability', 'equity', 'income', 'expense'];

const TYPE_LABEL: Record<AccountType, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  income: 'Income',
  expense: 'Expenses',
};

// Semantic accent classes — use tokens so dark mode / theming works.
const TYPE_ACCENT: Record<AccountType, string> = {
  asset: 'bg-primary/10 text-primary border-primary/20',
  liability: 'bg-destructive/10 text-destructive border-destructive/20',
  equity: 'bg-accent/40 text-accent-foreground border-accent',
  income: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  expense: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
};

export function LedgerTab() {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | AccountType>('all');
  const [showZero, setShowZero] = useState(false);
  const { data: balances, isLoading } = useAccountBalances();
  const { data: prefs } = useAccountingPreferences();

  const formatCents = (cents: number) => {
    const decimals = prefs?.decimals ?? 2;
    const decimalSep = prefs?.decimalSeparator ?? ',';
    const thouSep = prefs?.thousandsSeparator ?? ' ';
    const n = cents / 100;
    const [intPart, decPart] = Math.abs(n).toFixed(decimals).split('.');
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thouSep);
    return decimals > 0 ? `${grouped}${decimalSep}${decPart}` : grouped;
  };

  const filtered = useMemo(
    () =>
      (balances || []).filter((b) => {
        const matchesSearch =
          !search ||
          b.account_code.includes(search) ||
          b.account_name.toLowerCase().includes(search.toLowerCase());
        const matchesType = filterType === 'all' || b.account_type === filterType;
        const matchesZero = showZero || b.debit_total !== 0 || b.credit_total !== 0;
        return matchesSearch && matchesType && matchesZero;
      }),
    [balances, search, filterType, showZero],
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
        <Button
          variant={showZero ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setShowZero((s) => !s)}
        >
          {showZero ? 'Hiding empty accounts…' : 'Show empty accounts'}
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No accounts with activity</h3>
            <p className="text-sm text-muted-foreground">
              Post journal entries to see account balances here
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b sticky top-0 z-10">
                <tr className="text-left">
                  <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground w-28">Code</th>
                  <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">Account</th>
                  <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground text-right w-36">Debit</th>
                  <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground text-right w-36">Credit</th>
                  <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground text-right w-40">Balance</th>
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
                    <GroupRows
                      key={type}
                      type={type}
                      rows={rows}
                      subDebit={subDebit}
                      subCredit={subCredit}
                      subBalance={subBalance}
                      formatCents={formatCents}
                    />
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 bg-muted/40">
                <tr>
                  <td colSpan={2} className="px-4 py-3 font-semibold">Total</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">{formatCents(totals.debit)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">{formatCents(totals.credit)}</td>
                  <td className={cn(
                    'px-4 py-3 text-right font-mono font-semibold',
                    totals.diff === 0 ? 'text-muted-foreground' : 'text-destructive',
                  )}>
                    {totals.diff === 0 ? '— balanced —' : `Δ ${formatCents(totals.diff)}`}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function GroupRows({
  type, rows, subDebit, subCredit, subBalance, formatCents,
}: {
  type: AccountType;
  rows: any[];
  subDebit: number;
  subCredit: number;
  subBalance: number;
  formatCents: (c: number) => string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <>
      <tr className="bg-muted/30 border-y">
        <td colSpan={2} className="px-4 py-2">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="flex items-center gap-2 font-medium hover:text-primary transition-colors"
          >
            <ChevronRight className={cn('h-4 w-4 transition-transform', !collapsed && 'rotate-90')} />
            <Badge variant="outline" className={cn('border', TYPE_ACCENT[type])}>
              {TYPE_LABEL[type]}
            </Badge>
            <span className="text-xs text-muted-foreground">{rows.length} accounts</span>
          </button>
        </td>
        <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">{formatCents(subDebit)}</td>
        <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">{formatCents(subCredit)}</td>
        <td className="px-4 py-2 text-right font-mono text-xs font-semibold">
          {subBalance < 0 ? `(${formatCents(subBalance)})` : formatCents(subBalance)}
        </td>
      </tr>
      {!collapsed && rows.map((account) => {
        const isZero = account.debit_total === 0 && account.credit_total === 0;
        return (
          <tr key={account.account_code} className="border-b hover:bg-muted/30 transition-colors">
            <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{account.account_code}</td>
            <td className="px-4 py-2">{account.account_name}</td>
            <td className={cn('px-4 py-2 text-right font-mono tabular-nums', account.debit_total === 0 && 'text-muted-foreground/50')}>
              {formatCents(account.debit_total)}
            </td>
            <td className={cn('px-4 py-2 text-right font-mono tabular-nums', account.credit_total === 0 && 'text-muted-foreground/50')}>
              {formatCents(account.credit_total)}
            </td>
            <td className={cn(
              'px-4 py-2 text-right font-mono tabular-nums font-medium',
              isZero
                ? 'text-muted-foreground/50'
                : account.balance < 0
                  ? 'text-destructive'
                  : 'text-foreground',
            )}>
              {account.balance < 0 ? `(${formatCents(account.balance)})` : formatCents(account.balance)}
            </td>
          </tr>
        );
      })}
    </>
  );
}
