import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, Wallet } from 'lucide-react';
import { useInventoryValuation } from '@/hooks/useInventoryValuation';
import { formatPrice } from '@/hooks/useProducts';

export function InventoryValuationPanel() {
  const { data, isLoading } = useInventoryValuation(500);
  const qc = useQueryClient();

  const rows = useMemo(() => {
    return [...(data?.products ?? [])].sort((a, b) => b.value_cents - a.value_cents);
  }, [data]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wallet className="h-8 w-8 text-primary" />
            <div>
              <p className="text-xs uppercase text-muted-foreground tracking-wide">Total inventory value</p>
              <p className="text-3xl font-bold tabular-nums">
                {formatPrice(data?.total_value_cents ?? 0, 'SEK')}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ['inventory-valuation'] })}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-product valuation</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Avg unit cost</TableHead>
                <TableHead className="text-right">Total value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No stock on hand.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((p) => (
                  <TableRow key={p.product_id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.on_hand_qty}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPrice(p.avg_unit_cost_cents, 'SEK')}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatPrice(p.value_cents, 'SEK')}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
