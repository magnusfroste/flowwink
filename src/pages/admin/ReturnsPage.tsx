import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Undo2, CheckCircle2, PackageCheck, ClipboardCheck, DollarSign, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface ReturnRow {
  id: string;
  rma_number: string;
  order_id: string;
  status: string;
  reason: string | null;
  reason_code: string | null;
  refund_amount_cents: number | null;
  refund_currency: string | null;
  restocking_fee_cents: number | null;
  total_amount_cents: number | null;
  refunded_cents: number | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  requested: 'outline', approved: 'secondary', received: 'secondary',
  refunded: 'default', rejected: 'destructive', cancelled: 'destructive',
};

const REASON_CODES = [
  { value: 'defective', label: 'Defective' },
  { value: 'wrong_item', label: 'Wrong item' },
  { value: 'not_as_described', label: 'Not as described' },
  { value: 'changed_mind', label: 'Changed mind' },
  { value: 'damaged_in_transit', label: 'Damaged in transit' },
  { value: 'other', label: 'Other' },
];

function reasonLabel(code: string | null) {
  return REASON_CODES.find((r) => r.value === code)?.label ?? code ?? '—';
}

function formatMoney(cents: number | null | undefined, currency = 'SEK') {
  if (cents == null) return '—';
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency }).format(cents / 100);
}

function CreateReturnDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [reasonCode, setReasonCode] = useState('defective');
  const [reason, setReason] = useState('');

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('returns' as any)
        .insert({ order_id: orderId, reason_code: reasonCode, reason: reason || null, status: 'requested' } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['returns'] });
      qc.invalidateQueries({ queryKey: ['return-reasons'] });
      toast.success('Return created');
      setOpen(false);
      setOrderId(''); setReasonCode('defective'); setReason('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-2" /> New return</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create new RMA</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Order ID</Label>
            <Input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="UUID of the order" />
          </div>
          <div className="space-y-2">
            <Label>Reason code</Label>
            <Select value={reasonCode} onValueChange={setReasonCode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASON_CODES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!orderId || create.isPending}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InspectDialog({ returnRow }: { returnRow: ReturnRow }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [fee, setFee] = useState('0');

  const inspect = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('inspect_return' as any, {
        p_return_id: returnRow.id,
        p_notes: notes || null,
        p_restocking_fee_cents: Math.round(Number(fee || '0') * 100),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['returns'] });
      toast.success('Inspection recorded');
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><ClipboardCheck className="h-3 w-3 mr-1" /> Inspect</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Inspect {returnRow.rma_number}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Inspection notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <div className="space-y-2">
            <Label>Restocking fee</Label>
            <Input type="number" min="0" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => inspect.mutate()} disabled={inspect.isPending}>Save inspection</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RefundDialog({ returnRow }: { returnRow: ReturnRow }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const expectedTotal = (returnRow.total_amount_cents ?? 0) - (returnRow.restocking_fee_cents ?? 0);
  const alreadyRefunded = returnRow.refunded_cents ?? 0;
  const remaining = Math.max(0, expectedTotal - alreadyRefunded);

  const [amount, setAmount] = useState((remaining / 100).toFixed(2));
  const [method, setMethod] = useState('manual');
  const [isFinal, setIsFinal] = useState(true);
  const [lastRemaining, setLastRemaining] = useState<number | null>(null);

  const refund = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('refund_return' as any, {
        p_return_id: returnRow.id,
        p_refund_cents: Math.round(Number(amount) * 100),
        p_method: method,
        p_final: isFinal,
      });
      if (error) throw error;
      return (data ?? {}) as { remaining_cents?: number };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['returns'] });
      setLastRemaining(r.remaining_cents ?? 0);
      toast.success(
        (r.remaining_cents ?? 0) > 0
          ? `Refund posted. Remaining: ${formatMoney(r.remaining_cents ?? 0, returnRow.refund_currency ?? 'SEK')}`
          : 'Refund completed'
      );
      if ((r.remaining_cents ?? 0) === 0) setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setLastRemaining(null); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><DollarSign className="h-3 w-3 mr-1" /> Refund</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Refund {returnRow.rma_number}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-2 p-3 rounded-md bg-muted/40">
            <div><div className="text-xs text-muted-foreground">Items</div><div className="font-medium">{formatMoney(returnRow.total_amount_cents, returnRow.refund_currency ?? 'SEK')}</div></div>
            <div><div className="text-xs text-muted-foreground">Restock fee</div><div className="font-medium">−{formatMoney(returnRow.restocking_fee_cents, returnRow.refund_currency ?? 'SEK')}</div></div>
            <div><div className="text-xs text-muted-foreground">Already refunded</div><div className="font-medium">{formatMoney(alreadyRefunded, returnRow.refund_currency ?? 'SEK')}</div></div>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Remaining: </span>
            <span className="font-semibold">{formatMoney(lastRemaining ?? remaining, returnRow.refund_currency ?? 'SEK')}</span>
          </div>
          <div className="space-y-2">
            <Label>Refund amount</Label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="stripe">Stripe</SelectItem>
                <SelectItem value="bank">Bank transfer</SelectItem>
                <SelectItem value="store_credit">Store credit</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm">Final refund</Label>
              <p className="text-xs text-muted-foreground">Closes the RMA after this payout</p>
            </div>
            <Switch checked={isFinal} onCheckedChange={setIsFinal} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          <Button onClick={() => refund.mutate()} disabled={refund.isPending || Number(amount) <= 0}>
            Post refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReasonsWidget() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery({
    queryKey: ['return-reasons', days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('return_reason_report' as any, { p_days: days });
      if (error) throw error;
      const r = (data ?? {}) as { reasons?: { reason_code: string; cnt: number; refunded_cents: number }[] };
      return r.reasons ?? [];
    },
  });

  const total = (data ?? []).reduce((s, r) => s + r.cnt, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Return reasons</CardTitle>
            <CardDescription>Last {days} days · {total} returns</CardDescription>
          </div>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
              <SelectItem value="365">1 year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No returns in this period.</p>
        ) : (
          <div className="space-y-2">
            {data!.map((r) => {
              const pct = total ? (r.cnt / total) * 100 : 0;
              return (
                <div key={r.reason_code} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{reasonLabel(r.reason_code)}</span>
                    <span className="text-muted-foreground">{r.cnt} · {formatMoney(r.refunded_cents)}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ReturnsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['returns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('returns' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ReturnRow[];
    },
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('approve_return' as any, { p_return_id: id });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['returns'] }); toast.success('Return approved'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const receive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('receive_return' as any, { p_return_id: id });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['returns'] }); toast.success('Return received & restocked'); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AdminLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Undo2 className="h-7 w-7" /> Returns / RMA
            </h1>
            <p className="text-muted-foreground mt-1">
              Process customer returns: approve, receive & restock, inspect, refund.
            </p>
          </div>
          <CreateReturnDialog />
        </div>

        <ReasonsWidget />

        <Card>
          <CardHeader>
            <CardTitle>All returns</CardTitle>
            <CardDescription>
              Flow: requested → approved → received → inspected → refunded (partial payouts allowed)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : (data?.length ?? 0) === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No returns yet.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>RMA #</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Refunded</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data!.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.rma_number}</TableCell>
                      <TableCell className="text-xs font-mono">{r.order_id.slice(0, 8)}</TableCell>
                      <TableCell className="max-w-xs">
                        <div className="space-y-0.5">
                          <Badge variant="outline" className="text-xs">{reasonLabel(r.reason_code)}</Badge>
                          {r.reason && <div className="text-xs text-muted-foreground truncate">{r.reason}</div>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_COLORS[r.status] ?? 'outline'}>{r.status}</Badge>
                      </TableCell>
                      <TableCell>
                        {formatMoney(r.refunded_cents ?? r.refund_amount_cents, r.refund_currency ?? 'SEK')}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        {r.status === 'requested' && (
                          <Button size="sm" variant="outline" onClick={() => approve.mutate(r.id)}>
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                          </Button>
                        )}
                        {r.status === 'approved' && (
                          <Button size="sm" variant="outline" onClick={() => receive.mutate(r.id)}>
                            <PackageCheck className="h-3 w-3 mr-1" /> Receive
                          </Button>
                        )}
                        {r.status === 'received' && <InspectDialog returnRow={r} />}
                        {(r.status === 'received' || r.status === 'inspected' || r.status === 'partially_refunded') && (
                          <RefundDialog returnRow={r} />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
