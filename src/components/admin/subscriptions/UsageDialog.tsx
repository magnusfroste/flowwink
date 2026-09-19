import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Subscription } from '@/hooks/useSubscriptions';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';

interface Meter {
  metric: string;
  unit_label: string | null;
  unit_amount_cents: number;
  included_quantity: number;
  is_active: boolean;
  unbilled_quantity: number;
  billable_quantity: number;
  unbilled_amount_cents: number;
}

interface RpcResult { success?: boolean; error?: string; meters?: Meter[] }

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sub: Subscription;
}

/**
 * Usage-based billing on one subscription: its meters (price per unit, quantity
 * included per period) and the usage not yet invoiced. The next subscription
 * invoice adds the unbilled usage as its own lines.
 */
export function UsageDialog({ open, onOpenChange, sub }: Props) {
  const qc = useQueryClient();
  const { formatCurrency, formatNumber } = usePlatformFormat();
  const [metric, setMetric] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [included, setIncluded] = useState('0');
  const [unitLabel, setUnitLabel] = useState('');
  const [usageMetric, setUsageMetric] = useState('');
  const [usageQty, setUsageQty] = useState('');
  const [saving, setSaving] = useState(false);

  const queryKey = ['subscription-usage', sub.id];
  const { data: meters, isLoading } = useQuery({
    queryKey,
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('subscription_usage_summary' as never, { p_subscription_id: sub.id } as never);
      if (error) throw error;
      return ((data as RpcResult | null)?.meters ?? []) as Meter[];
    },
  });

  const call = async (fn: string, args: Record<string, unknown>, done: string) => {
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc(fn as never, args as never);
      if (error) throw error;
      const result = data as RpcResult | null;
      if (!result?.success) throw new Error(result?.error ?? 'The change was refused');
      toast.success(done);
      await qc.invalidateQueries({ queryKey });
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const addMeter = async () => {
    const ok = await call('manage_usage_meter', {
      p_subscription_id: sub.id,
      p_metric: metric,
      p_unit_amount_cents: Math.round(Number(unitPrice) * 100),
      p_included_quantity: Number(included) || 0,
      p_unit_label: unitLabel || null,
    }, 'Meter saved');
    if (ok) { setMetric(''); setUnitPrice(''); setIncluded('0'); setUnitLabel(''); }
  };

  const recordUsage = async () => {
    const ok = await call('record_subscription_usage', {
      p_subscription_id: sub.id,
      p_metric: usageMetric || meters?.[0]?.metric,
      p_quantity: Number(usageQty),
    }, 'Usage recorded');
    if (ok) setUsageQty('');
  };

  const unbilledTotal = (meters ?? []).reduce((sum, m) => sum + Number(m.unbilled_amount_cents), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Usage — {sub.customer_name ?? sub.customer_email}</DialogTitle>
          <DialogDescription>
            Unbilled usage is added to the next subscription invoice as its own lines. The included quantity applies per invoice period.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !meters || meters.length === 0 ? (
          <p className="text-sm text-muted-foreground">No meters yet. Add one below — the price per unit lives on the meter.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Meter</TableHead>
                <TableHead className="text-right">Price / unit</TableHead>
                <TableHead className="text-right">Included</TableHead>
                <TableHead className="text-right">Unbilled</TableHead>
                <TableHead className="text-right">To invoice</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {meters.map((m) => (
                <TableRow key={m.metric}>
                  <TableCell>
                    <div className="font-medium">{m.metric}</div>
                    {m.unit_label && <div className="text-xs text-muted-foreground">{m.unit_label}</div>}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(m.unit_amount_cents, sub.currency)}</TableCell>
                  <TableCell className="text-right">{formatNumber(Number(m.included_quantity))}</TableCell>
                  <TableCell className="text-right">{formatNumber(Number(m.unbilled_quantity))}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(m.unbilled_amount_cents), sub.currency)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={4} className="text-right font-medium">Usage on the next invoice</TableCell>
                <TableCell className="text-right font-medium">{formatCurrency(unbilledTotal, sub.currency)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}

        {meters && meters.length > 0 && (
          <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 border-t pt-4">
            <div>
              <Label htmlFor="usage-metric">Meter</Label>
              <Input id="usage-metric" value={usageMetric} onChange={(e) => setUsageMetric(e.target.value)} placeholder={meters[0].metric} />
            </div>
            <div>
              <Label htmlFor="usage-qty">Quantity used</Label>
              <Input id="usage-qty" type="number" value={usageQty} onChange={(e) => setUsageQty(e.target.value)} placeholder="Negative corrects unbilled usage" />
            </div>
            <Button onClick={recordUsage} disabled={saving || !Number(usageQty)}>Record usage</Button>
          </div>
        )}

        <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_auto] items-end gap-2 border-t pt-4">
          <div>
            <Label htmlFor="meter-metric">New meter</Label>
            <Input id="meter-metric" value={metric} onChange={(e) => setMetric(e.target.value)} placeholder="api_calls" />
          </div>
          <div>
            <Label htmlFor="meter-price">Price / unit</Label>
            <Input id="meter-price" type="number" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="meter-included">Included</Label>
            <Input id="meter-included" type="number" value={included} onChange={(e) => setIncluded(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="meter-label">Unit</Label>
            <Input id="meter-label" value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} placeholder="calls" />
          </div>
          <Button variant="outline" onClick={addMeter} disabled={saving || !metric.trim() || unitPrice === ''}>Save meter</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
