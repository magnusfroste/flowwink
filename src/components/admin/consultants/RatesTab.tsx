import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2 } from 'lucide-react';
import { useRateMatrix, useRateMutation, type RateMatrixRow } from '@/hooks/useConsultantOps';
import { logger } from '@/lib/logger';

const LEVELS = ['junior', 'mid', 'senior', 'expert'] as const;

const fmt = (cents: number | null | undefined, cur?: string | null) =>
  cents == null ? '—' : `${(cents / 100).toFixed(0)} ${cur ?? ''}`;

export function RatesTab() {
  const { data: matrix, isLoading } = useRateMatrix();
  const mut = useRateMutation();
  const [editing, setEditing] = useState<{
    consultant_id: string; consultant_name: string;
    skill?: string; level?: string; hourly_rate_cents?: number; currency?: string;
  } | null>(null);

  const skills = useMemo(() => {
    const s = new Set<string>();
    (matrix ?? []).forEach((r) => (r.rates ?? []).forEach((rt) => s.add(rt.skill)));
    return Array.from(s).sort();
  }, [matrix]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Rate matrix</CardTitle>
        <div className="text-xs text-muted-foreground">Click a cell to edit</div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
        ) : !matrix || matrix.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No consultants.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Consultant</TableHead>
                  <TableHead className="text-right">Default</TableHead>
                  {skills.map((s) => <TableHead key={s} className="text-right">{s}</TableHead>)}
                  <TableHead className="text-right">Add</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matrix.map((r: RateMatrixRow) => (
                  <TableRow key={r.consultant_id}>
                    <TableCell className="font-medium">{r.consultant_name}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {fmt(r.default_hourly_rate_cents)}
                    </TableCell>
                    {skills.map((sk) => {
                      const rate = (r.rates ?? []).find((x) => x.skill === sk);
                      return (
                        <TableCell key={sk} className="text-right font-mono text-xs">
                          <button className="hover:underline"
                            onClick={() => setEditing({
                              consultant_id: r.consultant_id, consultant_name: r.consultant_name,
                              skill: sk, level: rate?.level ?? 'mid',
                              hourly_rate_cents: rate?.hourly_rate_cents ?? 0,
                              currency: rate?.currency ?? 'SEK',
                            })}
                          >
                            {rate ? fmt(rate.hourly_rate_cents, rate.currency) : '+'}
                          </button>
                          {rate && (
                            <Button size="icon" variant="ghost" className="h-5 w-5 ml-1"
                              onClick={() => mut.mutate({
                                action: 'delete',
                                consultant_id: r.consultant_id, skill: sk,
                              })}
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost"
                        onClick={() => setEditing({
                          consultant_id: r.consultant_id, consultant_name: r.consultant_name,
                          skill: '', level: 'mid', hourly_rate_cents: 0, currency: 'SEK',
                        })}
                      ><Plus className="h-3 w-3" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rate — {editing?.consultant_name}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Skill</Label><Input value={editing.skill ?? ''}
                onChange={(e) => setEditing({ ...editing, skill: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Level</Label>
                  <Select value={editing.level ?? 'mid'} onValueChange={(v) => setEditing({ ...editing, level: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Currency</Label>
                  <Select value={editing.currency ?? 'SEK'} onValueChange={(v) => setEditing({ ...editing, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['SEK', 'EUR', 'USD', 'NOK'].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Hourly rate (öre)</Label>
                <Input type="number" value={editing.hourly_rate_cents ?? 0}
                  onChange={(e) => setEditing({ ...editing, hourly_rate_cents: Number(e.target.value) })} />
                <div className="text-xs text-muted-foreground mt-1">
                  = {((editing.hourly_rate_cents ?? 0) / 100).toFixed(2)} {editing.currency}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              disabled={!editing?.skill || mut.isPending}
              onClick={async () => {
                if (!editing) return;
                try {
                  await mut.mutateAsync({
                    action: 'set',
                    consultant_id: editing.consultant_id,
                    skill: editing.skill!,
                    level: editing.level as any,
                    hourly_rate_cents: editing.hourly_rate_cents ?? 0,
                    currency: editing.currency,
                  });
                  setEditing(null);
                } catch (e) { logger.error('rate save', e); }
              }}
            >Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
