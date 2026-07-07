import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Pencil } from 'lucide-react';
import {
  useServicePackages, useServicePackageMutation,
  type ServicePackage, type PackageLine,
} from '@/hooks/useFieldServiceRpc';
import { logger } from '@/lib/logger';

const KINDS: PackageLine['kind'][] = ['labor', 'material', 'expense', 'other'];

export function PackagesTab() {
  const { data: packages, isLoading } = useServicePackages();
  const mut = useServicePackageMutation();
  const [editing, setEditing] = useState<ServicePackage | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Service packages</CardTitle>
          <Button size="sm" onClick={() => setNewOpen(true)}><Plus className="h-4 w-4 mr-1" /> New package</Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : !packages || packages.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No packages yet — create a reusable job template.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Lines</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packages.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                      {p.description && <div className="text-xs text-muted-foreground">{p.description}</div>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{(p.lines ?? []).length}</TableCell>
                    <TableCell>
                      <Badge variant={p.active ? 'default' : 'outline'}>{p.active ? 'Active' : 'Inactive'}</Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(p)}><Pencil className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" className="text-destructive"
                        onClick={() => mut.mutate({ action: 'delete', package_id: p.id })}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PackageDialog
        open={newOpen || !!editing}
        pkg={editing}
        onClose={() => { setEditing(null); setNewOpen(false); }}
      />
    </div>
  );
}

function PackageDialog({ open, pkg, onClose }: { open: boolean; pkg: ServicePackage | null; onClose: () => void }) {
  const mut = useServicePackageMutation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [lines, setLines] = useState<PackageLine[]>([]);

  useEffect(() => {
    if (pkg) {
      setName(pkg.name);
      setDescription(pkg.description ?? '');
      setActive(pkg.active);
      setLines((pkg.lines ?? []).map((l) => ({ ...l })));
    } else if (!open) {
      setName(''); setDescription(''); setActive(true); setLines([]);
    }
  }, [pkg?.id, open]);


  function addLine() {
    setLines([...lines, { kind: 'labor', description: '', quantity: 1, unit_price: 0 }]);
  }
  function updateLine(i: number, patch: Partial<PackageLine>) {
    setLines(lines.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  }
  function removeLine(i: number) {
    setLines(lines.filter((_, idx) => idx !== i));
  }

  async function save() {
    try {
      await mut.mutateAsync({
        action: pkg ? 'update' : 'create',
        package_id: pkg?.id,
        name, description: description || undefined, active, lines,
      });
      onClose();
      setName(''); setDescription(''); setActive(true); setLines([]);
    } catch (e) { logger.error('save pkg', e); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{pkg ? 'Edit package' : 'New package'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Description</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="flex items-center justify-between">
            <Label>Lines</Label>
            <Button size="sm" variant="outline" onClick={addLine}><Plus className="h-3 w-3 mr-1" /> Add line</Button>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end border rounded p-2">
                <div className="col-span-2">
                  <Label className="text-xs">Kind</Label>
                  <Select value={l.kind} onValueChange={(v) => updateLine(i, { kind: v as any })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>{KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="col-span-5">
                  <Label className="text-xs">Description</Label>
                  <Input className="h-8" value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Qty</Label>
                  <Input className="h-8" type="number" step="0.01" value={l.quantity}
                    onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Unit price</Label>
                  <Input className="h-8" type="number" step="0.01" value={l.unit_price}
                    onChange={(e) => updateLine(i, { unit_price: Number(e.target.value) })} />
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button size="icon" variant="ghost" onClick={() => removeLine(i)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
            {lines.length === 0 && <div className="text-xs text-muted-foreground text-center py-4">No lines.</div>}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!name || mut.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
