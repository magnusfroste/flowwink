import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { BookOpen, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useAccountBalances, useAccountLedger } from '@/hooks/useAccounting';
import { useAccountingRealtime } from '@/hooks/useAccountingRealtime';
import { useAccountingPreferences } from '@/hooks/useSiteSettings';
import { Skeleton } from '@/components/ui/skeleton';
import { useFiscalYear } from './FiscalYearContext';

export function LedgerTab() {
  useAccountingRealtime();
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const { year: fiscalYear } = useFiscalYear();
  const { data: balances, isLoading } = useAccountBalances(fiscalYear);
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
        .filter((b) => showInactive || b.debit_total !== 0 || b.credit_total !== 0)
        .filter((b) => {
          if (!search) return true;
          const s = search.toLowerCase();
          return b.account_code.includes(search) || b.account_name.toLowerCase().includes(s);
        })
        .sort((a, b) => a.account_code.localeCompare(b.account_code)),
    [balances, search, showInactive],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-6 px-6 py-4 border-b">
        <div className="text-sm font-medium">{fiscalYear}</div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Checkbox checked={showInactive} onCheckedChange={(v) => setShowInactive(!!v)} />
          Show inactive
        </label>
        <div className="relative flex-1 min-w-[200px] max-w-md ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search account code or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-9"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
          <h3 className="text-sm font-medium mb-1">No accounts with activity</h3>
          <p className="text-sm text-muted-foreground">
            Post journal entries to see account balances here
          </p>
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-6 px-6 py-2 text-xs text-muted-foreground border-b">
            <div>Account</div>
            <div className="text-right w-28">Opening</div>
            <div className="text-right w-28">Closing</div>
          </div>
          {filtered.map((account) => (
            <AccountRow
              key={account.account_code}
              code={account.account_code}
              name={account.account_name}
              opening_cents={account.opening_cents}
              closing_cents={account.closing_cents}
              fmt={fmt}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AccountRow({
  code,
  name,
  opening_cents,
  closing_cents,
  fmt,
}: {
  code: string;
  name: string;
  opening_cents: number;
  closing_cents: number;
  fmt: (c: number) => string;
}) {
  const [open, setOpen] = useState(false);
  const { year: ledgerFiscalYear } = useFiscalYear();
  const { data, isLoading } = useAccountLedger(open ? code : null, ledgerFiscalYear);

  return (
    <div className="border-b border-border/60 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full grid grid-cols-[1fr_auto_auto_auto] items-center gap-6 px-6 py-3 hover:bg-muted/30 text-left"
      >
        <div className="flex items-baseline gap-3">
          <span className="font-mono font-semibold text-sm">{code}</span>
          <span className="text-sm text-muted-foreground truncate">{name}</span>
        </div>
        <div className="text-right font-mono tabular-nums text-sm text-muted-foreground w-28">
          {fmt(opening_cents)}
        </div>
        <div className="text-right font-mono tabular-nums text-sm w-28">
          {fmt(closing_cents)}
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="bg-muted/20 border-t">
          {isLoading || !data ? (
            <div className="px-6 py-4 text-sm text-muted-foreground">Loading…</div>
          ) : (
            <AccountLedgerLines data={data} fmt={fmt} />
          )}
        </div>
      )}
    </div>
  );
}

function AccountLedgerLines({ data, fmt }: { data: any; fmt: (c: number) => string }) {
  const voucherLabel = (l: any) => {
    if (l.voucher_series && l.voucher_number != null) {
      return `${l.voucher_series}${l.voucher_number}${l.voucher_year ? `/${String(l.voucher_year).slice(-2)}` : ''}`;
    }
    return l.reference_number || '—';
  };

  let running = data.opening_cents;
  const rows = data.lines.map((l: any) => {
    const delta =
      data.normal_balance === 'debit'
        ? l.debit_cents - l.credit_cents
        : l.credit_cents - l.debit_cents;
    running += delta;
    return { ...l, delta, running };
  });

  return (
    <div className="text-sm">
      <div className="grid grid-cols-[6rem_6rem_1fr_8rem_8rem] gap-4 px-6 py-2 text-xs text-muted-foreground border-b">
        <div>Voucher</div>
        <div>Date</div>
        <div>Description</div>
        <div className="text-right">Change</div>
        <div className="text-right">Balance</div>
      </div>

      <div className="grid grid-cols-[6rem_6rem_1fr_8rem_8rem] gap-4 px-6 py-2 border-b border-border/40 italic text-muted-foreground">
        <div>—</div>
        <div>—</div>
        <div>Opening balance</div>
        <div className="text-right">—</div>
        <div className="text-right font-mono tabular-nums">{fmt(data.opening_cents)}</div>
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-4 text-center text-muted-foreground">No transactions</div>
      ) : (
        rows.map((l: any, i: number) => (
          <div
            key={l.entry_id + i}
            className="grid grid-cols-[6rem_6rem_1fr_8rem_8rem] gap-4 px-6 py-1.5 border-b border-border/40 last:border-b-0"
          >
            <div className="font-mono text-xs text-muted-foreground">{voucherLabel(l)}</div>
            <div className="font-mono text-xs text-muted-foreground">{l.entry_date}</div>
            <div className="truncate">{l.description}</div>
            <div
              className={`text-right font-mono tabular-nums ${
                l.delta >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-destructive'
              }`}
            >
              {l.delta >= 0 ? '+' : '\u2212'}
              {fmt(Math.abs(l.delta))}
            </div>
            <div className="text-right font-mono tabular-nums text-muted-foreground">
              {fmt(l.running)}
            </div>
          </div>
        ))
      )}

      <div className="grid grid-cols-[6rem_6rem_1fr_8rem_8rem] gap-4 px-6 py-2 border-t font-medium">
        <div>—</div>
        <div>—</div>
        <div>Closing balance</div>
        <div className="text-right">—</div>
        <div className="text-right font-mono tabular-nums">{fmt(data.closing_cents)}</div>
      </div>
    </div>
  );
}
