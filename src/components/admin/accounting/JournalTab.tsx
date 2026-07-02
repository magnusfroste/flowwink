import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, FileText, Check, AlertTriangle, Search } from 'lucide-react';
import { useJournalEntries, useJournalEntryWithLines, useJournals } from '@/hooks/useAccounting';
import { useAccountingPreferences, useBrandingSettings } from '@/hooks/useSiteSettings';
import { Skeleton } from '@/components/ui/skeleton';
import { NewJournalEntryDialog } from './NewJournalEntryDialog';
import { JournalEntryDetail } from './JournalEntryDetail';
import { JournalCsvActions } from './JournalCsvActions';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  posted: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  voided: 'bg-destructive/10 text-destructive',
};

export function JournalTab() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [journalFilter, setJournalFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: entries, isLoading } = useJournalEntries(statusFilter, journalFilter);
  const { data: selectedEntry } = useJournalEntryWithLines(selectedId);
  const { data: journals } = useJournals();
  const { data: prefs } = useAccountingPreferences();
  const { data: branding } = useBrandingSettings();
  const journalById = new Map((journals || []).map((j) => [j.id, j]));

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

  const voucherLabel = (e: any) => {
    if (e.voucher_series && e.voucher_number != null) {
      return `${e.voucher_series}${e.voucher_number}${e.voucher_year ? `/${String(e.voucher_year).slice(-2)}` : ''}`;
    }
    return e.reference_number || '—';
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

  const byMonth = useMemo(() => {
    const groups = new Map<string, typeof filtered>();
    for (const e of filtered) {
      const key = (e.entry_date || '').slice(0, 7); // YYYY-MM
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  const grandTotal = filtered.reduce((s, e) => s + (e.total_cents || 0), 0);

  const orgName = branding?.organizationName || 'Organization';

  return (
    <div className="space-y-4">
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
            <SelectItem value="voided">Voided</SelectItem>
          </SelectContent>
        </Select>
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
          {/* Report header */}
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 px-6 pt-6 pb-4 border-b">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Journal</h2>
              <div className="mt-3 text-sm font-semibold">{orgName}</div>
            </div>
            <div className="text-sm text-muted-foreground grid grid-cols-[auto_auto] gap-x-4 gap-y-1">
              <span>Entries</span><span className="text-foreground">{filtered.length}</span>
              <span>Total amount</span><span className="text-foreground font-mono">{fmt(grandTotal)}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="font-semibold px-4 py-2 w-28">Voucher</th>
                  <th className="font-semibold px-4 py-2 w-28">Date</th>
                  <th className="font-semibold px-4 py-2">Description</th>
                  <th className="font-semibold px-4 py-2 w-24">Journal</th>
                  <th className="font-semibold px-4 py-2 w-56">Accounts</th>
                  <th className="font-semibold px-4 py-2 w-32 text-right">Amount</th>
                  <th className="font-semibold px-4 py-2 w-10 text-center">Bal.</th>
                  <th className="font-semibold px-4 py-2 w-24">Source</th>
                  <th className="font-semibold px-4 py-2 w-20">Status</th>
                </tr>
              </thead>
              <tbody>
                {byMonth.map(([month, rows]) => {
                  const monthTotal = rows.reduce((s, e) => s + (e.total_cents || 0), 0);
                  const label = month
                    ? new Date(month + '-01').toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
                    : 'Undated';
                  return (
                    <MonthGroup
                      key={month}
                      label={label}
                      count={rows.length}
                      total={fmt(monthTotal)}
                      rows={rows}
                      fmt={fmt}
                      voucherLabel={voucherLabel}
                      journalById={journalById}
                      onSelect={setSelectedId}
                    />
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-foreground text-background">
                  <td colSpan={5} className="px-4 py-3 font-semibold">Total ({filtered.length} entries)</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">{fmt(grandTotal)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
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

function MonthGroup({
  label, count, total, rows, fmt, voucherLabel, journalById, onSelect,
}: {
  label: string;
  count: number;
  total: string;
  rows: any[];
  fmt: (c: number) => string;
  voucherLabel: (e: any) => string;
  journalById: Map<string, any>;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <tr className="bg-foreground text-background">
        <td colSpan={5} className="px-4 py-2 font-semibold">
          {label} <span className="opacity-60 font-normal">· {count} entries</span>
        </td>
        <td className="px-4 py-2 text-right font-mono font-semibold">{total}</td>
        <td colSpan={3} />
      </tr>
      {rows.map((e) => {
        const journal = e.journal_id ? journalById.get(e.journal_id) : null;
        const codes = e.account_codes || [];
        const codesShown = codes.slice(0, 4);
        const extra = codes.length - codesShown.length;
        return (
          <tr
            key={e.id}
            className="odd:bg-muted/20 hover:bg-muted/40 cursor-pointer transition-colors"
            onClick={() => onSelect(e.id)}
          >
            <td className="px-4 py-1.5 font-mono text-xs text-muted-foreground">{voucherLabel(e)}</td>
            <td className="px-4 py-1.5 font-mono text-xs text-muted-foreground">{e.entry_date}</td>
            <td className="px-4 py-1.5">
              <div className="truncate max-w-xs">{e.description}</div>
              {e.reference_number && (
                <div className="text-xs text-muted-foreground">Ref: {e.reference_number}</div>
              )}
            </td>
            <td className="px-4 py-1.5">
              {journal ? (
                <Badge variant="outline" className="text-xs font-mono">{journal.code}</Badge>
              ) : (
                <span className="text-muted-foreground/50">—</span>
              )}
            </td>
            <td className="px-4 py-1.5">
              <div className="flex flex-wrap gap-1">
                {codesShown.map((c: string) => (
                  <span key={c} className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{c}</span>
                ))}
                {extra > 0 && (
                  <span className="text-[11px] text-muted-foreground">+{extra}</span>
                )}
              </div>
            </td>
            <td className="px-4 py-1.5 text-right font-mono">{fmt(e.total_cents || 0)}</td>
            <td className="px-4 py-1.5 text-center">
              {e.is_balanced ? (
                <Check className="h-3.5 w-3.5 text-emerald-600 inline" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 inline" />
              )}
            </td>
            <td className="px-4 py-1.5">
              <Badge variant="outline" className="text-[10px]">{e.source}</Badge>
            </td>
            <td className="px-4 py-1.5">
              <Badge variant="secondary" className={cn('text-[10px]', STATUS_STYLES[e.status] || '')}>
                {e.status}
              </Badge>
            </td>
          </tr>
        );
      })}
    </>
  );
}
