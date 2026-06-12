import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Props {
  purchaseOrderId: string;
  currency?: string;
}

function fmtMoney(cents: number | null | undefined, currency = 'SEK') {
  if (cents == null) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function LandedCostPanel({ purchaseOrderId, currency = 'SEK' }: Props) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'by_value' | 'by_qty'>('by_value');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['landed-costs', purchaseOrderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('landed_costs' as never)
        .select('*')
        .eq('reference_type', 'purchase_order')
        .eq('reference_id', purchaseOrderId)
        .order('created_at', { ascending: false });
      if (error) return [];
      return (data as unknown as Array<{
        id: string;
        amount_cents: number;
        method: string;
        description: string | null;
        created_at: string;
        journal_entry_id: string | null;
      }>) ?? [];
    },
  });

  const submit = async () => {
    const amountCents = Math.round(Number(amount) * 100);
    if (!amountCents || amountCents <= 0) {
      toast.error('Amount must be greater than zero');
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('allocate_landed_cost' as never, {
        p_reference_type: 'purchase_order',
        p_reference_id: purchaseOrderId,
        p_amount_cents: amountCents,
        p_method: method,
        p_description: description || null,
      } as never);
      if (error) throw error;
      const d = (data as { layers_adjusted?: number; journal_entry_id?: string } | null) ?? {};
      toast.success(`Landed cost allocated`, {
        description: `${d.layers_adjusted ?? 0} stock layers adjusted${d.journal_entry_id ? ` · Journal ${d.journal_entry_id.slice(0, 8)}…` : ''}`,
        action: d.journal_entry_id
          ? { label: 'Open', onClick: () => window.open(`/admin/accounting/journal/${d.journal_entry_id}`, '_blank') }
          : undefined,
      });
      setAmount('');
      setDescription('');
      setMethod('by_value');
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['landed-costs', purchaseOrderId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to allocate landed cost');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Truck className="h-4 w-4" /> Landed costs
        </CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">Add landed cost</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Allocate landed cost</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Amount *</Label>
                <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label>Allocation method</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as 'by_value' | 'by_qty')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="by_value">By value (proportional to line value)</SelectItem>
                    <SelectItem value="by_qty">By quantity (proportional to units)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Freight, duty, insurance…" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
              <Button onClick={submit} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Allocate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No landed costs allocated yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Journal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-sm">{format(new Date(e.created_at), 'MMM d, yyyy')}</TableCell>
                  <TableCell className="text-sm">{e.description ?? '—'}</TableCell>
                  <TableCell className="text-sm">{e.method === 'by_qty' ? 'By qty' : 'By value'}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmtMoney(e.amount_cents, currency)}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{e.journal_entry_id ? e.journal_entry_id.slice(0, 8) + '…' : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
