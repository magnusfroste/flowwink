import { useState } from 'react';
import { format } from 'date-fns';
import { usePoRevisions, useAmendPurchaseOrder } from '@/hooks/usePoRevisions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { History, GitCommit } from 'lucide-react';

interface Props {
  purchaseOrderId: string;
  currency: string;
  currentSnapshot: any;
  currentTotalCents: number;
}

/**
 * PO change-order history + amend dialog.
 * Shows revisions and lets the operator record an amendment. If the total
 * increases past the approvals threshold, an approval request is auto-opened.
 */
export function PoRevisionsPanel({ purchaseOrderId, currency, currentSnapshot, currentTotalCents }: Props) {
  const { data: revisions = [], isLoading } = usePoRevisions(purchaseOrderId);
  const amend = useAmendPurchaseOrder();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  const fmt = (cents: number | null | undefined) =>
    cents == null ? '—' : new Intl.NumberFormat('sv-SE', { style: 'currency', currency }).format(cents / 100);

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" /> Change history
        </CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <GitCommit className="h-4 w-4 mr-1" /> Record amendment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record PO amendment</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Snapshots the current PO as a new revision. If the amount grows past the approval threshold, an
                approval request will be created.
              </p>
              <div>
                <Label>Reason</Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Vendor increased unit price; added freight line…"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                disabled={!reason.trim() || amend.isPending}
                onClick={async () => {
                  const prev = revisions[0]?.snapshot?.next ?? revisions[0]?.snapshot ?? currentSnapshot;
                  const prevTotal = revisions[0]?.new_total_cents ?? currentTotalCents;
                  await amend.mutateAsync({
                    purchase_order_id: purchaseOrderId,
                    reason,
                    prev_snapshot: prev,
                    new_snapshot: currentSnapshot,
                    prev_total_cents: prevTotal,
                    new_total_cents: currentTotalCents,
                  });
                  setReason('');
                  setOpen(false);
                }}
              >
                Save revision
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : revisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No amendments recorded.</p>
        ) : (
          <ul className="space-y-2">
            {revisions.map((r) => {
              const delta = r.amount_delta_cents ?? 0;
              return (
                <li key={r.id} className="flex items-start justify-between border-b pb-2 last:border-b-0">
                  <div>
                    <div className="text-sm font-medium">
                      Rev #{r.revision_number}
                      {r.approval_request_id && (
                        <Badge className="ml-2 bg-amber-100 text-amber-800">Re-approval requested</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(r.created_at), 'yyyy-MM-dd HH:mm')} · {r.reason ?? '—'}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-mono">{fmt(r.prev_total_cents)} → {fmt(r.new_total_cents)}</div>
                    <div className={`text-xs font-mono ${delta > 0 ? 'text-amber-600' : delta < 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                      {delta > 0 ? '+' : ''}{fmt(delta)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
