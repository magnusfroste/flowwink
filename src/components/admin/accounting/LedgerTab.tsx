import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { BookOpen, Search } from 'lucide-react';
import { useAccountBalances, useAccountLedger } from '@/hooks/useAccounting';
import { useAccountingRealtime } from '@/hooks/useAccountingRealtime';
import { useAccountingPreferences } from '@/hooks/useSiteSettings';
import { Skeleton } from '@/components/ui/skeleton';

export function LedgerTab() {
  const [search, setSearch] = useState('');
  const { data: balances, isLoading } = useAccountBalances();
  const { data: prefs } = useAccountingPreferences();

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
      (balances || [])
        .filter((b) => b.debit_total !== 0 || b.credit_total !== 0)
        .filter((b) => {
          if (!search) return true;
          const s = search.toLowerCase();
          return b.account_code.includes(search) || b.account_name.toLowerCase().includes(s);
        })
        .sort((a, b) => a.account_code.localeCompare(b.account_code)),
    [balances, search],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10" />
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search account code or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
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
        <div className="space-y-4">
          {filtered.map((account) => (
            <AccountCard
              key={account.account_code}
              code={account.account_code}
              name={account.account_name}
              fmt={fmt}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AccountCard({
  code, name, fmt,
}: {
  code: string;
  name: string;
  fmt: (c: number) => string;
}) {
  const { data, isLoading } = useAccountLedger(code);

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-baseline justify-between px-5 py-3 border-b bg-muted/30">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-base font-semibold">{code}</span>
          <span className="text-sm text-muted-foreground">{name}</span>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Current</div>
          <div className="font-mono text-lg font-semibold">
            {data ? fmt(data.closing_cents) : '—'}
          </div>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="px-5 py-4 text-sm text-muted-foreground">Loading…</div>
      ) : (
        <AccountRows data={data} fmt={fmt} />
      )}
    </div>
  );
}

function AccountRows({ data, fmt }: { data: any; fmt: (c: number) => string }) {
  const voucherLabel = (l: any) => {
    if (l.voucher_series && l.voucher_number != null) {
      return `${l.voucher_series}${l.voucher_number}${l.voucher_year ? `/${String(l.voucher_year).slice(-2)}` : ''}`;
    }
    return l.reference_number || '—';
  };

  let running = data.opening_cents;
  const rows = data.lines.map((l: any) => {
    const delta = data.normal_balance === 'debit'
      ? l.debit_cents - l.credit_cents
      : l.credit_cents - l.debit_cents;
    running += delta;
    return { ...l, delta, running };
  });

  return (
    <table className="w-full text-sm">
      <tbody>
        <tr className="border-b bg-muted/10">
          <td className="px-5 py-2 text-muted-foreground italic" colSpan={3}>Opening balance</td>
          <td className="px-5 py-2 text-right font-mono">{fmt(data.opening_cents)}</td>
        </tr>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={4} className="px-5 py-4 text-center text-sm text-muted-foreground">
              No transactions
            </td>
          </tr>
        ) : (
          rows.map((l: any, i: number) => (
            <tr key={l.entry_id + i} className="border-b last:border-b-0">
              <td className="px-5 py-1.5 font-mono text-xs text-muted-foreground w-28">{voucherLabel(l)}</td>
              <td className="px-5 py-1.5 font-mono text-xs text-muted-foreground w-24">{l.entry_date}</td>
              <td className="px-5 py-1.5">
                <span className="truncate">{l.description}</span>
              </td>
              <td className="px-5 py-1.5 text-right font-mono whitespace-nowrap w-40">
                <span className={l.delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}>
                  {l.delta >= 0 ? '+' : '\u2212'}{fmt(Math.abs(l.delta))}
                </span>
                <span className="text-muted-foreground ml-3">{fmt(l.running)}</span>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
