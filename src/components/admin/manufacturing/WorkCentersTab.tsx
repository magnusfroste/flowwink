import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkCenters, useManageWorkCenter, type WorkCenter } from '@/hooks/useManufacturing';
import { logger } from '@/lib/logger';

function fmtMoney(cents: number) {
  return `${(cents / 100).toFixed(2)}`;
}

interface FormState {
  code: string;
  name: string;
  costPerHour: string; // major units
  capacityPerHour: string;
}

const empty: FormState = { code: '', name: '', costPerHour: '0', capacityPerHour: '1' };

export function WorkCentersTab() {
  const { data, isLoading } = useWorkCenters();
  const manage = useManageWorkCenter();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WorkCenter | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [deleteTarget, setDeleteTarget] = useState<WorkCenter | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(empty);
    setDialogOpen(true);
  }

  function openEdit(wc: WorkCenter) {
    setEditing(wc);
    setForm({
      code: wc.code,
      name: wc.name,
      costPerHour: (wc.cost_per_hour_cents / 100).toString(),
      capacityPerHour: String(wc.capacity_per_hour),
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    const cost_cents = Math.round(Number(form.costPerHour) * 100);
    const capacity = Number(form.capacityPerHour) || 1;
    try {
      if (editing) {
        await manage.mutateAsync({
          p_action: 'update',
          p_id: editing.id,
          p_code: form.code,
          p_name: form.name,
          p_cost_per_hour_cents: cost_cents,
          p_capacity_per_hour: capacity,
        });
      } else {
        await manage.mutateAsync({
          p_action: 'create',
          p_code: form.code,
          p_name: form.name,
          p_cost_per_hour_cents: cost_cents,
          p_capacity_per_hour: capacity,
        });
      }
      setDialogOpen(false);
    } catch (err) {
      logger.error('Work center save failed', err);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await manage.mutateAsync({ p_action: 'delete', p_id: deleteTarget.id });
      setDeleteTarget(null);
    } catch (err) {
      logger.error('Work center delete failed', err);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Physical or logical resources that execute routing operations.
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> New work center
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : !data || data.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No work centers yet. Add one to start scheduling routing operations.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Code</th>
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-right font-medium">Cost / hour</th>
                <th className="px-3 py-2 text-right font-medium">Capacity / hour</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.map((wc) => (
                <tr key={wc.id} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{wc.code}</td>
                  <td className="px-3 py-2">{wc.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(wc.cost_per_hour_cents)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{wc.capacity_per_hour}</td>
                  <td className="px-3 py-2">
                    <Badge variant={wc.is_active ? 'default' : 'secondary'}>
                      {wc.is_active ? 'active' : 'inactive'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(wc)} aria-label="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteTarget(wc)}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit work center' : 'New work center'}</DialogTitle>
            <DialogDescription>
              Cost per hour is entered in major currency units and stored in cents.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="wc-code">Code *</Label>
                <Input
                  id="wc-code"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="CUT, ASM…"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="wc-name">Name *</Label>
                <Input
                  id="wc-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Cutting station"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="wc-cost">Cost / hour</Label>
                <Input
                  id="wc-cost"
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.costPerHour}
                  onChange={(e) => setForm({ ...form, costPerHour: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="wc-cap">Capacity / hour</Label>
                <Input
                  id="wc-cap"
                  type="number"
                  step="any"
                  min={0}
                  value={form.capacityPerHour}
                  onChange={(e) => setForm({ ...form, capacityPerHour: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={manage.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={manage.isPending || !form.code.trim() || !form.name.trim()}
            >
              {manage.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete work center?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.code} — {deleteTarget?.name}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={manage.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={manage.isPending}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
