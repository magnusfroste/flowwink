import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  useVendorDisputes,
  useResolveDispute,
  useOpenDispute,
  useVendorCreditMemos,
  useIssueCreditMemo,
  useApplyCreditMemo,
  type DisputeStatus,
} from '@/hooks/useVendorDisputes';
import { useVendorInvoices } from '@/hooks/useVendorInvoices';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertTriangle, FileMinus, Plus, CheckCircle2 } from 'lucide-react';

const STATUS_COLOR: Record<DisputeStatus, string> = {
  open: 'bg-amber-100 text-amber-800',
  resolved: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-muted text-muted-foreground',
};

export function VendorDisputesPanel() {
  const [tab, setTab] = useState<'disputes' | 'credits'>('disputes');
  const [statusFilter, setStatusFilter] = useState<DisputeStatus | 'all'>('open');
  const { data: disputes = [], isLoading } = useVendorDisputes(statusFilter);
  const { data: credits = [] } = useVendorCreditMemos();
  const { data: invoices = [] } = useVendorInvoices({});
  const resolve = useResolveDispute();
  const openDispute = useOpenDispute();
  const issue = useIssueCreditMemo();
  const apply = useApplyCreditMemo();

  const [openNew, setOpenNew] = useState(false);
  const [newInvoice, setNewInvoice] = useState('');
  const [newReason, setNewReason] = useState('');
  const [newAmount, setNewAmount] = useState('');

  const [openCredit, setOpenCredit] = useState(false);
  const [creditFrom, setCreditFrom] = useState<any | null>(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditReason, setCreditReason] = useState('');

  const [resolving, setResolving] = useState<any | null>(null);
  const [resolution, setResolution] = useState('');

  const fmt = (cents: number | null | undefined, currency = 'SEK') =>
    cents == null ? '—' : new Intl.NumberFormat('sv-SE', { style: 'currency', currency }).format(cents / 100);

  const invoicesById = useMemo(() => Object.fromEntries(invoices.map(i => [i.id, i])), [invoices]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Open disputes</div>
          <div className="text-2xl font-semibold">{disputes.filter((d: any) => d.status === 'open').length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Credit memos issued</div>
          <div className="text-2xl font-semibold">{credits.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Applied credit (SEK)</div>
          <div className="text-2xl font-semibold">
            {fmt(credits.filter((c: any) => c.status === 'applied').reduce((s: number, c: any) => s + (c.amount_cents || 0), 0))}
          </div>
        </CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <TabsList>
            <TabsTrigger value="disputes"><AlertTriangle className="h-3.5 w-3.5 mr-1" /> Disputes</TabsTrigger>
            <TabsTrigger value="credits"><FileMinus className="h-3.5 w-3.5 mr-1" /> Credit memos</TabsTrigger>
          </TabsList>
          {tab === 'disputes' ? (
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Dialog open={openNew} onOpenChange={setOpenNew}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New dispute</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Open invoice dispute</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>Vendor invoice</Label>
                      <Select value={newInvoice} onValueChange={setNewInvoice}>
                        <SelectTrigger><SelectValue placeholder="Select invoice…" /></SelectTrigger>
                        <SelectContent>
                          {invoices.map(i => (
                            <SelectItem key={i.id} value={i.id}>
                              {i.invoice_number} — {i.vendors?.name ?? '—'} ({fmt(i.total_cents, i.currency)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Reason</Label>
                      <Textarea value={newReason} onChange={(e) => setNewReason(e.target.value)} rows={3} placeholder="Over-billed on line 2, wrong qty…" />
                    </div>
                    <div>
                      <Label>Disputed amount (optional)</Label>
                      <Input type="number" step={0.01} value={newAmount} onChange={(e) => setNewAmount(e.target.value)} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpenNew(false)}>Cancel</Button>
                    <Button
                      disabled={!newInvoice || !newReason.trim() || openDispute.isPending}
                      onClick={async () => {
                        await openDispute.mutateAsync({
                          vendor_invoice_id: newInvoice,
                          reason: newReason,
                          disputed_amount_cents: newAmount ? Math.round(parseFloat(newAmount) * 100) : undefined,
                        });
                        setOpenNew(false); setNewInvoice(''); setNewReason(''); setNewAmount('');
                      }}
                    >Open dispute</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          ) : (
            <Dialog open={openCredit} onOpenChange={setOpenCredit}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Issue credit memo</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Issue supplier credit memo</DialogTitle></DialogHeader>
                <p className="text-xs text-muted-foreground">
                  Reduces the payable (Leverantörsskulder 2440) for this vendor. Post the offsetting journal entry from the accounting module using the credit number as reference.
                </p>
                <div className="space-y-3">
                  <div>
                    <Label>From invoice</Label>
                    <Select
                      value={creditFrom?.id ?? ''}
                      onValueChange={(v) => {
                        const inv = invoicesById[v];
                        setCreditFrom(inv);
                        if (inv) setCreditAmount((inv.total_cents / 100).toString());
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Select invoice…" /></SelectTrigger>
                      <SelectContent>
                        {invoices.map(i => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.invoice_number} — {i.vendors?.name ?? '—'} ({fmt(i.total_cents, i.currency)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Amount ({creditFrom?.currency ?? 'SEK'})</Label>
                    <Input type="number" step={0.01} value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} />
                  </div>
                  <div>
                    <Label>Reason</Label>
                    <Textarea value={creditReason} onChange={(e) => setCreditReason(e.target.value)} rows={2} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpenCredit(false)}>Cancel</Button>
                  <Button
                    disabled={!creditFrom || !creditAmount || issue.isPending}
                    onClick={async () => {
                      if (!creditFrom) return;
                      await issue.mutateAsync({
                        vendor_id: creditFrom.vendor_id,
                        vendor_invoice_id: creditFrom.id,
                        amount_cents: Math.round(parseFloat(creditAmount) * 100),
                        currency: creditFrom.currency,
                        reason: creditReason || undefined,
                      });
                      setOpenCredit(false); setCreditFrom(null); setCreditAmount(''); setCreditReason('');
                    }}
                  >Issue</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <TabsContent value="disputes" className="mt-3">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Disputed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Opened</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : disputes.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No disputes</TableCell></TableRow>
                ) : disputes.map((d: any) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono">{d.vendor_invoices?.invoice_number ?? '—'}</TableCell>
                    <TableCell>{d.vendor_invoices?.vendors?.name ?? '—'}</TableCell>
                    <TableCell className="max-w-[280px] truncate">{d.reason}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(d.disputed_amount_cents, d.vendor_invoices?.currency)}</TableCell>
                    <TableCell><Badge className={STATUS_COLOR[d.status as DisputeStatus]}>{d.status}</Badge></TableCell>
                    <TableCell className="text-xs">{format(new Date(d.opened_at), 'yyyy-MM-dd')}</TableCell>
                    <TableCell className="text-right">
                      {d.status === 'open' && (
                        <Button size="sm" variant="ghost" onClick={() => { setResolving(d); setResolution(''); }}>Resolve</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="credits" className="mt-3">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Credit #</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {credits.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No credit memos</TableCell></TableRow>
                ) : credits.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono">{c.credit_number}</TableCell>
                    <TableCell>{c.vendors?.name ?? '—'}</TableCell>
                    <TableCell className="font-mono text-sm">{c.vendor_invoices?.invoice_number ?? '—'}</TableCell>
                    <TableCell className="text-xs">{c.credit_date}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(c.amount_cents, c.currency)}</TableCell>
                    <TableCell>
                      <Badge className={c.status === 'applied' ? 'bg-emerald-100 text-emerald-800' : c.status === 'cancelled' ? 'bg-muted text-muted-foreground' : 'bg-amber-100 text-amber-800'}>
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {c.status === 'issued' && (
                        <Button size="sm" variant="ghost" onClick={() => apply.mutate(c.id)}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Mark applied
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!resolving} onOpenChange={(o) => !o && setResolving(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resolve dispute</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Invoice {resolving?.vendor_invoices?.invoice_number} · {resolving?.vendor_invoices?.vendors?.name}
            </div>
            <div>
              <Label>Resolution notes</Label>
              <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolving(null)}>Cancel</Button>
            <Button
              disabled={!resolution.trim() || resolve.isPending}
              onClick={async () => {
                if (!resolving) return;
                await resolve.mutateAsync({ id: resolving.id, resolution });
                setResolving(null);
              }}
            >Resolve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
