import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import type { Subscription } from '@/hooks/useSubscriptions';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sub: Subscription;
}

function fmtMoney(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export function ChangePlanDialog({ open, onOpenChange, sub }: Props) {
  const qc = useQueryClient();
  const [qty, setQty] = useState(String(sub.quantity));
  const [unit, setUnit] = useState((sub.unit_amount_cents / 100).toFixed(2));
  const [saving, setSaving] = useState(false);

  const preview = useMemo(() => {
    const newQty = Number(qty) || sub.quantity;
    const newUnit = Math.round(Number(unit) * 100);
    const oldTotal = sub.quantity * sub.unit_amount_cents;
    const newTotal = newQty * newUnit;
    const delta = newTotal - oldTotal;

    let fraction = 0;
    let daysRemaining = 0;
    let periodDays = 0;
    if (sub.current_period_start && sub.current_period_end) {
      const start = new Date(sub.current_period_start).getTime();
      const end = new Date(sub.current_period_end).getTime();
      const now = Date.now();
      periodDays = Math.max(1, Math.round((end - start) / 86400000));
      daysRemaining = Math.max(0, Math.round((end - now) / 86400000));
      fraction = Math.min(1, Math.max(0, daysRemaining / periodDays));
    }
    const prorated = Math.round(delta * fraction);
    return { newQty, newUnit, delta, fraction, daysRemaining, periodDays, prorated };
  }, [qty, unit, sub]);

  const unchanged = preview.newQty === sub.quantity && preview.newUnit === sub.unit_amount_cents;

  const submit = async () => {
    if (unchanged) {
      toast.error('No changes to apply');
      return;
    }
    setSaving(true);
    try {
      const args: Record<string, unknown> = { p_subscription_id: sub.id };
      if (preview.newQty !== sub.quantity) args.p_new_quantity = preview.newQty;
      if (preview.newUnit !== sub.unit_amount_cents) args.p_new_unit_amount_cents = preview.newUnit;
      const { data, error } = await supabase.rpc('change_subscription' as never, args as never);
      if (error) throw error;
      const d = (data as { prorated_cents?: number; adjustment_invoice_id?: string; credit_cents?: number } | null) ?? {};
      if (d.adjustment_invoice_id) {
        toast.success(`Plan changed — adjustment invoice created`, {
          description: `Prorated ${fmtMoney(d.prorated_cents ?? 0, sub.currency)}`,
          action: {
            label: 'Open invoice',
            onClick: () => window.open(`/admin/invoices/${d.adjustment_invoice_id}`, '_blank'),
          },
        });
      } else if (d.credit_cents) {
        toast.success(`Credit recorded — apply next cycle`, {
          description: `Credit ${fmtMoney(d.credit_cents, sub.currency)}`,
        });
      } else {
        toast.success('Plan changed');
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['subscriptions'] }),
        qc.invalidateQueries({ queryKey: ['subscription-metrics'] }),
      ]);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to change plan');
    } finally {
      setSaving(false);
    }
  };

  const isUpgrade = preview.delta > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change plan</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>New quantity</Label>
              <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
              <p className="text-xs text-muted-foreground">Currently {sub.quantity}</p>
            </div>
            <div className="space-y-1">
              <Label>New unit price</Label>
              <Input type="number" step="0.01" min="0" value={unit} onChange={(e) => setUnit(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Currently {fmtMoney(sub.unit_amount_cents, sub.currency)}
              </p>
            </div>
          </div>

          <Card>
            <CardContent className="pt-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Old period total</span>
                <span className="font-mono">{fmtMoney(sub.quantity * sub.unit_amount_cents, sub.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">New period total</span>
                <span className="font-mono">{fmtMoney(preview.newQty * preview.newUnit, sub.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delta / period</span>
                <span className={`font-mono ${preview.delta > 0 ? 'text-amber-600' : preview.delta < 0 ? 'text-emerald-600' : ''}`}>
                  {preview.delta >= 0 ? '+' : ''}{fmtMoney(preview.delta, sub.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Remaining {preview.daysRemaining}/{preview.periodDays}d ({Math.round(preview.fraction * 100)}%)
                </span>
                <span className="font-mono font-semibold">
                  ≈ {preview.prorated >= 0 ? '+' : ''}{fmtMoney(preview.prorated, sub.currency)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground pt-2 border-t">
                {isUpgrade
                  ? 'Upgrade: a draft adjustment invoice will be created for the prorated amount.'
                  : preview.delta < 0
                  ? 'Downgrade: a credit will be recorded and applied at the next billing cycle.'
                  : 'No change.'}
              </p>
            </CardContent>
          </Card>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || unchanged}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirm change
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
