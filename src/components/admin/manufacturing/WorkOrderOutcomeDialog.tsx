import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { MoWorkOrder } from '@/hooks/useManufacturing';

interface Check { id: string; name: string; result: 'pass' | 'fail'; measured_value: string | null; note: string | null; checked_at: string }
interface InspectionState {
  requires_inspection: boolean;
  inspection_name: string | null;
  passed: boolean;
  checks: Check[];
}

/**
 * What actually came out of one operation: the quality check it may require,
 * and the units scrapped there. Both are facts the table reads — an operation
 * that needs a passing check cannot be finished without one, and scrap is
 * deducted from what the manufacturing order can still produce.
 */
export function WorkOrderOutcomeDialog({ workOrder, open, onOpenChange }: {
  workOrder: MoWorkOrder;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [measured, setMeasured] = useState('');
  const [note, setNote] = useState('');
  const [scrapQty, setScrapQty] = useState('');
  const [scrapReason, setScrapReason] = useState('');
  const [busy, setBusy] = useState(false);

  const stateKey = ['work-order-inspection', workOrder.id];
  const { data: state } = useQuery({
    queryKey: stateKey,
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('work_order_inspection_state' as never, { p_work_order_id: workOrder.id } as never);
      if (error) throw error;
      return data as unknown as InspectionState;
    },
  });

  const call = async (fn: string, args: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc(fn as never, args as never);
      if (error) throw error;
      const answer = data as { success?: boolean; error?: string } | null;
      if (!answer?.success) throw new Error(answer?.error ?? 'The action was refused');
      toast.success(done);
      await Promise.all([
        qc.invalidateQueries({ queryKey: stateKey }),
        qc.invalidateQueries({ queryKey: ['mo_work_orders', workOrder.mo_id] }),
        qc.invalidateQueries({ queryKey: ['manufacturing_orders'] }),
      ]);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const check = async (result: 'pass' | 'fail') => {
    const ok = await call('record_quality_check', {
      p_work_order_id: workOrder.id, p_result: result,
      p_measured_value: measured || null, p_note: note || null,
    }, result === 'pass' ? 'Check passed' : 'Check recorded as failed');
    if (ok) { setMeasured(''); setNote(''); }
  };

  const scrap = async () => {
    const ok = await call('record_operation_scrap', {
      p_work_order_id: workOrder.id, p_qty: Number(scrapQty), p_reason: scrapReason || null,
    }, 'Scrap recorded');
    if (ok) { setScrapQty(''); setScrapReason(''); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{workOrder.name}</DialogTitle>
          <DialogDescription>
            What came out of this operation. Scrap is deducted from what the order can still produce; the cost already spent stays with the units that survive.
          </DialogDescription>
        </DialogHeader>

        {state?.requires_inspection && (
          <div className="space-y-3 rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{state.inspection_name ?? 'Quality check'}</span>
              <Badge variant={state.passed ? 'default' : 'outline'}>
                {state.passed ? 'passed' : state.checks.length ? 'failed' : 'not checked'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              This operation cannot be finished until a check passes.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="wo-measured" className="text-xs">Measured</Label>
                <Input id="wo-measured" value={measured} onChange={(e) => setMeasured(e.target.value)} placeholder="95 Nm" />
              </div>
              <div>
                <Label htmlFor="wo-note" className="text-xs">Note</Label>
                <Input id="wo-note" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={busy} onClick={() => check('pass')}>Record pass</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => check('fail')}>Record fail</Button>
            </div>
            {state.checks.length > 0 && (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {state.checks.map((c) => (
                  <li key={c.id}>
                    {new Date(c.checked_at).toLocaleString()} · {c.result === 'pass' ? 'pass' : 'fail'}
                    {c.measured_value ? ` · ${c.measured_value}` : ''}{c.note ? ` · ${c.note}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Scrap at this operation</span>
            <span className="font-mono text-sm">{Number(workOrder.qty_scrapped ?? 0)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="wo-scrap" className="text-xs">Units scrapped</Label>
              <Input id="wo-scrap" type="number" min={0} value={scrapQty} onChange={(e) => setScrapQty(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="wo-scrap-reason" className="text-xs">Reason</Label>
              <Input id="wo-scrap-reason" value={scrapReason} onChange={(e) => setScrapReason(e.target.value)} placeholder="cracked housing" />
            </div>
          </div>
          <Button size="sm" variant="outline" disabled={busy || !Number(scrapQty)} onClick={scrap}>Record scrap</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
