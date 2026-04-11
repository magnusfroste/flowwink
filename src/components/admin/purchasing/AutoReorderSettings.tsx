import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Bot, AlertTriangle } from 'lucide-react';
import { useState } from 'react';

interface StockRow {
  id: string;
  product_id: string;
  quantity_on_hand: number;
  reorder_point: number;
  reorder_quantity: number;
  auto_reorder: boolean;
  products?: { name: string };
}

export function AutoReorderSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: stockItems = [], isLoading } = useQuery({
    queryKey: ['product-stock-reorder'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_stock')
        .select('id, product_id, quantity_on_hand, reorder_point, reorder_quantity, auto_reorder, products(name)')
        .order('quantity_on_hand', { ascending: true });
      if (error) throw error;
      return data as StockRow[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: any }) => {
      const { error } = await supabase.from('product_stock').update({ [field]: value }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-stock-reorder'] }),
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  if (isLoading) return <p className="text-muted-foreground text-sm p-4">Loading...</p>;

  const lowStockCount = stockItems.filter(s => s.quantity_on_hand <= s.reorder_point).length;
  const autoReorderCount = stockItems.filter(s => s.auto_reorder).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          Auto-Reorder Rules
        </CardTitle>
        <CardDescription>
          Configure reorder points and quantities. FlowPilot auto-creates purchase orders for items with auto-reorder enabled.
        </CardDescription>
        <div className="flex gap-3 pt-2">
          <Badge variant="outline">{stockItems.length} tracked items</Badge>
          {lowStockCount > 0 && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> {lowStockCount} below reorder point
            </Badge>
          )}
          <Badge variant="secondary">{autoReorderCount} auto-reorder enabled</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {stockItems.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-6">No inventory-tracked products found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">On Hand</TableHead>
                <TableHead className="text-right">Reorder Point</TableHead>
                <TableHead className="text-right">Reorder Qty</TableHead>
                <TableHead className="text-center">Auto-Reorder</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stockItems.map((item) => {
                const isLow = item.quantity_on_hand <= item.reorder_point;
                return (
                  <TableRow key={item.id} className={isLow ? 'bg-destructive/5' : ''}>
                    <TableCell className="font-medium">{item.products?.name || '—'}</TableCell>
                    <TableCell className="text-right">{item.quantity_on_hand}</TableCell>
                    <TableCell className="text-right">
                      <EditableCell
                        value={item.reorder_point}
                        onSave={(v) => updateMutation.mutate({ id: item.id, field: 'reorder_point', value: v })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <EditableCell
                        value={item.reorder_quantity}
                        onSave={(v) => updateMutation.mutate({ id: item.id, field: 'reorder_quantity', value: v })}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={item.auto_reorder}
                        onCheckedChange={(v) => updateMutation.mutate({ id: item.id, field: 'auto_reorder', value: v })}
                      />
                    </TableCell>
                    <TableCell>
                      {isLow ? (
                        <Badge variant="destructive" className="text-xs">Low Stock</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">OK</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function EditableCell({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(value));

  if (!editing) {
    return (
      <span
        className="cursor-pointer hover:underline tabular-nums"
        onClick={() => { setVal(String(value)); setEditing(true); }}
      >
        {value}
      </span>
    );
  }

  return (
    <Input
      type="number"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => {
        const n = parseInt(val);
        if (!isNaN(n) && n !== value) onSave(n);
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setEditing(false);
      }}
      className="w-20 h-7 text-right"
      autoFocus
    />
  );
}
