import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowRightLeft, Plus, Play, PackageCheck, ClipboardCheck, ArrowDownToLine } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStockLocations } from '@/hooks/useInventoryV2';
import {
  useInventoryTransfers, useCreateTransfer, useCompleteTransfer,
  useInventoryReceipts, useCreateReceipt, useAdvanceReceipt, useInventoryReceiptLines, useUpdateReceiptLine,
  useExpiringLots, useAbcAnalysis,
} from '@/hooks/useInventoryParity';

function useProductsLite() {
  return useQuery({
    queryKey: ['products-lite'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, name').eq('is_active', true).order('name').limit(500);
      return data ?? [];
    },
  });
}

// ============================================================
// Inter-warehouse Transfers
// ============================================================
export function TransfersPanel() {
  const { data: transfers = [], isLoading } = useInventoryTransfers();
  const { data: locations = [] } = useStockLocations();
  const { data: products = [] } = useProductsLite();
  const create = useCreateTransfer();
  const complete = useCompleteTransfer();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ from_location_id: '', to_location_id: '', notes: '' });
  const [lines, setLines] = useState<{ product_id: string; quantity: number }[]>([{ product_id: '', quantity: 1 }]);

  const submit = () => {
    if (!form.from_location_id || !form.to_location_id) return;
    const cleanLines = lines.filter(l => l.product_id && l.quantity > 0);
    if (!cleanLines.length) return;
    create.mutate({ ...form, lines: cleanLines }, {
      onSuccess: () => { setOpen(false); setLines([{ product_id: '', quantity: 1 }]); setForm({ from_location_id: '', to_location_id: '', notes: '' }); },
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Inter-warehouse Transfers</CardTitle>
          <p className="text-sm text-muted-foreground">Move stock between internal locations. Posts stock moves on completion.</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" />New Transfer</Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>From → To</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : transfers.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No transfers yet.</TableCell></TableRow>
            ) : transfers.map(t => {
              const fromLoc = locations.find(l => l.id === t.from_location_id);
              const toLoc = locations.find(l => l.id === t.to_location_id);
              return (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.reference}</TableCell>
                  <TableCell className="text-sm"><span className="text-muted-foreground">{fromLoc?.code ?? '—'}</span> <ArrowRightLeft className="inline h-3 w-3 mx-1" /> <span>{toLoc?.code ?? '—'}</span></TableCell>
                  <TableCell>
                    <Badge variant={t.status === 'done' ? 'default' : t.status === 'cancelled' ? 'destructive' : 'secondary'}>{t.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}</TableCell>
                  <TableCell className="text-right">
                    {t.status !== 'done' && t.status !== 'cancelled' && (
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => complete.mutate(t.id)}><Play className="h-3 w-3" />Post</Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New Transfer</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>From Location</Label>
                <Select value={form.from_location_id} onValueChange={v => setForm({ ...form, from_location_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                  <SelectContent>{locations.filter(l => l.location_type === 'internal').map(l => <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>To Location</Label>
                <Select value={form.to_location_id} onValueChange={v => setForm({ ...form, to_location_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Destination" /></SelectTrigger>
                  <SelectContent>{locations.filter(l => l.location_type === 'internal' && l.id !== form.from_location_id).map(l => <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Lines</Label>
              <div className="space-y-2">
                {lines.map((line, i) => (
                  <div key={i} className="grid grid-cols-[1fr,120px,auto] gap-2 items-center">
                    <Select value={line.product_id} onValueChange={v => { const n = [...lines]; n[i] = { ...line, product_id: v }; setLines(n); }}>
                      <SelectTrigger><SelectValue placeholder="Product" /></SelectTrigger>
                      <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" min={1} value={line.quantity} onChange={e => { const n = [...lines]; n[i] = { ...line, quantity: Number(e.target.value) }; setLines(n); }} />
                    <Button size="sm" variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))} disabled={lines.length === 1}>×</Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => setLines([...lines, { product_id: '', quantity: 1 }])} className="gap-1"><Plus className="h-3 w-3" />Add line</Button>
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ============================================================
// Multi-step Receiving
// ============================================================
const NEXT_STATUS: Record<string, 'quality_check' | 'putaway' | 'done'> = {
  received: 'quality_check',
  quality_check: 'putaway',
  putaway: 'done',
};

export function ReceivingRoutePanel() {
  const { data: receipts = [], isLoading } = useInventoryReceipts();
  const advance = useAdvanceReceipt();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Multi-step Receiving Route</CardTitle>
        <p className="text-sm text-muted-foreground">Received → Quality Check → Putaway → Done. Putaway posts stock moves to the target location.</p>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Received</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : receipts.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No multi-step receipts yet.</TableCell></TableRow>
            ) : receipts.map(r => {
              const next = NEXT_STATUS[r.status];
              const Icon = r.status === 'received' ? ClipboardCheck : r.status === 'quality_check' ? ArrowDownToLine : PackageCheck;
              return (
                <>
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                    <TableCell className="font-mono text-xs">{r.reference}</TableCell>
                    <TableCell><Badge variant={r.status === 'done' ? 'default' : 'secondary'} className="gap-1"><Icon className="h-3 w-3" />{r.status.replace('_', ' ')}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDistanceToNow(new Date(r.received_at), { addSuffix: true })}</TableCell>
                    <TableCell className="text-right">
                      {next && (
                        <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); advance.mutate({ receipt_id: r.id, to_status: next }); }}>
                          Advance to {next.replace('_', ' ')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  {expanded === r.id && <ReceiptLinesRow receiptId={r.id} />}
                </>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ReceiptLinesRow({ receiptId }: { receiptId: string }) {
  const { data: lines = [] } = useInventoryReceiptLines(receiptId);
  const { data: locations = [] } = useStockLocations();
  const update = useUpdateReceiptLine();
  return (
    <TableRow>
      <TableCell colSpan={4} className="bg-muted/30 p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>QC</TableHead>
              <TableHead>Target Location</TableHead>
              <TableHead>Putaway Move</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map(l => (
              <TableRow key={l.id}>
                <TableCell>{l.products?.name ?? '—'}</TableCell>
                <TableCell className="text-right">{l.quantity}</TableCell>
                <TableCell>
                  <Select value={l.qc_status} onValueChange={v => update.mutate({ id: l.id, qc_status: v })}>
                    <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="passed">Passed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select value={l.target_location_id ?? ''} onValueChange={v => update.mutate({ id: l.id, target_location_id: v })}>
                    <SelectTrigger className="h-8 w-48"><SelectValue placeholder="Choose bin…" /></SelectTrigger>
                    <SelectContent>{locations.filter(loc => loc.location_type === 'internal').map(loc => <SelectItem key={loc.id} value={loc.id}>{loc.code} — {loc.name}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">{l.putaway_move_id ? l.putaway_move_id.substring(0, 8) : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </TableRow>
  );
}

// Simple "New Receipt" quick action
export function NewReceiptButton() {
  const create = useCreateReceipt();
  const { data: products = [] } = useProductsLite();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<{ product_id: string; quantity: number }[]>([{ product_id: '', quantity: 1 }]);

  const submit = () => {
    const clean = lines.filter(l => l.product_id && l.quantity > 0);
    if (!clean.length) return;
    create.mutate({ notes, lines: clean }, { onSuccess: () => { setOpen(false); setLines([{ product_id: '', quantity: 1 }]); setNotes(''); } });
  };
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" />New Receipt</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Receipt</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-[1fr,120px] gap-2">
                <Select value={line.product_id} onValueChange={v => { const n = [...lines]; n[i] = { ...line, product_id: v }; setLines(n); }}>
                  <SelectTrigger><SelectValue placeholder="Product" /></SelectTrigger>
                  <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="number" min={1} value={line.quantity} onChange={e => { const n = [...lines]; n[i] = { ...line, quantity: Number(e.target.value) }; setLines(n); }} />
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setLines([...lines, { product_id: '', quantity: 1 }])}>Add line</Button>
            <div>
              <Label>Notes</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================
// Expiring Lots (FEFO)
// ============================================================
export function ExpiringLotsPanel() {
  const [days, setDays] = useState(60);
  const { data: lots = [], isLoading } = useExpiringLots(days);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Expiring Lots (FEFO)</CardTitle>
          <p className="text-sm text-muted-foreground">Lots reaching expiry — pick these first (first-expiry-first-out).</p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Within days</Label>
          <Input type="number" className="w-20 h-8" value={days} onChange={e => setDays(Number(e.target.value))} />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Lot #</TableHead>
              <TableHead>Expiry Date</TableHead>
              <TableHead className="text-right">Days Left</TableHead>
              <TableHead className="text-right">On Hand</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : lots.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No lots expiring within {days} days.</TableCell></TableRow>
            ) : lots.map(l => (
              <TableRow key={l.lot_id}>
                <TableCell className="font-medium">{l.product_name}</TableCell>
                <TableCell className="font-mono text-xs">{l.lot_number}</TableCell>
                <TableCell>{l.expiry_date}</TableCell>
                <TableCell className="text-right">
                  <Badge variant={l.days_until_expiry < 0 ? 'destructive' : l.days_until_expiry <= 7 ? 'destructive' : l.days_until_expiry <= 30 ? 'secondary' : 'outline'}>
                    {l.days_until_expiry < 0 ? 'Expired' : `${l.days_until_expiry}d`}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{l.on_hand_qty}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ============================================================
// ABC Analysis
// ============================================================
export function AbcAnalysisPanel() {
  const [days, setDays] = useState(90);
  const { data: rows = [], isLoading } = useAbcAnalysis(days);

  const counts = { A: 0, B: 0, C: 0, slow: 0 };
  rows.forEach(r => { counts[r.abc_class]++; if (r.is_slow_mover) counts.slow++; });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">ABC / Slow-Moving Analysis</CardTitle>
          <p className="text-sm text-muted-foreground">Classifies products by value-velocity. A = top 80% of value, B = next 15%, C = bottom 5%.</p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Days</Label>
          <Input type="number" className="w-20 h-8" value={days} onChange={e => setDays(Number(e.target.value))} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-lg border p-3 text-center"><p className="text-2xl font-bold">{counts.A}</p><p className="text-xs text-muted-foreground">A</p></div>
          <div className="rounded-lg border p-3 text-center"><p className="text-2xl font-bold">{counts.B}</p><p className="text-xs text-muted-foreground">B</p></div>
          <div className="rounded-lg border p-3 text-center"><p className="text-2xl font-bold">{counts.C}</p><p className="text-xs text-muted-foreground">C</p></div>
          <div className="rounded-lg border p-3 text-center"><p className="text-2xl font-bold">{counts.slow}</p><p className="text-xs text-muted-foreground">Slow / No Movement</p></div>
        </div>
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Class</TableHead>
                <TableHead className="text-right">Units Out</TableHead>
                <TableHead className="text-right">Value (out)</TableHead>
                <TableHead>Flag</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : rows.slice(0, 100).map(r => (
                <TableRow key={r.product_id}>
                  <TableCell className="font-medium">{r.product_name}</TableCell>
                  <TableCell>
                    <Badge variant={r.abc_class === 'A' ? 'default' : r.abc_class === 'B' ? 'secondary' : 'outline'}>{r.abc_class}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.units_out).toFixed(0)}</TableCell>
                  <TableCell className="text-right tabular-nums">{(Number(r.value_out_cents) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</TableCell>
                  <TableCell>{r.is_slow_mover && <Badge variant="destructive">Slow</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
