import { useState } from 'react';
import { format } from 'date-fns';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { History, GitCommit } from 'lucide-react';
import { useQuoteRevisions, useAmendQuote } from '@/hooks/useQuoteRevisions';

interface Props {
  quoteId: string;
  currency: string;
  currentSnapshot: any;
  currentTotalCents: number;
  isSent: boolean;
}

export function QuoteRevisionsPanel({ quoteId, currency, currentSnapshot, currentTotalCents, isSent }: Props) {
  const { data: revisions = [], isLoading } = useQuoteRevisions(quoteId);
  const amend = useAmendQuote();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [resetAccept, setResetAccept] = useState(true);

  const fmt = (cents: number | null | undefined) =>
    cents == null ? '—' : new Intl.NumberFormat('sv-SE', { style: 'currency', currency }).format(cents / 100);

  const submit = async () => {
    if (!reason.trim()) return;
    const prev = revisions[0]?.snapshot?.next ?? currentSnapshot;
    const prevTotal = revisions[0]?.new_total_cents ?? currentTotalCents;
    await amend.mutateAsync({
      quote_id: quoteId,
      reason: reason.trim(),
      prev_snapshot: prev,
      new_snapshot: currentSnapshot,
      prev_total_cents: prevTotal,
      new_total_cents: currentTotalCents,
      reset_acceptance: resetAccept && isSent,
    });
    setReason('');
    setOpen(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" /> Revision history
        </CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <GitCommit className="h-4 w-4 mr-1" /> Record revision
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record quote revision</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Snapshots the current quote as a new revision. If the total grew past the approval threshold, an
                approval request will be opened. Save the quote first so the current values are captured.
              </p>
              <div>
                <Label>Reason</Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Customer requested a discount; added freight line…"
                  rows={3}
                />
              </div>
              {isSent && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={resetAccept} onCheckedChange={(v) => setResetAccept(!!v)} />
                  Revert to Draft so the revised quote can be re-sent
                </label>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} disabled={!reason.trim() || amend.isPending}>Save revision</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : revisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No revisions yet.</p>
        ) : (
          revisions.map((r) => (
            <div key={r.id} className="rounded-md border p-3 text-sm space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Rev {r.revision_number}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(r.created_at), 'yyyy-MM-dd HH:mm')}
                  </span>
                </div>
                {r.approval_request_id && <Badge>Re-approval opened</Badge>}
              </div>
              {r.reason && <div className="text-muted-foreground">{r.reason}</div>}
              <div className="flex gap-3 text-xs font-mono tabular-nums">
                <span>{fmt(r.prev_total_cents)}</span>
                <span>→</span>
                <span>{fmt(r.new_total_cents)}</span>
                {r.amount_delta_cents != null && r.amount_delta_cents !== 0 && (
                  <span className={r.amount_delta_cents > 0 ? 'text-amber-600' : 'text-green-600'}>
                    ({r.amount_delta_cents > 0 ? '+' : ''}{fmt(r.amount_delta_cents)})
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
