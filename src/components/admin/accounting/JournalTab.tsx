import { useEffect, useMemo, useState } from 'react';
import { useFiscalYear } from './FiscalYearContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, FileText, Check, AlertTriangle, Search } from 'lucide-react';
import { useJournalEntries, useJournalEntryWithLines, useJournals } from '@/hooks/useAccounting';
import { useAccountingRealtime } from '@/hooks/useAccountingRealtime';
import { useAccountingPreferences, useBrandingSettings } from '@/hooks/useSiteSettings';
import { Skeleton } from '@/components/ui/skeleton';
import { NewJournalEntryDialog } from './NewJournalEntryDialog';
import { JournalEntryDetail } from './JournalEntryDetail';
import { JournalCsvActions } from './JournalCsvActions';
import { cn } from '@/lib/utils';
import { AccountingTabHeader } from './AccountingTabHeader';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  posted: 'bg-success/15 text-success',
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


  const grandTotal = filtered.reduce((s, e) => s + (e.total_cents || 0), 0);

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
          <div className="flex items-center justify-between px-4 py-2.5 border-b text-xs text-muted-foreground">
            <span>{filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}</span>
            <span className="font-mono tabular-nums">Total <span className="text-foreground font-medium">{fmt(grandTotal)}</span></span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="font-medium px-4 py-2 w-24">Voucher</th>
                  <th className="font-medium px-4 py-2 w-24">Date</th>
                  <th className="font-medium px-4 py-2">Description</th>
                  <th className="font-medium px-4 py-2 w-20">Journal</th>
                  <th className="font-medium px-4 py-2 w-48">Accounts</th>
                  <th className="font-medium px-4 py-2 w-32 text-right">Amount</th>
                  <th className="font-medium px-4 py-2 w-24">Source</th>
                  <th className="font-medium px-4 py-2 w-20">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
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
                        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_STYLES[e.status] || 'bg-muted text-muted-foreground')}>
                          {e.status}
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

