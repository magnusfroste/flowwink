import { useState, useMemo, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSaleLines, useRefundSale, type PosSale } from '@/hooks/usePOS';
import { logger } from '@/lib/logger';

const METHODS = ['cash', 'card', 'swish', 'klarna', 'invoice', 'gift_card', 'other'] as const;

interface Props {
  sale: PosSale | null;
  sessionId?: string;
  onClose: () => void;
}

export function RefundDialog({ sale, sessionId, onClose }: Props) {
  const { data: lines } = useSaleLines(sale?.id);
  const refund$ = useRefundSale();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState<string>(sale?.payment_method ?? 'cash');

  useEffect(() => {
    if (sale) setMethod(sale.payment_method || 'cash');
    setQty({});
    setReason('');
  }, [sale?.id]);

  const total = useMemo(() => {
    if (!lines) return 0;
    return lines.reduce((s, l) => {
      const q = qty[l.id] ?? 0;
      if (!q) return s;
      const unit = l.unit_price_cents;
      return s + Math.round(unit * q * (1 + (Number(l.tax_rate ?? 0) / 100)));
    }, 0);
  }, [qty, lines]);

  function setAllFull() {
    if (!lines) return;
    setQty(Object.fromEntries(lines.map((l) => [l.id, Number(l.quantity)])));
  }

  async function submit(full: boolean) {
    if (!sale) return;
    try {
      const payloadLines = full
        ? null
        : (lines ?? [])
            .map((l) => ({ sale_line_id: l.id, quantity: qty[l.id] ?? 0 }))
            .filter((x) => x.quantity > 0);
      if (!full && (!payloadLines || payloadLines.length === 0)) return;
      await refund$.mutateAsync({
        sale_id: sale.id,
        lines: full ? null : payloadLines!,
        reason: reason || undefined,
        method,
        session_id: sessionId,
      });
      onClose();
    } catch (e) {
      logger.error('POS refund failed', e);
    }
  }

  return (
    <Dialog open={!!sale} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Refund sale {sale?.receipt_number}</DialogTitle>
          <DialogDescription>
            Enter quantities to refund per line, or use the full-refund shortcut.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">Original total: {((sale?.total_cents ?? 0) / 100).toFixed(2)} {sale?.currency}</div>
            <Button size="sm" variant="outline" onClick={setAllFull}>Refund all</Button>
          </div>

          <div className="border rounded divide-y max-h-64 overflow-y-auto">
            {(lines ?? []).map((l) => (
              <div key={l.id} className="grid grid-cols-12 gap-2 items-center p-2 text-sm">
                <div className="col-span-6">
                  <div className="font-medium">{l.product_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {(l.unit_price_cents / 100).toFixed(2)} × sold {Number(l.quantity)}
                  </div>
                </div>
                <div className="col-span-3 text-right text-xs text-muted-foreground">
                  Max {Number(l.quantity)}
                </div>
                <div className="col-span-3">
                  <Input
                    type="number"
                    min={0}
                    max={Number(l.quantity)}
                    value={qty[l.id] ?? ''}
                    placeholder="0"
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(Number(l.quantity), Number(e.target.value)));
                      setQty({ ...qty, [l.id]: v });
                    }}
                    className="h-8"
                  />
                </div>
              </div>
            ))}
            {lines && lines.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground text-center">No lines on this sale.</div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Refund method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Reason</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer changed mind" />
            </div>
          </div>

          <div className="text-right text-sm">
            Selected refund (incl. tax): <span className="font-medium">{(total / 100).toFixed(2)} {sale?.currency}</span>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={refund$.isPending}>Cancel</Button>
          <Button variant="destructive" onClick={() => submit(true)} disabled={refund$.isPending}>
            Full refund
          </Button>
          <Button onClick={() => submit(false)} disabled={refund$.isPending || total === 0}>
            Refund selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
