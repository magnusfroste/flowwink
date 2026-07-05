import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ClipboardCheck, Plus, CheckCircle2, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStockLocations } from '@/hooks/useInventoryV2';
import { useProducts } from '@/hooks/useProducts';
import {
  useInventoryCounts,
  useInventoryCount,
  useCreateInventoryCount,
  useAddCountLine,
  useSetCountLine,
  usePostInventoryCount,
} from '@/hooks/useInventoryCounts';

function StatusBadge({ status }: { status: string }) {
  if (status === 'posted') {
    return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 capitalize">Posted</Badge>;
  }
  if (status === 'cancelled') return <Badge variant="outline" className="capitalize">Cancelled</Badge>;
  return <Badge variant="secondary" className="capitalize">Draft</Badge>;
}

function NewCountDialog({ open, onOpenChange, onCreated }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const { data: locations = [] } = useStockLocations();
  const create = useCreateInventoryCount();
  const [locationId, setLocationId] = useState('');
  const [notes, setNotes] = useState('');

  async function submit() {
    if (!locationId) return;
    const res = await create.mutateAsync({ location_id: locationId, notes: notes || undefined });
    onCreated(res.count_id);
    setLocationId('');
    setNotes('');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" /> New cycle count
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium mb-1 block">Location</label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.code} — {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Notes (optional)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason, shift, etc." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!locationId || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CountDetail({ countId, onClose }: { countId: string; onClose: () => void }) {
  const { data, isLoading } = useInventoryCount(countId);
  const { data: locations = [] } = useStockLocations();
  const { data: products = [] } = useProducts();
  const addLine = useAddCountLine();
  const setLine = useSetCountLine();
  const postCount = usePostInventoryCount();

  const [productId, setProductId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const location = useMemo(
    () => locations.find((l) => l.id === data?.count.location_id),
    [locations, data],
  );
  const isDraft = data?.count.status === 'draft';

  async function handleAddLine() {
    if (!productId) return;
    await addLine.mutateAsync({ count_id: countId, product_id: productId });
    setProductId('');
  }

  async function commitDraft(lineId: string) {
    const raw = drafts[lineId];
    if (raw === undefined || raw === '') return;
    const qty = Number(raw);
    if (!Number.isFinite(qty)) return;
    await setLine.mutateAsync({ count_id: countId, line_id: lineId, counted_qty: qty });
    setDrafts((p) => {
      const next = { ...p };
      delete next[lineId];
      return next;
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Cycle count
            {data && <StatusBadge status={data.count.status} />}
          </DialogTitle>
        </DialogHeader>

        {isLoading || !data ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Location: <span className="text-foreground font-medium">{location ? `${location.code} — ${location.name}` : data.count.location_id}</span>
              {data.count.notes && <> · {data.count.notes}</>}
            </div>

            {isDraft && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Add product line</CardTitle></CardHeader>
                <CardContent className="flex flex-col sm:flex-row gap-2">
                  <Select value={productId} onValueChange={setProductId}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Select product" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleAddLine} disabled={!productId || addLine.isPending}>
                    <Plus className="h-4 w-4 mr-1" /> Snapshot & add
                  </Button>
                </CardContent>
              </Card>
            )}

            {data.lines.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">
                {isDraft ? 'No lines yet — add products to snapshot their system quantity.' : 'No lines were recorded.'}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">System qty</TableHead>
                    <TableHead className="w-32">Counted</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.lines.map((l) => {
                    const product = products.find((p) => p.id === l.product_id);
                    const draftVal = drafts[l.id];
                    const displayCounted = draftVal ?? String(l.counted_qty);
                    const effective = Number(displayCounted);
                    const variance = Number.isFinite(effective) ? effective - Number(l.system_qty) : Number(l.variance);
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">{product?.name ?? l.product_id.slice(0, 8)}</TableCell>
                        <TableCell className="text-right">{Number(l.system_qty)}</TableCell>
                        <TableCell>
                          {isDraft ? (
                            <Input
                              type="number"
                              value={displayCounted}
                              onChange={(e) => setDrafts((p) => ({ ...p, [l.id]: e.target.value }))}
                              onBlur={() => commitDraft(l.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                              }}
                            />
                          ) : (
                            <span>{Number(l.counted_qty)}</span>
                          )}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-semibold',
                            variance > 0 && 'text-emerald-600',
                            variance < 0 && 'text-destructive',
                          )}
                        >
                          {variance > 0 ? `+${variance}` : variance}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            {!isDraft && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground border border-border rounded-md p-3 bg-muted/40">
                <Lock className="h-4 w-4" />
                This count is {data.count.status}. Variance was applied to stock via cycle_count adjustments.
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {isDraft && (
            <Button
              onClick={() => postCount.mutate({ count_id: countId })}
              disabled={postCount.isPending || !data || data.lines.length === 0}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              {postCount.isPending ? 'Posting…' : 'Post count'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CycleCountPanel() {
  const { data: counts = [], isLoading } = useInventoryCounts();
  const { data: locations = [] } = useStockLocations();
  const [newOpen, setNewOpen] = useState(false);
  const [openCountId, setOpenCountId] = useState<string | null>(null);

  const locationLabel = (id: string) => {
    const l = locations.find((x) => x.id === id);
    return l ? `${l.code} — ${l.name}` : id.slice(0, 8);
  };

  const draftCount = counts.filter((c) => c.status === 'draft').length;
  const postedCount = counts.filter((c) => c.status === 'posted').length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ClipboardCheck className="h-4 w-4" /> Open drafts</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{draftCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Posted</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{postedCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Total counts</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{counts.length}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Cycle counts</CardTitle>
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New count
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : counts.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              No cycle counts yet. Start one to reconcile physical stock against the system.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {counts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{new Date(c.created_at).toLocaleString()}</TableCell>
                    <TableCell>{locationLabel(c.location_id)}</TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                    <TableCell className="text-muted-foreground text-sm truncate max-w-xs">{c.notes ?? ''}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setOpenCountId(c.id)}>
                        {c.status === 'draft' ? 'Open' : 'View'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <NewCountDialog open={newOpen} onOpenChange={setNewOpen} onCreated={setOpenCountId} />
      {openCountId && <CountDetail countId={openCountId} onClose={() => setOpenCountId(null)} />}
    </div>
  );
}
