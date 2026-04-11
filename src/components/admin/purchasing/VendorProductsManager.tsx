import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Star, Trash2, Package, Truck } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

interface VendorProduct {
  id: string;
  vendor_id: string;
  product_id: string;
  unit_price_cents: number;
  currency: string;
  lead_time_days: number | null;
  min_order_quantity: number;
  vendor_sku: string | null;
  is_preferred: boolean;
  notes: string | null;
  vendors?: { name: string };
  products?: { name: string };
}

export function VendorProductsManager() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [vendorId, setVendorId] = useState('');
  const [productId, setProductId] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [leadTime, setLeadTime] = useState('7');
  const [minQty, setMinQty] = useState('1');
  const [vendorSku, setVendorSku] = useState('');
  const [isPreferred, setIsPreferred] = useState(false);

  const { data: vendorProducts = [], isLoading } = useQuery({
    queryKey: ['vendor-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendor_products')
        .select('*, vendors(name), products(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as VendorProduct[];
    },
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors-list'],
    queryFn: async () => {
      const { data } = await supabase.from('vendors').select('id, name').eq('is_active', true).order('name');
      return data || [];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products-list-active'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, name').eq('is_active', true).order('name');
      return data || [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('vendor_products').insert({
        vendor_id: vendorId,
        product_id: productId,
        unit_price_cents: Math.round(parseFloat(unitPrice) * 100),
        lead_time_days: parseInt(leadTime) || 7,
        min_order_quantity: parseInt(minQty) || 1,
        vendor_sku: vendorSku || null,
        is_preferred: isPreferred,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendor-products'] });
      toast({ title: 'Vendor-product link added' });
      resetForm();
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('vendor_products').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendor-products'] });
      toast({ title: 'Link removed' });
    },
  });

  const togglePreferred = useMutation({
    mutationFn: async ({ id, productId: pid, current }: { id: string; productId: string; current: boolean }) => {
      if (!current) {
        // Unset any existing preferred for this product first
        await supabase.from('vendor_products').update({ is_preferred: false }).eq('product_id', pid);
      }
      const { error } = await supabase.from('vendor_products').update({ is_preferred: !current }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendor-products'] }),
  });

  const resetForm = () => {
    setDialogOpen(false);
    setVendorId('');
    setProductId('');
    setUnitPrice('');
    setLeadTime('7');
    setMinQty('1');
    setVendorSku('');
    setIsPreferred(false);
  };

  // Group by product for overview
  const byProduct = new Map<string, VendorProduct[]>();
  for (const vp of vendorProducts) {
    const key = vp.product_id;
    if (!byProduct.has(key)) byProduct.set(key, []);
    byProduct.get(key)!.push(vp);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Vendor-Product Sourcing
            </CardTitle>
            <CardDescription>
              Map which vendors supply which products. Preferred vendors are used for auto-reorder POs.
            </CardDescription>
          </div>
          <Button onClick={() => setDialogOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add Link
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : vendorProducts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>No vendor-product links yet.</p>
            <p className="text-xs mt-1">Add links so FlowPilot can auto-create purchase orders from the right vendor.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Lead Time</TableHead>
                <TableHead className="text-right">Min Qty</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-center">Preferred</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendorProducts.map((vp) => (
                <TableRow key={vp.id}>
                  <TableCell className="font-medium">{vp.products?.name || '—'}</TableCell>
                  <TableCell>{vp.vendors?.name || '—'}</TableCell>
                  <TableCell className="text-right">{(vp.unit_price_cents / 100).toFixed(2)} {vp.currency}</TableCell>
                  <TableCell className="text-right">{vp.lead_time_days ?? '—'} days</TableCell>
                  <TableCell className="text-right">{vp.min_order_quantity}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{vp.vendor_sku || '—'}</TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => togglePreferred.mutate({ id: vp.id, productId: vp.product_id, current: vp.is_preferred })}
                    >
                      <Star className={`h-4 w-4 ${vp.is_preferred ? 'fill-yellow-400 text-yellow-500' : 'text-muted-foreground'}`} />
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(vp.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Vendor-Product Link</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Product</Label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Vendor</Label>
                <Select value={vendorId} onValueChange={setVendorId}>
                  <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Unit Price (SEK)</Label>
                  <Input type="number" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="0.00" />
                </div>
                <div>
                  <Label>Lead Time (days)</Label>
                  <Input type="number" value={leadTime} onChange={(e) => setLeadTime(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Min Order Qty</Label>
                  <Input type="number" value={minQty} onChange={(e) => setMinQty(e.target.value)} />
                </div>
                <div>
                  <Label>Vendor SKU</Label>
                  <Input value={vendorSku} onChange={(e) => setVendorSku(e.target.value)} placeholder="Optional" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={isPreferred} onCheckedChange={setIsPreferred} />
                <Label>Preferred vendor for this product</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
              <Button onClick={() => addMutation.mutate()} disabled={!vendorId || !productId || !unitPrice}>
                Add Link
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
