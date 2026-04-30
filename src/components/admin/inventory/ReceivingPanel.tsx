import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, Truck, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  useOpenPurchaseOrders,
  useOpenPoLines,
  useRecentGoodsReceipts,
  useReceivePurchaseOrder,
  useReceivingRealtime,
  type ReceiveLineInput,
} from '@/hooks/useReceiving';

function formatMoney(cents: number, ccy = 'SEK') {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: ccy }).format(cents / 100);
}

function statusBadge(status: string) {
  const variant: 'default' | 'secondary' | 'outline' = status === 'partially_received' ? 'secondary' : 'outline';
  return <Badge variant={variant} className="capitalize">{status.replace(/_/g, ' ')}</Badge>;
}

function ReceiveDialog({ poId, onClose }: { poId: string; onClose: () => void }) {
  const { data: lines, isLoading } = useOpenPoLines(poId);
  const receive = useReceivePurchaseOrder();
  const [edits, setEdits] = useState<Record<string, { qty: string; lot: string }>>({});
  const [notes, setNotes] = useState('');

  function setQty(lineId: string, qty: string) {
    setEdits((p) => ({ ...p, [lineId]: { ...(p[lineId] ?? { qty: '', lot: '' }), qty } }));
  }
  function setLot(lineId: string, lot: string) {
    setEdits((p) => ({ ...p, [lineId]: { ...(p[lineId] ?? { qty: '', lot: '' }), lot } }));
  }

  function fillRemaining() {
    if (!lines) return;
    const next: typeof edits = {};
    for (const l of lines) {
      const remaining = l.quantity - l.received_quantity;
      if (remaining > 0) next[l.id] = { qty: String(remaining), lot: edits[l.id]?.lot ?? '' };
    }
    setEdits(next);
  }

  async function submit() {
    const payload: ReceiveLineInput[] = [];
    for (const [po_line_id, v] of Object.entries(edits)) {
      const qty = Number(v.qty);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      payload.push({ po_line_id, quantity_received: qty, lot_number: v.lot || undefined });
    }
    if (payload.length === 0) return;
    await receive.mutateAsync({ purchase_order_id: poId, lines: payload, notes: notes || undefined });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" /> Record Goods Receipt
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !lines || lines.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">No lines on this PO.</p>
        ) : (
          <>
            <div className="flex justify-end mb-2">
              <Button variant="outline" size="sm" onClick={fillRemaining}>Fill all remaining</Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Ordered</TableHead>
                  <TableHead className="text-right">Already received</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead className="w-28">Receive now</TableHead>
                  <TableHead className="w-32">Lot/Serial</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => {
                  const remaining = l.quantity - l.received_quantity;
                  const isComplete = remaining <= 0;
                  return (
                    <TableRow key={l.id} className={isComplete ? 'opacity-50' : ''}>
                      <TableCell className="font-medium">{l.description}</TableCell>
                      <TableCell className="text-right">{l.quantity}</TableCell>
                      <TableCell className="text-right">{l.received_quantity}</TableCell>
                      <TableCell className="text-right font-semibold">{remaining}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          max={remaining}
                          disabled={isComplete}
                          value={edits[l.id]?.qty ?? ''}
                          onChange={(e) => setQty(l.id, e.target.value)}
                          placeholder="0"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          disabled={isComplete}
                          value={edits[l.id]?.lot ?? ''}
                          onChange={(e) => setLot(l.id, e.target.value)}
                          placeholder="optional"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="mt-3">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Receipt notes (optional)" />
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={receive.isPending || Object.keys(edits).length === 0}>
            {receive.isPending ? 'Receiving…' : 'Confirm receipt'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReceivingPanel() {
  useReceivingRealtime();
  const { data: openPos, isLoading } = useOpenPurchaseOrders();
  const { data: receipts } = useRecentGoodsReceipts(15);
  const [receivingPoId, setReceivingPoId] = useState<string | null>(null);

  const counts = {
    awaiting: openPos?.filter((p) => p.status === 'sent' || p.status === 'confirmed').length ?? 0,
    partial: openPos?.filter((p) => p.status === 'partially_received').length ?? 0,
    todayReceipts: receipts?.filter((r) => r.received_date === new Date().toISOString().slice(0, 10)).length ?? 0,
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Package className="h-4 w-4" /> Awaiting receipt</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{counts.awaiting}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertCircle className="h-4 w-4" /> Partially received</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{counts.partial}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Receipts today</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{counts.todayReceipts}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Open Purchase Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !openPos || openPos.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">No open purchase orders awaiting goods.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO #</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openPos.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell className="font-mono text-sm">{po.po_number}</TableCell>
                    <TableCell>{po.vendors?.name ?? '—'}</TableCell>
                    <TableCell>{statusBadge(po.status)}</TableCell>
                    <TableCell>{po.expected_delivery ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right">{formatMoney(po.total_cents, po.currency)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" onClick={() => setReceivingPoId(po.id)}>Receive</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Receipts</CardTitle>
        </CardHeader>
        <CardContent>
          {!receipts || receipts.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">No receipts recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>PO</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.map((r) => {
                  const units = (r.goods_receipt_lines ?? []).reduce((s, l) => s + l.quantity_received, 0);
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{r.received_date}</TableCell>
                      <TableCell className="font-mono text-sm">{r.purchase_orders?.po_number ?? '—'}</TableCell>
                      <TableCell>{r.purchase_orders?.vendors?.name ?? '—'}</TableCell>
                      <TableCell className="text-right">{units}</TableCell>
                      <TableCell className="text-muted-foreground text-sm truncate max-w-xs">{r.notes ?? ''}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {receivingPoId && <ReceiveDialog poId={receivingPoId} onClose={() => setReceivingPoId(null)} />}
    </div>
  );
}
