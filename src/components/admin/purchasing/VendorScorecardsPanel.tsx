import { useState } from 'react';
import { useVendorScorecards, useUpdateVendorRating, type VendorScorecardRow } from '@/hooks/useVendorScorecards';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Star } from 'lucide-react';

export function VendorScorecardsPanel() {
  const { data: rows = [], isLoading } = useVendorScorecards();
  const update = useUpdateVendorRating();
  const [editing, setEditing] = useState<VendorScorecardRow | null>(null);
  const [rating, setRating] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const openEdit = (row: VendorScorecardRow) => {
    setEditing(row);
    setRating(row.manual_rating != null ? String(row.manual_rating) : '');
    setNotes(row.rating_notes ?? '');
  };

  const pctColor = (pct: number | null, good: 'high' | 'low') => {
    if (pct == null) return 'text-muted-foreground';
    if (good === 'high') return pct >= 90 ? 'text-emerald-600' : pct >= 70 ? 'text-amber-600' : 'text-red-600';
    return pct <= 5 ? 'text-emerald-600' : pct <= 15 ? 'text-amber-600' : 'text-red-600';
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Vendors</div>
          <div className="text-2xl font-semibold">{rows.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Avg on-time %</div>
          <div className="text-2xl font-semibold">
            {(() => {
              const vals = rows.map(r => r.on_time_pct).filter((v): v is number => v != null);
              return vals.length ? `${(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)}%` : '—';
            })()}
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Vendors with variance</div>
          <div className="text-2xl font-semibold">{rows.filter(r => (r.variance_pct ?? 0) > 0).length}</div>
        </CardContent></Card>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead className="text-right">POs</TableHead>
              <TableHead className="text-right">On-time %</TableHead>
              <TableHead className="text-right">Variance %</TableHead>
              <TableHead className="text-right">Manual rating</TableHead>
              <TableHead className="text-right">Notes</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No vendors yet</TableCell></TableRow>
            ) : rows.map(r => (
              <TableRow key={r.vendor_id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-right font-mono">{r.po_count}</TableCell>
                <TableCell className={`text-right font-mono ${pctColor(r.on_time_pct, 'high')}`}>
                  {r.on_time_pct == null ? '—' : `${r.on_time_pct}%`}
                </TableCell>
                <TableCell className={`text-right font-mono ${pctColor(r.variance_pct, 'low')}`}>
                  {r.variance_pct == null ? '—' : `${r.variance_pct}%`}
                </TableCell>
                <TableCell className="text-right">
                  {r.manual_rating == null ? (
                    <span className="text-muted-foreground text-sm">—</span>
                  ) : (
                    <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{r.manual_rating}</span>
                  )}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground max-w-[220px] truncate">{r.rating_notes ?? '—'}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>Rate</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rate {editing?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Manual rating (0–5)</Label>
              <Input type="number" min={0} max={5} step={0.5} value={rating} onChange={(e) => setRating(e.target.value)} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              disabled={update.isPending}
              onClick={async () => {
                if (!editing) return;
                const parsed = rating === '' ? null : Number(rating);
                await update.mutateAsync({
                  vendor_id: editing.vendor_id,
                  manual_rating: parsed,
                  rating_notes: notes || null,
                });
                setEditing(null);
              }}
            >Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
