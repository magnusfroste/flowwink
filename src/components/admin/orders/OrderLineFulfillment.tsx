import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase as supabaseTyped } from '@/integrations/supabase/client';
// New tables/RPCs not in generated types yet — bypass strict typing.
const supabase = supabaseTyped;
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Loader2, PackageCheck } from 'lucide-react';
import { toast } from 'sonner';

interface Line {
  id: string;
  product_name: string;
  quantity: number;
  qty_fulfilled: number | null;
}

export function OrderLineFulfillment({ lines, orderId }: { lines: Line[]; orderId: string }) {
  const qc = useQueryClient();
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});

  const fulfill = useMutation({
    mutationFn: async (input: { line_id: string; qty?: number }) => {
      const { data, error } = await supabase.rpc('fulfill_order_line', {
        p_line_id: input.line_id,
        p_qty: input.qty ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Line fulfilled');
      qc.invalidateQueries({ queryKey: ['admin-order-items', orderId] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2">
      {lines.map(line => {
        const fulfilled = Number(line.qty_fulfilled ?? 0);
        const remaining = Math.max(0, line.quantity - fulfilled);
        const pct = line.quantity > 0 ? (fulfilled / line.quantity) * 100 : 0;
        const complete = remaining <= 0;
        return (
          <div key={line.id} className="rounded-md border p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{line.product_name}</p>
                <p className="text-xs text-muted-foreground">
                  {fulfilled} / {line.quantity} fulfilled · {remaining} remaining
                </p>
              </div>
              {complete ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                  <PackageCheck className="h-3.5 w-3.5" /> Complete
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={remaining}
                    placeholder={String(remaining)}
                    value={qtyMap[line.id] ?? ''}
                    onChange={e => setQtyMap(m => ({ ...m, [line.id]: e.target.value }))}
                    className="h-8 w-20 text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={() =>
                      fulfill.mutate({
                        line_id: line.id,
                        qty: qtyMap[line.id] ? Number(qtyMap[line.id]) : undefined,
                      })
                    }
                    disabled={fulfill.isPending}
                  >
                    {fulfill.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Fulfill'}
                  </Button>
                </div>
              )}
            </div>
            <Progress value={pct} className="h-1.5" />
          </div>
        );
      })}
    </div>
  );
}
