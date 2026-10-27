import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, CircleAlert, Info, Loader2, Lock, LockOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AccountingTabHeader } from './AccountingTabHeader';
import { useFiscalYear } from './FiscalYearContext';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { businessToday } from '@/lib/platform-fallbacks';

/** The shape month_close_checklist returns (20261027090000). */
interface CloseCheck {
  id: string;
  label: string;
  pass: boolean;
  count: number;
  detail: string;
  informational?: boolean;
  fix?: { skill: string; args?: Record<string, unknown> } | null;
  tab?: string | null;
}

interface Checklist {
  fiscal_year: number;
  label: string;
  month: number;
  period_label: string;
  date_from: string;
  date_to: string;
  status: 'open' | 'closed' | 'locked';
  ready: boolean;
  blocking: string[];
  checks: CloseCheck[];
  next: { skill: string; args: Record<string, unknown> };
}

interface PeriodRow { period_month: number; status: 'open' | 'closed' | 'locked'; closed_at: string | null }

/** Findings that point outside the accounting page open that module instead. */
const MODULE_ROUTES: Record<string, string> = {
  purchasing: '/admin/purchasing',
  expenses: '/admin/expenses',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Month close — the checklist a month is closed against. The same function
 * an agent reads (month_close_checklist): what blocks, the skill or tab that
 * fixes it, and the close itself once nothing blocks. Months close in order;
 * a closed month is corrected with a mirror entry, not by reopening.
 */
export function MonthCloseTab({ onNavigate }: { onNavigate?: (tabId: string) => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { year, label, fromDate, months } = useFiscalYear();
  const { formatDate } = usePlatformFormat();

  // The calendar months of the fiscal year, in order.
  const yearMonths = useMemo(() => {
    const [fy, fm] = fromDate.split('-').map(Number);
    return Array.from({ length: months }, (_, i) => {
      const idx = (fm - 1 + i) % 12;
      const y = fy + Math.floor((fm - 1 + i) / 12);
      return { month: idx + 1, year: y, key: `${y}-${String(idx + 1).padStart(2, '0')}` };
    });
  }, [fromDate, months]);

  const { data: periods = [] } = useQuery({
    queryKey: ['accounting-periods', year],
    queryFn: async (): Promise<PeriodRow[]> => {
      const { data, error } = await supabase
        .from('accounting_periods')
        .select('period_month, status, closed_at')
        .eq('fiscal_year', year);
      if (error) throw error;
      return (data ?? []) as PeriodRow[];
    },
  });
  const statusOf = (m: number): PeriodRow['status'] => periods.find((p) => p.period_month === m)?.status ?? 'open';

  // Default: the latest month that has ended and is still open.
  const [month, setMonth] = useState<number | null>(null);
  useEffect(() => {
    if (month !== null) return;
    const thisMonth = businessToday().slice(0, 7);
    const ended = yearMonths.filter((m) => m.key < thisMonth);
    const candidate = [...ended].reverse().find((m) => statusOf(m.month) === 'open') ?? ended[ended.length - 1] ?? yearMonths[0];
    if (candidate) setMonth(candidate.month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearMonths, periods]);

  const { data: list, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['month-close-checklist', year, month],
    enabled: month !== null,
    queryFn: async (): Promise<Checklist> => {
      const { data, error } = await supabase.rpc('month_close_checklist' as never, { p_year: year, p_month: month } as never);
      if (error) throw error;
      return data as unknown as Checklist;
    },
  });

  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['month-close-checklist'] });
    qc.invalidateQueries({ queryKey: ['accounting-periods'] });
    qc.invalidateQueries({ queryKey: ['dash'] });
  };

  const close = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('close_accounting_period', { p_year: year, p_month: month!, p_notes: notes.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(`${list?.period_label ?? 'Month'} closed`); setNotes(''); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const reopen = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('reopen_accounting_period', { p_year: year, p_month: month!, p_reason: reason.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(`${list?.period_label ?? 'Month'} reopened`); setReason(''); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openFix = (c: CloseCheck) => {
    if (!c.tab) return;
    if (c.id === 'previous_month_closed' && c.fix?.args?.p_month) { setMonth(Number(c.fix.args.p_month)); return; }
    if (MODULE_ROUTES[c.tab]) navigate(MODULE_ROUTES[c.tab]);
    else onNavigate?.(c.tab);
  };

  const blockingCount = list?.blocking?.length ?? 0;

  return (
    <div className="mt-6 space-y-6">
      <AccountingTabHeader
        title="Month close"
        description={`Close the months of ${label} in order, each against its checklist. A closed month is corrected with a mirror entry in the current month, never by reopening.`}
      />

      {/* Month strip */}
      <div className="flex flex-wrap gap-2">
        {yearMonths.map((m) => {
          const st = statusOf(m.month);
          const active = m.month === month;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setMonth(m.month)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors',
                active ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {st === 'open' ? <LockOpen className="h-3 w-3" aria-hidden /> : <Lock className="h-3 w-3" aria-hidden />}
              {MONTHS[m.month - 1]} {m.year}
            </button>
          );
        })}
      </div>

      {isLoading || month === null ? (
        <div className="p-12 flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>
      ) : isError || !list ? (
        <div className="p-12 text-center text-sm text-destructive">Could not load the checklist.</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h2 className="font-serif text-2xl tracking-tight text-foreground">{list.period_label}</h2>
                <p className="text-xs text-muted-foreground mt-1">{formatDate(list.date_from)} – {formatDate(list.date_to)} · fiscal year {list.label}</p>
              </div>
              <Badge variant="outline" className={cn('font-normal', list.status === 'open' ? '' : 'bg-muted')}>
                {list.status}
              </Badge>
            </div>
            <ul className="divide-y divide-border">
              {list.checks.map((c) => (
                <li key={c.id} className="flex items-start gap-3 px-5 py-3">
                  {c.informational ? (
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label="Information" />
                  ) : c.pass ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="Passed" />
                  ) : (
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-label="Blocking" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-foreground">{c.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{c.detail}</div>
                  </div>
                  {(!c.pass || c.informational) && c.tab && (
                    <Button variant="ghost" size="sm" className="shrink-0 text-xs" onClick={() => openFix(c)}>
                      {c.id === 'previous_month_closed' ? 'Go to month' : c.informational ? 'Open' : 'Fix'}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {isFetching && (
              <div className="px-5 py-2 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Refreshing…</div>
            )}
          </div>

          <div className="space-y-4">
            {list.status === 'open' ? (
              <div className="rounded-lg border border-border bg-card p-5 space-y-3">
                <div className="text-sm text-foreground">
                  {list.ready ? (
                    <>Nothing blocks. Closing locks every voucher dated in {list.period_label}.</>
                  ) : (
                    <>{blockingCount} check{blockingCount === 1 ? '' : 's'} block{blockingCount === 1 ? 's' : ''} the close. Work them through their Fix links, then refresh.</>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="close-notes" className="text-xs">Notes (optional)</Label>
                  <Input id="close-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. closed after bank reconciliation" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => close.mutate()} disabled={!list.ready || close.isPending}>
                    {close.isPending && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
                    <Lock className="h-3 w-3 mr-2" aria-hidden />
                    Close {list.period_label}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>Refresh</Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  An agent runs the same checklist as <span className="font-mono">month_close_checklist</span> and closes with <span className="font-mono">close_accounting_period</span>.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-card p-5 space-y-3">
                <div className="text-sm text-foreground">
                  {list.period_label} is {list.status}. A mistake in a closed month is corrected with a mirror entry dated today — the declared figures stay as declared.
                </div>
                {list.status === 'closed' && (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor="reopen-reason" className="text-xs">Reopen only when the close itself was premature — why?</Label>
                      <Input id="reopen-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. bank file for the month arrived late" />
                    </div>
                    <Button variant="outline" onClick={() => reopen.mutate()} disabled={!reason.trim() || reopen.isPending}>
                      {reopen.isPending && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
                      <LockOpen className="h-3 w-3 mr-2" aria-hidden />
                      Reopen {list.period_label}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
