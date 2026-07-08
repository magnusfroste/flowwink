import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, ClipboardList, Rocket } from 'lucide-react';
import {
  useDealTemplates,
  useUpsertDealTemplate,
  useDeleteDealTemplate,
  useCreateDealFromTemplate,
  useDealTeams,
  type DealTemplate,
} from '@/hooks/useDealsParity';
import { useLeads } from '@/hooks/useLeads';
import { useProducts } from '@/hooks/useProducts';

/** Format money, tolerating a missing/invalid currency code (free-text input can
 *  hold '' or garbage). Intl.NumberFormat throws RangeError on a bad ISO code —
 *  fall back to SEK so the templates table never crashes. */
function fmtMoney(amount: number, currency?: string | null): string {
  const cur = /^[A-Za-z]{3}$/.test(currency ?? '') ? (currency as string).toUpperCase() : 'SEK';
  try {
    return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: cur }).format(amount);
  } catch {
    return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(amount);
  }
}

export function DealTemplatesPanel() {
  const { data: templates = [] } = useDealTemplates();
  const { data: teams = [] } = useDealTeams();
  const { data: products = [] } = useProducts();
  const { data: leads = [] } = useLeads();

  const upsert = useUpsertDealTemplate();
  const del = useDeleteDealTemplate();
  const spawn = useCreateDealFromTemplate();

  const [editing, setEditing] = useState<Partial<DealTemplate> | null>(null);
  const [spawnFor, setSpawnFor] = useState<DealTemplate | null>(null);
  const [spawnLeadId, setSpawnLeadId] = useState('');

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardList className="h-4 w-4" /> Deal templates
        </CardTitle>
        <Button size="sm" onClick={() => setEditing({ name: '', default_stage: 'proposal', default_currency: 'SEK', default_value_cents: 0, is_active: true })}>
          <Plus className="h-4 w-4 mr-1" /> New template
        </Button>
      </CardHeader>
      <CardContent>
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No templates yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Default value</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => {
                const product = products.find((p) => p.id === t.default_product_id);
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-sm">{t.default_stage || '—'}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {fmtMoney(t.default_value_cents / 100, t.default_currency)}
                    </TableCell>
                    <TableCell className="text-sm">{product?.name || '—'}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setSpawnFor(t); setSpawnLeadId(''); }}
                        >
                          <Rocket className="h-3.5 w-3.5 mr-1" /> Use
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditing(t)}>Edit</Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => del.mutate(t.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Editor dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit template' : 'New template'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Name</Label>
                <Input value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Input value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="h-9" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Default stage</Label>
                  <Select
                    value={editing.default_stage || 'proposal'}
                    onValueChange={(v) => setEditing({ ...editing, default_stage: v })}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="qualified">Qualified</SelectItem>
                      <SelectItem value="proposal">Proposal</SelectItem>
                      <SelectItem value="negotiation">Negotiation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Default currency</Label>
                  <Input
                    value={editing.default_currency || 'SEK'}
                    onChange={(e) => setEditing({ ...editing, default_currency: e.target.value.toUpperCase() })}
                    className="h-9 uppercase font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Default value</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={(editing.default_value_cents || 0) / 100}
                    onChange={(e) => setEditing({ ...editing, default_value_cents: Math.round(parseFloat(e.target.value || '0') * 100) })}
                    className="h-9 font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs">Default team</Label>
                  <Select
                    value={editing.default_team_id || 'none'}
                    onValueChange={(v) => setEditing({ ...editing, default_team_id: v === 'none' ? null : v })}
                  >
                    <SelectTrigger className="h-9"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Default product</Label>
                <Select
                  value={editing.default_product_id || 'none'}
                  onValueChange={(v) => setEditing({ ...editing, default_product_id: v === 'none' ? null : v })}
                >
                  <SelectTrigger className="h-9"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Default notes</Label>
                <Textarea
                  value={editing.default_notes || ''}
                  onChange={(e) => setEditing({ ...editing, default_notes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!editing?.name) return;
                await upsert.mutateAsync(editing as any);
                setEditing(null);
              }}
              disabled={!editing?.name || upsert.isPending}
            >Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Spawn dialog */}
      <Dialog open={!!spawnFor} onOpenChange={(o) => !o && setSpawnFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create deal from “{spawnFor?.name}”</DialogTitle>
            <DialogDescription>Pick a contact — the deal is created with the template's defaults.</DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">Contact</Label>
            <Select value={spawnLeadId} onValueChange={setSpawnLeadId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Pick a contact" /></SelectTrigger>
              <SelectContent>
                {leads.map((l: any) => (
                  <SelectItem key={l.id} value={l.id}>{l.name || l.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSpawnFor(null)}>Cancel</Button>
            <Button
              disabled={!spawnLeadId || !spawnFor || spawn.isPending}
              onClick={async () => {
                if (!spawnFor || !spawnLeadId) return;
                await spawn.mutateAsync({ template_id: spawnFor.id, lead_id: spawnLeadId });
                setSpawnFor(null);
              }}
            >
              {spawn.isPending ? 'Creating…' : 'Create deal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
