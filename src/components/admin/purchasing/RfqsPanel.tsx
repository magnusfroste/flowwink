import { useState } from 'react';
import { format } from 'date-fns';
import { Plus, FileText, Award, Trash2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useRfqs, useRfq, useCreateRfq, useUpdateRfqStatus, useSubmitBid, useAwardRfq, type RfqStatus } from '@/hooks/useRfqs';
import { useVendors } from '@/hooks/usePurchasing';

const statusVariant: Record<RfqStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'outline',
  sent: 'secondary',
  bidding: 'secondary',
  closed: 'default',
  awarded: 'default',
  cancelled: 'destructive',
};

export function RfqsPanel() {
  const { data: rfqs = [], isLoading } = useRfqs();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Requests for Quotation</CardTitle>
          <CardDescription>Solicit competitive bids from multiple vendors before issuing a PO</CardDescription>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" /> New RFQ
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rfqs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="mx-auto h-10 w-10 mb-2 opacity-50" />
            <p>No RFQs yet — create one to compare vendor offers</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rfqs.map(r => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelectedId(r.id)}>
                  <TableCell className="font-mono text-xs">{r.rfq_number}</TableCell>
                  <TableCell>{r.title}</TableCell>
                  <TableCell><Badge variant={statusVariant[r.status]}>{r.status}</Badge></TableCell>
                  <TableCell>{r.response_deadline ? format(new Date(r.response_deadline), 'PP') : '—'}</TableCell>
                  <TableCell>{format(new Date(r.issue_date), 'PP')}</TableCell>
                  <TableCell><Button size="sm" variant="ghost">Open</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <CreateRfqDialog open={createOpen} onOpenChange={setCreateOpen} />
      <RfqDetailDialog rfqId={selectedId} onClose={() => setSelectedId(null)} />
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
function CreateRfqDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { vendors } = usePurchasing();
  const createRfq = useCreateRfq();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [lines, setLines] = useState([{ description: '', quantity: 1 }]);
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);

  const reset = () => {
    setTitle(''); setDescription(''); setDeadline('');
    setLines([{ description: '', quantity: 1 }]);
    setSelectedVendors([]);
  };

  const submit = async () => {
    if (!title.trim() || selectedVendors.length === 0 || lines.some(l => !l.description.trim())) return;
    await createRfq.mutateAsync({
      title,
      description: description || undefined,
      response_deadline: deadline || undefined,
      lines: lines.map(l => ({
        description: l.description,
        quantity: l.quantity,
        product_id: null,
        target_unit_price_cents: null,
        notes: null,
      })),
      vendor_ids: selectedVendors,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New Request for Quotation</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Q2 office supplies" />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} />
          </div>
          <div>
            <Label>Response deadline</Label>
            <Input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
          </div>

          <div>
            <Label>Items requested</Label>
            <div className="space-y-2 mt-1">
              {lines.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder="Description"
                    value={l.description}
                    onChange={e => setLines(prev => prev.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x))}
                    className="flex-1"
                  />
                  <Input
                    type="number" min={1} placeholder="Qty"
                    value={l.quantity}
                    onChange={e => setLines(prev => prev.map((x, idx) => idx === i ? { ...x, quantity: parseInt(e.target.value) || 1 } : x))}
                    className="w-24"
                  />
                  <Button variant="ghost" size="icon" onClick={() => setLines(prev => prev.filter((_, idx) => idx !== i))} disabled={lines.length === 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setLines(prev => [...prev, { description: '', quantity: 1 }])}>
                <Plus className="h-4 w-4 mr-1" /> Add item
              </Button>
            </div>
          </div>

          <div>
            <Label>Invite vendors</Label>
            <div className="border rounded-md mt-1 p-2 max-h-40 overflow-auto space-y-1">
              {(vendors ?? []).filter((v: any) => v.is_active).map((v: any) => (
                <label key={v.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1 rounded">
                  <Checkbox
                    checked={selectedVendors.includes(v.id)}
                    onCheckedChange={(checked) => {
                      setSelectedVendors(prev => checked ? [...prev, v.id] : prev.filter(x => x !== v.id));
                    }}
                  />
                  <span>{v.name}</span>
                  {v.email && <span className="text-muted-foreground text-xs">({v.email})</span>}
                </label>
              ))}
              {(vendors ?? []).length === 0 && <p className="text-xs text-muted-foreground">No vendors — create one in Vendor Sourcing first.</p>}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={createRfq.isPending || !title.trim() || selectedVendors.length === 0}>
            Create RFQ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
function RfqDetailDialog({ rfqId, onClose }: { rfqId: string | null; onClose: () => void }) {
  const { data, isLoading } = useRfq(rfqId);
  const updateStatus = useUpdateRfqStatus();
  const award = useAwardRfq();
  const submitBid = useSubmitBid();
  const [bidEditor, setBidEditor] = useState<string | null>(null);

  if (!rfqId) return null;

  const fmtMoney = (cents: number, ccy = 'SEK') =>
    new Intl.NumberFormat('sv-SE', { style: 'currency', currency: ccy }).format((cents || 0) / 100);

  return (
    <Dialog open={!!rfqId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        {isLoading || !data ? <p>Loading…</p> : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <span className="font-mono text-sm">{data.rfq.rfq_number}</span>
                <span>{data.rfq.title}</span>
                <Badge variant={statusVariant[data.rfq.status]}>{data.rfq.status}</Badge>
              </DialogTitle>
            </DialogHeader>

            {data.rfq.description && <p className="text-sm text-muted-foreground">{data.rfq.description}</p>}

            <div className="flex gap-2 text-xs text-muted-foreground">
              <span>Issued {format(new Date(data.rfq.issue_date), 'PP')}</span>
              {data.rfq.response_deadline && <span>· Deadline {format(new Date(data.rfq.response_deadline), 'PP')}</span>}
              <span>· {data.rfq.currency}</span>
            </div>

            <section>
              <h4 className="font-medium text-sm mb-2">Items requested</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-24 text-right">Quantity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.lines.map(l => (
                    <TableRow key={l.id}>
                      <TableCell>{l.description}</TableCell>
                      <TableCell className="text-right">{l.quantity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>

            <section>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-sm">Vendor bids ({data.bids.length})</h4>
                {data.rfq.status === 'draft' && (
                  <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: data.rfq.id, status: 'sent' })}>
                    <Send className="h-3 w-3 mr-1" /> Mark as sent
                  </Button>
                )}
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Lead time</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.bids.map(b => {
                    // Compute total from line offers × quantities
                    const total = (b.line_offers ?? []).reduce((sum, o) => {
                      const line = data.lines.find(l => l.id === o.rfq_line_id);
                      return sum + (o.unit_price_cents || 0) * (line?.quantity ?? 0);
                    }, 0);
                    return (
                      <TableRow key={b.id}>
                        <TableCell>{(b as any).vendors?.name ?? b.vendor_id.slice(0, 8)}</TableCell>
                        <TableCell><Badge variant="outline">{b.status}</Badge></TableCell>
                        <TableCell className="text-right font-mono">
                          {b.status === 'submitted' || b.status === 'awarded' ? fmtMoney(total, data.rfq.currency) : '—'}
                        </TableCell>
                        <TableCell>{b.lead_time_days ? `${b.lead_time_days} days` : '—'}</TableCell>
                        <TableCell className="space-x-1">
                          {b.status === 'pending' && (
                            <Button size="sm" variant="outline" onClick={() => setBidEditor(b.id)}>Enter bid</Button>
                          )}
                          {b.status === 'submitted' && data.rfq.status !== 'awarded' && (
                            <Button size="sm" onClick={() => award.mutate({ rfq_id: data.rfq.id, bid_id: b.id })}>
                              <Award className="h-3 w-3 mr-1" /> Award
                            </Button>
                          )}
                          {b.status === 'awarded' && <Badge>Winner</Badge>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </section>

            <BidEditorDialog
              bid={data.bids.find(b => b.id === bidEditor) ?? null}
              lines={data.lines}
              currency={data.rfq.currency}
              onClose={() => setBidEditor(null)}
              onSubmit={async (offers, meta) => {
                await submitBid.mutateAsync({ bid_id: bidEditor!, rfq_id: data.rfq.id, line_offers: offers, ...meta });
                setBidEditor(null);
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
function BidEditorDialog({ bid, lines, currency, onClose, onSubmit }: {
  bid: any | null;
  lines: { id: string; description: string; quantity: number }[];
  currency: string;
  onClose: () => void;
  onSubmit: (offers: { rfq_line_id: string; unit_price_cents: number }[], meta: { lead_time_days?: number; payment_terms?: string; notes?: string }) => Promise<void>;
}) {
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [leadTime, setLeadTime] = useState<string>('');
  const [terms, setTerms] = useState('');
  const [notes, setNotes] = useState('');

  if (!bid) return null;

  const submit = async () => {
    const offers = lines.map(l => ({
      rfq_line_id: l.id,
      unit_price_cents: Math.round(parseFloat(prices[l.id] || '0') * 100),
    }));
    await onSubmit(offers, {
      lead_time_days: leadTime ? parseInt(leadTime) : undefined,
      payment_terms: terms || undefined,
      notes: notes || undefined,
    });
    setPrices({}); setLeadTime(''); setTerms(''); setNotes('');
  };

  return (
    <Dialog open={!!bid} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Enter bid for {bid.vendors?.name ?? 'vendor'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {lines.map(l => (
            <div key={l.id} className="flex items-center gap-2">
              <div className="flex-1 text-sm">{l.description} <span className="text-muted-foreground">× {l.quantity}</span></div>
              <Input
                type="number" step="0.01"
                placeholder={`Unit price ${currency}`}
                value={prices[l.id] ?? ''}
                onChange={e => setPrices(p => ({ ...p, [l.id]: e.target.value }))}
                className="w-36"
              />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <Label>Lead time (days)</Label>
              <Input type="number" value={leadTime} onChange={e => setLeadTime(e.target.value)} />
            </div>
            <div>
              <Label>Payment terms</Label>
              <Input value={terms} onChange={e => setTerms(e.target.value)} placeholder="net30" />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Submit bid</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
