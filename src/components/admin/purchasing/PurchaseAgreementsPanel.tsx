import { useState } from 'react';
import { Plus, Handshake, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useVendors } from '@/hooks/usePurchasing';
import { useProducts } from '@/hooks/useProducts';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import {
  usePurchaseAgreements, usePurchaseAgreement, useCreatePurchaseAgreement,
  useAgreementTransition, useCallOffAgreement, type AgreementStatus, type NewAgreementLine,
} from '@/hooks/usePurchaseAgreements';

/**
 * Blanket purchase agreements: agreed quantity and price per line over a
 * period, called off as ordinary draft purchase orders. The remaining
 * quantity comes from the call-offs themselves (see the migration
 * ramavtalet-och-avropen) — this panel only renders what the RPC returns.
 */

const statusVariant: Record<AgreementStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'outline',
  active: 'default',
  closed: 'secondary',
  cancelled: 'destructive',
};

export function PurchaseAgreementsPanel() {
  const { data: agreements = [], isLoading } = usePurchaseAgreements();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const { formatDate } = usePlatformFormat();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Blanket Agreements</CardTitle>
          <CardDescription>Agreed quantities and prices with a vendor over a period — call goods off as purchase orders</CardDescription>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" /> New agreement
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : agreements.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Handshake className="mx-auto h-10 w-10 mb-2 opacity-50" />
            <p>No agreements yet — create one to lock a price for a quantity over a period</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="w-48">Called off</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agreements.map((a) => {
                const pct = a.agreed_quantity > 0 ? Math.round((a.called_quantity / a.agreed_quantity) * 100) : 0;
                return (
                  <TableRow key={a.id} className="cursor-pointer" onClick={() => setSelectedId(a.id)}>
                    <TableCell className="font-mono text-xs">{a.agreement_number}</TableCell>
                    <TableCell>{a.vendor_name ?? '—'}</TableCell>
                    <TableCell><Badge variant={statusVariant[a.status]}>{a.status}</Badge></TableCell>
                    <TableCell className="text-sm">{formatDate(a.start_date)} – {a.end_date ? formatDate(a.end_date) : 'open'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={pct} className="h-2" />
                        <span className="text-xs text-muted-foreground tabular-nums">{a.called_quantity}/{a.agreed_quantity}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <CreateAgreementDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={setSelectedId} />
      <AgreementDetailDialog id={selectedId} onClose={() => setSelectedId(null)} />
    </Card>
  );
}

const NO_PRODUCT = '__none__';

function CreateAgreementDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const { data: vendors = [] } = useVendors(true);
  const { data: products = [] } = useProducts({ activeOnly: true });
  const create = useCreatePurchaseAgreement();
  const [vendorId, setVendorId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [lines, setLines] = useState<Array<NewAgreementLine & { price: string }>>([{ quantity: 1, unit_price_cents: 0, price: '', description: '' }]);

  const setLine = (i: number, patch: Partial<NewAgreementLine & { price: string }>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const valid = vendorId && lines.length > 0 && lines.every((l) => l.quantity > 0 && l.price !== '' && (l.product_id || l.description?.trim()));

  const submit = async () => {
    const r = await create.mutateAsync({
      vendor_id: vendorId,
      start_date: start || undefined,
      end_date: end || undefined,
      lines: lines.map(({ price, ...l }) => ({ ...l, unit_price_cents: Math.round(Number(price.replace(',', '.')) * 100) })),
    });
    onOpenChange(false);
    setVendorId(''); setStart(''); setEnd('');
    setLines([{ quantity: 1, unit_price_cents: 0, price: '', description: '' }]);
    onCreated(r.agreement_id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New blanket agreement</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1 sm:col-span-3">
              <Label>Vendor</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger><SelectValue placeholder="Choose a vendor" /></SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Valid from</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Valid to</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Lines</Label>
            {lines.map((l, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem_7rem_auto] items-end">
                <Select
                  value={l.product_id ?? NO_PRODUCT}
                  onValueChange={(v) => setLine(i, { product_id: v === NO_PRODUCT ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Product" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PRODUCT}>No product</SelectItem>
                    {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input placeholder="Description" value={l.description ?? ''} onChange={(e) => setLine(i, { description: e.target.value })} />
                <Input type="number" min={1} aria-label="Agreed quantity" value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} />
                <Input inputMode="decimal" aria-label="Unit price" placeholder="Unit price" value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} />
                <Button variant="ghost" size="icon" aria-label="Remove line" disabled={lines.length === 1}
                  onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { quantity: 1, unit_price_cents: 0, price: '', description: '' }])}>
              <Plus className="h-4 w-4 mr-1" /> Add line
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!valid || create.isPending} onClick={submit}>Create draft</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AgreementDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data } = usePurchaseAgreement(id);
  const transition = useAgreementTransition();
  const callOff = useCallOffAgreement();
  const { formatCurrency, formatDate } = usePlatformFormat();
  const [qty, setQty] = useState<Record<string, string>>({});

  const a = data?.agreement;
  const requested = (data?.lines ?? [])
    .map((l) => ({ agreement_line_id: l.id, quantity: Number(qty[l.id] || 0) }))
    .filter((l) => l.quantity > 0);
  const overDrawn = (data?.lines ?? []).some((l) => Number(qty[l.id] || 0) > l.remaining_quantity);

  const doCallOff = async () => {
    if (!id) return;
    await callOff.mutateAsync({ id, lines: requested });
    setQty({});
  };

  return (
    <Dialog open={!!id} onOpenChange={(o) => { if (!o) { setQty({}); onClose(); } }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {a?.agreement_number ?? 'Agreement'}
            {a && <Badge variant={statusVariant[a.status]}>{a.status}</Badge>}
          </DialogTitle>
        </DialogHeader>
        {a && data && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {a.vendor_name} · {formatDate(a.start_date)} – {a.end_date ? formatDate(a.end_date) : 'open-ended'}
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Line</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Agreed</TableHead>
                  <TableHead className="text-right">Called</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Left</TableHead>
                  {a.status === 'active' && <TableHead className="w-24">Call off</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.description}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(l.unit_price_cents, a.currency)}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.agreed_quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.called_quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.received_quantity}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{l.remaining_quantity}</TableCell>
                    {a.status === 'active' && (
                      <TableCell>
                        <Input type="number" min={0} max={l.remaining_quantity} aria-label={`Call off ${l.description}`}
                          value={qty[l.id] ?? ''} disabled={l.remaining_quantity === 0}
                          onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value }))} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {overDrawn && <p className="text-sm text-destructive">A call-off cannot exceed what is left on the line.</p>}
            {data.call_offs.length > 0 && (
              <div className="space-y-1">
                <Label>Call-offs</Label>
                <ul className="text-sm space-y-0.5">
                  {data.call_offs.map((c) => (
                    <li key={c.id} className="flex gap-3">
                      <span className="font-mono text-xs">{c.po_number}</span>
                      <Badge variant="outline">{c.status}</Badge>
                      <span className="text-muted-foreground">{formatDate(c.order_date)}</span>
                      <span className="ml-auto tabular-nums">{formatCurrency(c.total_cents, a.currency)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <DialogFooter className="gap-2">
          {a?.status === 'draft' && (
            <>
              <Button variant="outline" onClick={() => id && transition.mutate({ id, action: 'cancel' })}>Cancel agreement</Button>
              <Button onClick={() => id && transition.mutate({ id, action: 'activate' })}>Activate</Button>
            </>
          )}
          {a?.status === 'active' && (
            <>
              <Button variant="outline" onClick={() => id && transition.mutate({ id, action: 'close' })}>Close agreement</Button>
              <Button disabled={requested.length === 0 || overDrawn || callOff.isPending} onClick={doCallOff}>Create call-off PO</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
