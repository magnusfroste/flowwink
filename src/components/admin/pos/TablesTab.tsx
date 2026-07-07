import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Users, Trash2 } from 'lucide-react';
import { usePosTables, usePosTableMutation, type PosTable } from '@/hooks/usePosTables';
import { logger } from '@/lib/logger';

function statusColor(s: string) {
  if (s === 'occupied') return 'bg-red-500';
  if (s === 'reserved') return 'bg-amber-500';
  return 'bg-green-500';
}

interface Props {
  registerId?: string;
  currentSaleId?: string | null;
}

export function TablesTab({ registerId, currentSaleId }: Props) {
  const { data: tables, isLoading } = usePosTables();
  const mut = usePosTableMutation();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', area: '', seats: '4' });

  async function submitCreate() {
    try {
      await mut.mutateAsync({
        action: 'create',
        name: form.name,
        area: form.area || undefined,
        seats: Number(form.seats) || undefined,
        register_id: registerId,
      });
      setAddOpen(false);
      setForm({ name: '', area: '', seats: '4' });
    } catch (e) { logger.error('create table', e); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Tables</CardTitle>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add table
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : !tables || tables.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No tables yet.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {tables.map((t: PosTable) => (
                <div key={t.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{t.name}</div>
                      {t.area && <div className="text-xs text-muted-foreground">{t.area}</div>}
                    </div>
                    <span className={`h-3 w-3 rounded-full ${statusColor(t.status)}`} />
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" /> {t.seats ?? '—'} seats
                    <Badge variant="outline" className="ml-auto capitalize">{t.status}</Badge>
                  </div>
                  {t.current_sale_id && (
                    <div className="text-[10px] font-mono text-muted-foreground truncate">
                      sale {t.current_sale_id.slice(0, 8)}
                    </div>
                  )}
                  <div className="flex gap-1 pt-1">
                    {t.status !== 'occupied' ? (
                      <Button size="sm" variant="outline" className="flex-1"
                        onClick={() => mut.mutate({
                          action: 'seat', table_id: t.id,
                          sale_id: currentSaleId ?? undefined,
                        })}
                      >Seat</Button>
                    ) : (
                      <Button size="sm" variant="outline" className="flex-1"
                        onClick={() => mut.mutate({ action: 'release', table_id: t.id })}
                      >Release</Button>
                    )}
                    <Button size="icon" variant="ghost"
                      onClick={() => mut.mutate({ action: 'delete', table_id: t.id })}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add table</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Table 5" /></div>
            <div><Label>Area (optional)</Label><Input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="Terrace" /></div>
            <div><Label>Seats</Label><Input type="number" value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={submitCreate} disabled={!form.name || mut.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
