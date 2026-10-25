import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { useEffect, useMemo, useState } from 'react';
import { useFiscalYear } from './FiscalYearContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, FileText, Check, AlertTriangle, Search, ArrowUp, ArrowDown, X } from 'lucide-react';
import { useJournalEntries, useJournalEntryWithLines, useJournals } from '@/hooks/useAccounting';
import { useAccountingRealtime } from '@/hooks/useAccountingRealtime';
import { useBrandingSettings } from '@/hooks/useSiteSettings';
import { Skeleton } from '@/components/ui/skeleton';
import { NewJournalEntryDialog } from './NewJournalEntryDialog';
import { JournalEntryDetail } from './JournalEntryDetail';
import { JournalCsvActions } from './JournalCsvActions';
import { cn } from '@/lib/utils';
import { AccountingTabHeader } from './AccountingTabHeader';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  posted: 'bg-success/15 text-success',
  // Legacy only. Since 2026-08-10 a reversed entry stays POSTED and is marked by
  // reversed_by — status is not allowed to hide a booked entry from the reports.
  voided: 'bg-destructive/10 text-destructive',
};

export function JournalTab() {
  useAccountingRealtime();
  const [statusFilter, setStatusFilter] = useState('all');
  const [journalFilter, setJournalFilter] = useState('all');
  const [search, setSearch] = useState('');
  const { year, fromDate, toDate } = useFiscalYear();
  const [dateFrom, setDateFrom] = useState(fromDate);
  const [dateTo, setDateTo] = useState(toDate);
  useEffect(() => {
    setDateFrom(fromDate);
    setDateTo(toDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  // Sorting is a viewer preference, not data — persisted per user so an
  // accountant who works voucher-by-voucher keeps that order between visits.
  type SortKey = 'voucher' | 'date' | 'amount' | 'description';
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>(() => {
    try {
      const raw = localStorage.getItem('accounting.journal.sort');
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return { key: 'date', dir: 'desc' };
  });
  useEffect(() => {
    try { localStorage.setItem('accounting.journal.sort', JSON.stringify(sort)); } catch { /* ignore */ }
  }, [sort]);
  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'description' || key === 'voucher' ? 'asc' : 'desc' },
    );

  const { data: entries, isLoading } = useJournalEntries(statusFilter, journalFilter);
  const { data: selectedEntry } = useJournalEntryWithLines(selectedId);
  const { data: journals } = useJournals();
  // The business's own number format and decimals — one setting for every amount.
  const { formatAmount } = usePlatformFormat();
  const { data: branding } = useBrandingSettings();
  const journalById = new Map((journals || []).map((j) => [j.id, j]));

  const fmt = (cents: number) => formatAmount(cents);

  const voucherLabel = (e: any) => {
    if (e.voucher_series && e.voucher_number != null) {
      return `${e.voucher_series}${e.voucher_number}${e.voucher_year ? `/${String(e.voucher_year).slice(-2)}` : ''}`;
    }
    return e.reference_number || '—';
  };

  const fmtDate = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const filtered = useMemo(() => {
    return (entries || []).filter((e) => {
      if (dateFrom && e.entry_date < dateFrom) return false;
      if (dateTo && e.entry_date > dateTo) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        e.description?.toLowerCase().includes(s) ||
        e.reference_number?.toLowerCase().includes(s) ||
        voucherLabel(e).toLowerCase().includes(s) ||
        (e.account_codes || []).some((c: string) => c.includes(search))
      );
    });
  }, [entries, search, dateFrom, dateTo]);

  const sorted = useMemo(() => {
    const mul = sort.dir === 'asc' ? 1 : -1;
    const cmp = (a: any, b: any) => {
      switch (sort.key) {
        case 'voucher': {
          // Series first, then number as a number — so A9 sorts before A10.
          const sa = a.voucher_series || '', sb = b.voucher_series || '';
          if (sa !== sb) return sa.localeCompare(sb) * mul;
          const na = a.voucher_number ?? -1, nb = b.voucher_number ?? -1;
          if (na !== nb) return (na - nb) * mul;
          return String(a.reference_number || '').localeCompare(String(b.reference_number || '')) * mul;
        }
        case 'amount':
          return ((a.total_cents || 0) - (b.total_cents || 0)) * mul;
        case 'description':
          return String(a.description || '').localeCompare(String(b.description || ''), undefined, { sensitivity: 'base' }) * mul;
        case 'date':
        default: {
          if (a.entry_date !== b.entry_date) return (a.entry_date < b.entry_date ? -1 : 1) * mul;
          // Stable secondary key: within a day, voucher order is the real order.
          return ((a.voucher_number ?? 0) - (b.voucher_number ?? 0)) * mul;
        }
      }
    };
    return [...filtered].sort(cmp);
  }, [filtered, sort]);

  const grandTotal = filtered.reduce((s, e) => s + (e.total_cents || 0), 0);

  const filtersActive =
    !!search || statusFilter !== 'all' || journalFilter !== 'all' || dateFrom !== fromDate || dateTo !== toDate;
  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setJournalFilter('all');
    setDateFrom(fromDate);
    setDateTo(toDate);
  };

  const SortHeader = ({
    label,
    sortKey,
    className,
  }: { label: string; sortKey: SortKey; className?: string }) => {
    const active = sort.key === sortKey;
    return (
      <th className={cn('font-medium px-4 py-2', className)}>
        <button
          type="button"
          onClick={() => toggleSort(sortKey)}
          className={cn(
            'inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-foreground',
            active ? 'text-foreground' : 'text-muted-foreground',
          )}
          title={`Sort by ${label.toLowerCase()}`}
        >
          {label}
          {active ? (
            sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3 opacity-0 group-hover:opacity-40" />
          )}
        </button>
      </th>
    );
  };

  const orgName = branding?.organizationName || 'Organization';


  return (
    <div className="space-y-4">
      <AccountingTabHeader
        title="Journal"
        description="Every voucher posted to the books, in chronological order. Click a row to inspect the debit/credit lines and template provenance."
      />
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search voucher, description, account…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-40"
          aria-label="From date"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-40"
          aria-label="To date"
        />
        <Select value={journalFilter} onValueChange={setJournalFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Journal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All journals</SelectItem>
            {journals?.map((j) => (
              <SelectItem key={j.id} value={j.id}>{j.code} — {j.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="posted">Posted</SelectItem>
            <SelectItem value="reversed">Reversed</SelectItem>
          </SelectContent>
        </Select>
        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <Button onClick={() => setShowCreate(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Entry
          </Button>
          <JournalCsvActions statusFilter={statusFilter} journalFilter={journalFilter} />
        </div>
      </div>


      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border bg-card py-12 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No journal entries</h3>
          <p className="text-sm text-muted-foreground">
            {entries?.length ? 'No entries match the current filters.' : 'Create your first journal entry to get started.'}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <div className="flex items-center justify-between px-4 py-2.5 border-b text-xs text-muted-foreground">
            <span>
              {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
              <span className="text-muted-foreground/60">
                {' '}· sorted by {sort.key === 'amount' ? 'amount' : sort.key}{' '}
                {sort.dir === 'asc' ? 'ascending' : 'descending'}
              </span>
            </span>
            <span className="font-mono tabular-nums">Total <span className="text-foreground font-medium">{fmt(grandTotal)}</span></span>
          </div>

          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="group text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                  <SortHeader label="Voucher" sortKey="voucher" className="w-24" />
                  <SortHeader label="Date" sortKey="date" className="w-24" />
                  <SortHeader label="Description" sortKey="description" />
                  <th className="font-medium px-4 py-2 w-20">Journal</th>
                  <th className="font-medium px-4 py-2 w-48">Accounts</th>
                  <SortHeader label="Amount" sortKey="amount" className="w-32 text-right [&>button]:flex-row-reverse" />
                  <th className="font-medium px-4 py-2 w-24">Source</th>
                  <th className="font-medium px-4 py-2 w-20">Status</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((e) => {

                  const journal = e.journal_id ? journalById.get(e.journal_id) : null;
                  const codes = e.account_codes || [];
                  const codesShown = codes.slice(0, 4);
                  const extra = codes.length - codesShown.length;
                  return (
                    <tr
                      key={e.id}
                      className="border-t hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => setSelectedId(e.id)}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">{voucherLabel(e)}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(e.entry_date)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="truncate max-w-xs">{e.description}</span>
                          {!e.is_balanced && (
                            <span title="Unbalanced entry" className="inline-flex items-center gap-1 text-[10px] text-warning">
                              <AlertTriangle className="h-3 w-3" /> unbalanced
                            </span>
                          )}
                        </div>
                        {e.reference_number && (
                          <div className="text-xs text-muted-foreground/70 mt-0.5">Ref: {e.reference_number}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {journal ? (
                          <span className="font-mono text-xs text-muted-foreground">{journal.code}</span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap items-center gap-1 font-mono text-[11px] text-muted-foreground">
                          {codesShown.map((c: string, i: number) => (
                            <span key={c}>
                              {c}{i < codesShown.length - 1 && <span className="text-muted-foreground/40 mx-0.5">·</span>}
                            </span>
                          ))}
                          {extra > 0 && (
                            <span className="text-muted-foreground/60">+{extra}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmt(e.total_cents || 0)}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{e.source}</td>
                      <td className="px-4 py-2.5">
                        {/* A reversed entry is still posted — it counts, and its
                            mirror cancels it. The badge says what happened to it
                            without pretending it never happened. */}
                        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                          e.reversed_by ? 'bg-warning/15 text-warning'
                            : e.reverses ? 'bg-muted text-muted-foreground'
                            : STATUS_STYLES[e.status] || 'bg-muted text-muted-foreground')}>
                          {e.reversed_by ? 'reversed' : e.reverses ? 'reversal' : e.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <NewJournalEntryDialog open={showCreate} onOpenChange={setShowCreate} />

      {selectedEntry && (
        <JournalEntryDetail
          entry={selectedEntry}
          open={!!selectedId}
          onOpenChange={(open) => !open && setSelectedId(null)}
        />
      )}
    </div>
  );
}

