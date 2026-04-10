import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Plus, Trash2, Send, CheckCircle, PackageCheck } from 'lucide-react';
import { GoodsReceiptDialog } from './GoodsReceiptDialog';

interface POLine {
  id?: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price_cents: number;
  tax_rate: number;
  total_cents: number;
  received_quantity: number;
}

const emptyLine = (): POLine => ({
  product_id: null,
  description: '',
  quantity: 1,
  unit_price_cents: 0,
  tax_rate: 25,
  total_cents: 0,
  received_quantity: 0,
});

const calcLineTotal = (l: POLine) => Math.round(l.quantity * l.unit_price_cents * (1 + l.tax_rate / 100));

interface Props {
  poId: string | null;
  onClose: () => void;
}

export function PurchaseOrderEditor({ poId, onClose }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [vendorId, setVendorId] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [notes, setNotes] = useState('');
  const [currency, setCurrency] = useState('SEK');
  const [lines, setLines] = useState<POLine[]>([emptyLine()]);
  const [status, setStatus] = useState('draft');
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors-active'],
    queryFn: async () => {
      const { data } = await supabase.from('vendors').select('id, name, currency').eq('is_active', true).order('name');
      return data || [];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products-simple'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, name, price_cents').order('name');
      return data || [];
    },
  });

  // Load existing PO
  useQuery({
    queryKey: ['purchase-order', poId],
    enabled: !!poId,
    queryFn: async () => {
      const { data: po, error } = await supabase.from('purchase_orders').select('*').eq('id', poId!).single();
      if (error) throw error;
      setVendorId(po.vendor_id);
      setOrderDate(po.order_date);
      setExpectedDelivery(po.expected_delivery || '');
      setNotes(po.notes || '');
      setCurrency(po.currency);
      setStatus(po.status);

      const { data: poLines } = await supabase.from('purchase_order_lines').select('*').eq('purchase_order_id', poId!);
      if (poLines && poLines.length > 0) {
        setLines(poLines.map(l => ({
          id: l.id,
          product_id: l.product_id,
          description: l.description,
          quantity: l.quantity,
          unit_price_cents: l.unit_price_cents,
          tax_rate: Number(l.tax_rate),
          total_cents: l.total_cents,
          received_quantity: l.received_quantity,
        })));
      }
      return po;
    },
  });

  const updateLine = (idx: number, patch: Partial<POLine>) => {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, ...patch };
      updated.total_cents = calcLineTotal(updated);
      return updated;
    }));
  };

  const addLine = () => setLines(prev => [...prev, emptyLine()]);
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unit_price_cents, 0);
  const tax = lines.reduce((s, l) => s + Math.round(l.quantity * l.unit_price_cents * l.tax_rate / 100), 0);
  const total = subtotal + tax;

  const formatCurrency = (cents: number) =>
    new Intl.NumberFormat('sv-SE', { style: 'currency', currency }).format(cents / 100);

  const saveMutation = useMutation({
    mutationFn: async (newStatus?: string) => {
      const resolvedStatus = (newStatus || status) as 'draft' | 'sent' | 'confirmed' | 'partially_received' | 'received' | 'cancelled';
      const poPayload = {
        vendor_id: vendorId,
        order_date: orderDate,
        expected_delivery: expectedDelivery || null,
        notes: notes || null,
        currency,
        subtotal_cents: subtotal,
        tax_cents: tax,
        total_cents: total,
        status: resolvedStatus,
        created_by: user?.id,
      };

      let id = poId;
      if (poId) {
        const { error } = await supabase.from('purchase_orders').update(poPayload).eq('id', poId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('purchase_orders').insert([{
          ...poPayload,
          po_number: `PO-TEMP-${Date.now()}`,
        }]).select('id').single();
        if (error) throw error;
        id = data.id;
      }

      // Delete old lines and re-insert
      await supabase.from('purchase_order_lines').delete().eq('purchase_order_id', id!);
      if (lines.length > 0) {
        const linePayloads = lines.map(l => ({
          purchase_order_id: id!,
          product_id: l.product_id || null,
          description: l.description,
          quantity: l.quantity,
          unit_price_cents: l.unit_price_cents,
          tax_rate: l.tax_rate,
          total_cents: calcLineTotal(l),
          received_quantity: l.received_quantity,
        }));
        const { error } = await supabase.from('purchase_order_lines').insert(linePayloads);
        if (error) throw error;
      }
      if (newStatus) setStatus(newStatus);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast({ title: 'Purchase order saved' });
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const isDraft = status === 'draft';
  const isSent = status === 'sent';
  const isConfirmed = status === 'confirmed';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onClose}><ArrowLeft className="h-4 w-4" /></Button>
        <h2 className="text-lg font-semibold">{poId ? `Edit Purchase Order` : 'New Purchase Order'}</h2>
        {poId && <span className="text-muted-foreground text-sm">Status: {status}</span>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>Vendor *</Label>
          <Select value={vendorId} onValueChange={(v) => {
            setVendorId(v);
            const vendor = vendors.find(x => x.id === v);
            if (vendor) setCurrency(vendor.currency);
          }}>
            <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
            <SelectContent>
              {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Order Date</Label>
          <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
        </div>
        <div>
          <Label>Expected Delivery</Label>
          <Input type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Order Lines</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[35%]">Description</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Tax %</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <Input
                      value={l.description}
                      onChange={(e) => updateLine(idx, { description: e.target.value })}
                      placeholder="Item description"
                    />
                  </TableCell>
                  <TableCell>
                    <Select value={l.product_id || 'none'} onValueChange={(v) => {
                      const pid = v === 'none' ? null : v;
                      const product = products.find(p => p.id === v);
                      updateLine(idx, {
                        product_id: pid,
                        description: product ? product.name : l.description,
                        unit_price_cents: product ? product.price_cents : l.unit_price_cents,
                      });
                    }}>
                      <SelectTrigger className="w-32"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— None —</SelectItem>
                        {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number" min={1}
                      className="text-right w-20"
                      value={l.quantity}
                      onChange={(e) => updateLine(idx, { quantity: parseInt(e.target.value) || 1 })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number" min={0} step={1}
                      className="text-right w-28"
                      value={l.unit_price_cents / 100}
                      onChange={(e) => updateLine(idx, { unit_price_cents: Math.round(parseFloat(e.target.value || '0') * 100) })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number" min={0} max={100} step={0.5}
                      className="text-right w-20"
                      value={l.tax_rate}
                      onChange={(e) => updateLine(idx, { tax_rate: parseFloat(e.target.value || '0') })}
                    />
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(calcLineTotal(l))}
                  </TableCell>
                  <TableCell>
                    {lines.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => removeLine(idx)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Button variant="outline" size="sm" className="mt-3" onClick={addLine}>
            <Plus className="h-4 w-4 mr-1" /> Add Line
          </Button>
        </CardContent>
      </Card>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-64 space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">{formatCurrency(subtotal)}</span></div>
          <div className="flex justify-between"><span>Tax</span><span className="font-mono">{formatCurrency(tax)}</span></div>
          <div className="flex justify-between font-semibold text-base border-t pt-1"><span>Total</span><span className="font-mono">{formatCurrency(total)}</span></div>
        </div>
      </div>

      <div>
        <Label>Notes</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <div className="flex gap-2">
          {isDraft && (
            <>
              <Button variant="outline" onClick={() => saveMutation.mutate(undefined)} disabled={!vendorId || saveMutation.isPending}>
                Save Draft
              </Button>
              <Button onClick={() => saveMutation.mutate('sent')} disabled={!vendorId || saveMutation.isPending}>
                <Send className="h-4 w-4 mr-2" /> Mark as Sent
              </Button>
            </>
          )}
          {isSent && (
            <Button onClick={() => saveMutation.mutate('confirmed')} disabled={saveMutation.isPending}>
              <CheckCircle className="h-4 w-4 mr-2" /> Confirm
            </Button>
          )}
          {(isConfirmed || status === 'partially_received') && (
            <Button onClick={() => setReceiptDialogOpen(true)} disabled={saveMutation.isPending}>
              <PackageCheck className="h-4 w-4 mr-2" /> Receive Goods
            </Button>
          )}
          {!isDraft && status !== 'cancelled' && status !== 'received' && (
            <Button variant="outline" onClick={() => saveMutation.mutate(undefined)} disabled={saveMutation.isPending}>
              Save Changes
            </Button>
          )}
        </div>
      </div>

      {poId && (
        <GoodsReceiptDialog
          open={receiptDialogOpen}
          onOpenChange={setReceiptDialogOpen}
          purchaseOrderId={poId}
          lines={lines.map((l, i) => ({ ...l, id: l.id || `temp-${i}`, purchase_order_id: poId }))}
        />
      )}
    </div>
  );
}
