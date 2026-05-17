import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Pencil, Plus, Trash2, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

type ContractType = 'service' | 'nda' | 'employment' | 'lease' | 'other';
type RenewalType = 'none' | 'auto' | 'manual';

interface ContractTemplate {
  id: string;
  name: string;
  description: string | null;
  contract_type: ContractType;
  language: string;
  body_markdown: string;
  default_currency: string;
  default_renewal_type: RenewalType;
  default_renewal_notice_days: number | null;
  default_value_cents: number | null;
  is_default: boolean;
  is_active: boolean;
  updated_at: string;
}

const EMPTY: Partial<ContractTemplate> = {
  name: '',
  description: '',
  contract_type: 'service',
  language: 'sv',
  body_markdown: '',
  default_currency: 'SEK',
  default_renewal_type: 'none',
  default_renewal_notice_days: 30,
  default_value_cents: 0,
  is_default: false,
  is_active: true,
};

export default function ContractTemplatesPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<ContractTemplate> | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['contract-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_templates')
        .select('*')
        .order('contract_type', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data as ContractTemplate[]) || [];
    },
  });

  const saveMut = useMutation({
    mutationFn: async (tpl: Partial<ContractTemplate>) => {
      const payload = {
        name: tpl.name,
        description: tpl.description || null,
        contract_type: tpl.contract_type,
        language: tpl.language,
        body_markdown: tpl.body_markdown,
        default_currency: tpl.default_currency,
        default_renewal_type: tpl.default_renewal_type,
        default_renewal_notice_days: tpl.default_renewal_notice_days,
        default_value_cents: tpl.default_value_cents,
        is_default: tpl.is_default,
        is_active: tpl.is_active,
      };
      if (tpl.id) {
        const { error } = await supabase.from('contract_templates').update(payload).eq('id', tpl.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('contract_templates').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Template saved');
      qc.invalidateQueries({ queryKey: ['contract-templates'] });
      setEditing(null);
    },
    onError: (err) => {
      logger.error('[contract-templates] save failed', err);
      toast.error(`Save failed: ${(err as Error).message}`);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('contract_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Template deleted');
      qc.invalidateQueries({ queryKey: ['contract-templates'] });
    },
    onError: (err) => toast.error(`Delete failed: ${(err as Error).message}`),
  });

  const grouped = templates.reduce<Record<string, ContractTemplate[]>>((acc, t) => {
    (acc[t.contract_type] ||= []).push(t);
    return acc;
  }, {});

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <AdminPageHeader
            title="Contract Templates"
            description="Reusable contract bodies with tokens. Agents render these via list_contract_templates + manage_contract template_id."
          />
          <Button onClick={() => setEditing({ ...EMPTY })}>
            <Plus className="h-4 w-4 mr-2" /> New template
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">How templates work</CardTitle>
            <CardDescription>
              Templates contain a markdown body with tokens: <code>{'{{counterparty.name}}'}</code>,{' '}
              <code>{'{{today}}'}</code>, <code>{'{{start_date}}'}</code>, <code>{'{{end_date}}'}</code>,{' '}
              <code>{'{{value}}'}</code>, <code>{'{{currency}}'}</code>, <code>{'{{title}}'}</code>. When a contract is
              created from a template the tokens are replaced and the body is stored on the contract.
            </CardDescription>
          </CardHeader>
        </Card>

        {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

        {Object.entries(grouped).map(([type, items]) => (
          <div key={type} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{type}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {items.map((t) => (
                <Card key={t.id} className={!t.is_active ? 'opacity-60' : ''}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <CardTitle className="text-base flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          {t.name}
                        </CardTitle>
                        <div className="flex gap-1.5">
                          <Badge variant="outline" className="text-xs">{t.language.toUpperCase()}</Badge>
                          {t.is_default && <Badge className="text-xs">Default</Badge>}
                          {!t.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setEditing(t)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => confirm(`Delete "${t.name}"?`) && deleteMut.mutate(t.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {t.description && (
                      <CardDescription className="text-xs">{t.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground space-y-1">
                    <div>{t.body_markdown.length} chars · {t.default_currency} · renewal: {t.default_renewal_type}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}

        {templates.length === 0 && !isLoading && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No templates yet. Create one to give agents a starting point.
            </CardContent>
          </Card>
        )}
      </div>

      {editing && (
        <TemplateDialog
          template={editing}
          onClose={() => setEditing(null)}
          onSave={(t) => saveMut.mutate(t)}
          saving={saveMut.isPending}
        />
      )}
    </AdminLayout>
  );
}

function TemplateDialog({
  template,
  onClose,
  onSave,
  saving,
}: {
  template: Partial<ContractTemplate>;
  onClose: () => void;
  onSave: (t: Partial<ContractTemplate>) => void;
  saving: boolean;
}) {
  const [t, setT] = useState(template);
  useEffect(() => setT(template), [template]);
  const set = <K extends keyof ContractTemplate>(k: K, v: ContractTemplate[K]) => setT((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.id ? 'Edit template' : 'New contract template'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input value={t.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="Mutual NDA (SV)" />
          </div>
          <div className="space-y-2">
            <Label>Language</Label>
            <Select value={t.language || 'sv'} onValueChange={(v) => set('language', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sv">Svenska (sv)</SelectItem>
                <SelectItem value="en">English (en)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Description</Label>
            <Input value={t.description || ''} onChange={(e) => set('description', e.target.value)} placeholder="When to use this template" />
          </div>

          <div className="space-y-2">
            <Label>Contract type</Label>
            <Select value={t.contract_type || 'service'} onValueChange={(v) => set('contract_type', v as ContractType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="service">Service</SelectItem>
                <SelectItem value="nda">NDA</SelectItem>
                <SelectItem value="employment">Employment</SelectItem>
                <SelectItem value="lease">Lease</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Default currency</Label>
            <Input value={t.default_currency || 'SEK'} onChange={(e) => set('default_currency', e.target.value.toUpperCase())} />
          </div>

          <div className="space-y-2">
            <Label>Renewal</Label>
            <Select value={t.default_renewal_type || 'none'} onValueChange={(v) => set('default_renewal_type', v as RenewalType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Notice days</Label>
            <Input
              type="number"
              value={t.default_renewal_notice_days ?? 30}
              onChange={(e) => set('default_renewal_notice_days', Number(e.target.value))}
            />
          </div>

          <div className="md:col-span-2 space-y-2">
            <Label>Body (Markdown, with tokens)</Label>
            <Textarea
              rows={18}
              value={t.body_markdown || ''}
              onChange={(e) => set('body_markdown', e.target.value)}
              className="font-mono text-xs"
              placeholder="# Agreement&#10;&#10;Between [You] and {{counterparty.name}}..."
            />
            <p className="text-xs text-muted-foreground">
              Tokens: <code>{'{{counterparty.name}}'}</code>, <code>{'{{counterparty.email}}'}</code>,{' '}
              <code>{'{{today}}'}</code>, <code>{'{{start_date}}'}</code>, <code>{'{{end_date}}'}</code>,{' '}
              <code>{'{{value}}'}</code>, <code>{'{{currency}}'}</code>, <code>{'{{title}}'}</code>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={!!t.is_default} onCheckedChange={(v) => set('is_default', v)} />
            <Label className="cursor-pointer">Default for type</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={t.is_active !== false} onCheckedChange={(v) => set('is_active', v)} />
            <Label className="cursor-pointer">Active</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onSave(t)}
            disabled={saving || !t.name || !t.body_markdown || t.body_markdown.length < 50}
          >
            {saving ? 'Saving…' : 'Save template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
