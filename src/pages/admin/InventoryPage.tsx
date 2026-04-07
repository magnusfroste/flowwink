import { useState } from 'react';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, TrendingDown, TrendingUp, AlertTriangle, Plus, ArrowDownUp } from 'lucide-react';
import { useProductStock, useStockMoves, useAdjustStock, useSetReorderPoint, useInitializeStock } from '@/hooks/useInventory';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';

function StockBadge({ qty, reorder }: { qty: number; reorder: number }) {
  if (qty <= 0) return <Badge variant="destructive">Out of Stock</Badge>;
  if (qty <= reorder) return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Low Stock</Badge>;
  return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">In Stock</Badge>;
}

export default function InventoryPage() {
  const { data: stock = [], isLoading } = useProductStock();
  const { data: moves = [] } = useStockMoves();
  const adjustStock = useAdjustStock();
  const setReorder = useSetReorderPoint();
  const initStock = useInitializeStock();

  const [adjustDialog, setAdjustDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustType, setAdjustType] = useState<'in' | 'out' | 'adjustment'>('in');
  const [adjustNotes, setAdjustNotes] = useState('');

  // Products without stock tracking
  const { data: allProducts = [] } = useQuery({
    queryKey: ['products-for-inventory'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, status')
        .order('name');
      return data ?? [];
    },
  });

  const untrackedProducts = allProducts.filter(
    p => !stock.some(s => s.product_id === p.id)
  );

  const lowStockCount = stock.filter(s => s.quantity_on_hand > 0 && s.quantity_on_hand <= s.reorder_point).length;
  const outOfStockCount = stock.filter(s => s.quantity_on_hand <= 0).length;
  const totalValue = stock.reduce((sum, s) => {
    const price = s.products?.price_cents ?? 0;
    return sum + (s.quantity_on_hand * price);
  }, 0);

  const handleAdjust = () => {
    if (!selectedProduct || !adjustQty) return;
    adjustStock.mutate({
      product_id: selectedProduct,
      quantity: parseInt(adjustQty),
      move_type: adjustType,
      notes: adjustNotes,
    }, {
      onSuccess: () => {
        setAdjustDialog(false);
        setAdjustQty('');
        setAdjustNotes('');
      },
    });
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Inventory"
        description="Track stock levels, movements, and reorder points across all products."
      >
        <Button onClick={() => setAdjustDialog(true)} className="gap-2">
          <ArrowDownUp className="h-4 w-4" />
          Stock Adjustment
        </Button>
      </AdminPageHeader>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Package className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{stock.length}</p>
                <p className="text-xs text-muted-foreground">Tracked Products</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-emerald-500" />
              <div>
                <p className="text-2xl font-bold">
                  {(totalValue / 100).toLocaleString('sv-SE', { style: 'currency', currency: stock[0]?.products?.currency || 'SEK' })}
                </p>
                <p className="text-xs text-muted-foreground">Stock Value</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingDown className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{lowStockCount}</p>
                <p className="text-xs text-muted-foreground">Low Stock</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <div>
                <p className="text-2xl font-bold">{outOfStockCount}</p>
                <p className="text-xs text-muted-foreground">Out of Stock</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">Stock Levels</TabsTrigger>
          <TabsTrigger value="moves">Movements</TabsTrigger>
          <TabsTrigger value="untracked">Untracked ({untrackedProducts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="stock">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">On Hand</TableHead>
                    <TableHead className="text-right">Reserved</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Reorder Point</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : stock.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No products tracked yet. Enable tracking from the Untracked tab.</TableCell></TableRow>
                  ) : stock.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.products?.name ?? 'Unknown'}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.quantity_on_hand}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.quantity_reserved}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{s.quantity_on_hand - s.quantity_reserved}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          className="w-20 ml-auto h-8 text-right"
                          defaultValue={s.reorder_point}
                          onBlur={(e) => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val) && val !== s.reorder_point) {
                              setReorder.mutate({ product_id: s.product_id, reorder_point: val });
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <StockBadge qty={s.quantity_on_hand} reorder={s.reorder_point} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => {
                            setSelectedProduct(s.product_id);
                            setAdjustDialog(true);
                          }}
                        >
                          Adjust
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="moves">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {moves.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No stock movements yet.</TableCell></TableRow>
                  ) : moves.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.products?.name ?? 'Unknown'}</TableCell>
                      <TableCell>
                        <Badge variant={m.move_type === 'in' ? 'default' : m.move_type === 'out' ? 'destructive' : 'secondary'}>
                          {m.move_type}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right tabular-nums font-medium ${m.quantity > 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                        {m.quantity > 0 ? '+' : ''}{m.quantity}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {m.reference_type ? `${m.reference_type}` : '—'}
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{m.notes || '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="untracked">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Products Without Stock Tracking</CardTitle>
            </CardHeader>
            <CardContent>
              {untrackedProducts.length === 0 ? (
                <p className="text-muted-foreground text-sm">All products are being tracked.</p>
              ) : (
                <div className="space-y-2">
                  {untrackedProducts.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="font-medium text-sm">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.status}</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => initStock.mutate(p.id)} className="gap-1">
                        <Plus className="h-3 w-3" /> Enable Tracking
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Adjust Dialog */}
      <Dialog open={adjustDialog} onOpenChange={setAdjustDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stock Adjustment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Product</Label>
              <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {stock.map(s => (
                    <SelectItem key={s.product_id} value={s.product_id}>
                      {s.products?.name ?? s.product_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type</Label>
              <Select value={adjustType} onValueChange={(v) => setAdjustType(v as 'in' | 'out' | 'adjustment')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Stock In (receiving)</SelectItem>
                  <SelectItem value="out">Stock Out (manual)</SelectItem>
                  <SelectItem value="adjustment">Adjustment (count correction)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantity</Label>
              <Input type="number" min="1" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input value={adjustNotes} onChange={e => setAdjustNotes(e.target.value)} placeholder="Reason for adjustment" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialog(false)}>Cancel</Button>
            <Button onClick={handleAdjust} disabled={!selectedProduct || !adjustQty || adjustStock.isPending}>
              {adjustStock.isPending ? 'Saving...' : 'Apply'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
