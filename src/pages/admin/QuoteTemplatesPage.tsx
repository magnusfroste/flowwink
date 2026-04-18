import { useState } from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useQuoteTemplates, useUpsertQuoteTemplate, useDeleteQuoteTemplate, type QuoteTemplate, type QuoteTemplateItem } from '@/hooks/useQuoteTemplates';

export default function QuoteTemplatesPage() {
  const { data: templates = [], isLoading } = useQuoteTemplates();
  const upsert = useUpsertQuoteTemplate();
  const remove = useDeleteQuoteTemplate();

  const [editing, setEditing] = useState<Partial<QuoteTemplate> | null>(null);

  const open = (t: Partial<QuoteTemplate> | null) => setEditing(t ?? { name: '', currency: 'SEK', items: [], default_valid_days: 30, is_active: true });

  const updateItem = (i: number, field: keyof QuoteTemplateItem, value: string | number) => {
    if (!editing) return;
    const items = [...(editing.items || [])];
    items[i] = { ...items[i], [field]: value } as QuoteTemplateItem;
    setEditing({ ...editing, items });
  };

  return (
    <AdminLayout>
      <AdminPageHeader title="Quote Templates" description="Reusable line item bundles and terms text">
        <Button size="sm" onClick={() => open(null)}>
          <Plus className="h-4 w-4 mr-1" /> New Template
        </Button>
      </AdminPageHeader>
      <AdminPageContainer>
        {isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : templates.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No templates yet</CardContent></Card>
        ) : (
          <div className="grid gap-3">
            {templates.map((t) => (
              <Card key={t.id}>
                <CardContent className="py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">{t.name}</p>
                    {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      {(t.items || []).length} items · {t.currency} · valid {t.default_valid_days} days
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => open(t)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => confirm('Delete template?') && remove.mutate(t.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing?.id ? 'Edit Template' : 'New Template'}</DialogTitle></DialogHeader>
            {editing && (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Currency</Label>
                    <Input value={editing.currency || 'SEK'} onChange={(e) => setEditing({ ...editing, currency: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Description</Label>
                  <Input value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Intro text</Label>
                  <Textarea value={editing.intro_text || ''} onChange={(e) => setEditing({ ...editing, intro_text: e.target.value })} rows={2} />
                </div>
                <div className="space-y-1">
                  <Label>Terms text</Label>
                  <Textarea value={editing.terms_text || ''} onChange={(e) => setEditing({ ...editing, terms_text: e.target.value })} rows={3} />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Line items</Label>
                    <Button size="sm" variant="outline" onClick={() => setEditing({ ...editing, items: [...(editing.items || []), { description: '', qty: 1, unit_price_cents: 0 }] })}>
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  </div>
                  {(editing.items || []).map((it, i) => (
                    <div key={i} className="flex gap-2">
                      <Input placeholder="Description" value={it.description} onChange={(e) => updateItem(i, 'description', e.target.value)} className="flex-1" />
                      <Input type="number" placeholder="Qty" value={it.qty} onChange={(e) => updateItem(i, 'qty', parseFloat(e.target.value) || 0)} className="w-20" />
                      <Input type="number" placeholder="Price (öre)" value={it.unit_price_cents} onChange={(e) => updateItem(i, 'unit_price_cents', parseInt(e.target.value) || 0)} className="w-28" />
                      <Button variant="ghost" size="icon" onClick={() => setEditing({ ...editing, items: (editing.items || []).filter((_, idx) => idx !== i) })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={() => editing && upsert.mutate(editing as QuoteTemplate, { onSuccess: () => setEditing(null) })} disabled={upsert.isPending}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AdminPageContainer>
    </AdminLayout>
  );
}
