import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle2, CircleAlert, Loader2, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AccountingTabHeader } from './AccountingTabHeader';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { businessToday } from '@/lib/platform-fallbacks';
import { FILINGS_QUERY_KEY, useStatutoryCalendar, type StatutoryDeadline } from '@/hooks/useStatutoryFilings';

/**
 * Filings — the register of what was filed with the agency. The calendar
 * can only say "overdue" because this says "filed": every line is the
 * deadline the business home implies, and a person (or an agent a person
 * told) records the filing with the agency's reference. The figures stay in
 * the ledger; the reference points at the agency's copy.
 */
export function FilingsTab() {
  const qc = useQueryClient();
  const { formatDate, formatCurrency } = usePlatformFormat();
  const { data, isLoading, isError } = useStatutoryCalendar();
  const [recording, setRecording] = useState<StatutoryDeadline | null>(null);
  const [filedAt, setFiledAt] = useState(businessToday());
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: FILINGS_QUERY_KEY });
    qc.invalidateQueries({ queryKey: ['dash'] });
  };

  const record = useMutation({
    mutationFn: async (d: StatutoryDeadline) => {
      const cents = amount.trim() ? Math.round(parseFloat(amount.replace(',', '.')) * 100) : null;
      const { data: res, error } = await supabase.rpc('manage_statutory_filing' as never, {
        p_action: 'record', p_kind: d.kind, p_period_to: d.period_to, p_period_from: d.period_from, p_due_date: d.due_date,
        p_filed_at: filedAt || null, p_reference: reference.trim() || null, p_amount_cents: Number.isFinite(cents as number) ? cents : null,
      } as never);
      if (error) throw error;
      return res as { success?: boolean; note?: string | null };
    },
    onSuccess: (res, d) => {
      toast.success(`${d.label} recorded as filed${res?.note ? ' — ' + res.note : ''}`);
      setRecording(null); setReference(''); setAmount(''); setFiledAt(businessToday());
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const undo = useMutation({
    mutationFn: async (filingId: string) => {
      const { error } = await supabase.rpc('manage_statutory_filing' as never, { p_action: 'delete', p_filing_id: filingId } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Filing record removed — the period reads as not filed again'); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data?.deadlines ?? [];
  const overdue = rows.filter((r) => r.status === 'overdue');
  const open = rows.filter((r) => r.status === 'due_soon' || r.status === 'upcoming');
  const filed = rows.filter((r) => r.status === 'filed');

  const Row = ({ d }: { d: StatutoryDeadline }) => (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3">
      {d.status === 'filed' ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-label="Filed" />
      ) : d.status === 'overdue' ? (
        <CircleAlert className="h-4 w-4 shrink-0 text-destructive" aria-label="Overdue" />
      ) : (
        <span className={cn('h-2 w-2 shrink-0 rounded-full', d.status === 'due_soon' ? 'bg-warning' : 'bg-muted-foreground/40')} aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm text-foreground">{d.label}</div>
        <div className="text-xs text-muted-foreground">
          {formatDate(d.period_from)} – {formatDate(d.period_to)} · due {formatDate(d.due_date)}
          {d.status === 'filed'
            ? ` · filed ${d.filed_at ? formatDate(d.filed_at) : ''}${d.reference ? ` · ref ${d.reference}` : ' · no reference yet'}${d.amount_cents != null ? ` · ${formatCurrency(d.amount_cents)}` : ''}`
            : d.status === 'overdue'
              ? ` · ${Math.abs(d.days_left)} days ago`
              : ` · in ${d.days_left} days`}
        </div>
      </div>
      {d.status === 'filed' ? (
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => d.filing_id && undo.mutate(d.filing_id)} disabled={undo.isPending}>
          <Undo2 className="h-3 w-3 mr-1" aria-hidden /> Undo
        </Button>
      ) : (
        <Button size="sm" variant={d.status === 'overdue' ? 'default' : 'outline'} onClick={() => setRecording(d)}>
          Mark as filed
        </Button>
      )}
    </li>
  );

  return (
    <div className="mt-6 space-y-4">
      <AccountingTabHeader
        title="Filings"
        description="What was filed with the agency, and when. The calendar can only say overdue because this says filed — record each return with the agency's reference once it is in."
      />
      {isLoading ? (
        <div className="p-12 flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>
      ) : isError || !data ? (
        <div className="p-12 text-center text-sm text-destructive">Could not load the calendar.</div>
      ) : (
        <>
          {data.note && <p className="text-sm text-muted-foreground">{data.note}</p>}
          {rows.length === 0 && !data.note && (
            <p className="text-sm text-muted-foreground">No statutory deadlines in the window.</p>
          )}
          {overdue.length > 0 && (
            <section className="rounded-lg border border-destructive/40 bg-card">
              <div className="px-5 py-3 border-b text-sm font-medium text-foreground flex items-center gap-2">
                Overdue <Badge variant="destructive">{overdue.length}</Badge>
                <span className="text-xs font-normal text-muted-foreground">due and not recorded as filed — record it, or file it now</span>
              </div>
              <ul className="divide-y divide-border">{overdue.map((d) => <Row key={d.id} d={d} />)}</ul>
            </section>
          )}
          {open.length > 0 && (
            <section className="rounded-lg border bg-card">
              <div className="px-5 py-3 border-b text-sm font-medium text-foreground">Coming up</div>
              <ul className="divide-y divide-border">{open.map((d) => <Row key={d.id} d={d} />)}</ul>
            </section>
          )}
          {filed.length > 0 && (
            <section className="rounded-lg border bg-card">
              <div className="px-5 py-3 border-b text-sm font-medium text-foreground">Filed</div>
              <ul className="divide-y divide-border">{filed.map((d) => <Row key={d.id} d={d} />)}</ul>
            </section>
          )}
        </>
      )}

      <Dialog open={!!recording} onOpenChange={(o) => { if (!o) setRecording(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record filing</DialogTitle>
            <DialogDescription>
              {recording?.label} — period {recording ? `${formatDate(recording.period_from)} – ${formatDate(recording.period_to)}` : ''}. The figures stay in the ledger; this records that it was filed.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label htmlFor="filing-date">Filed on</Label>
              <Input id="filing-date" type="date" value={filedAt} max={businessToday()} onChange={(e) => setFiledAt(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="filing-ref">Agency reference</Label>
              <Input id="filing-ref" value={reference} placeholder="e.g. Skatteverket confirmation number" onChange={(e) => setReference(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="filing-amount">Amount (optional, to pay or refund)</Label>
              <Input id="filing-amount" inputMode="decimal" value={amount} placeholder="e.g. 12500" onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecording(null)}>Cancel</Button>
            <Button onClick={() => recording && record.mutate(recording)} disabled={record.isPending || !filedAt}>
              {record.isPending && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
              Record as filed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
