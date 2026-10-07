import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { Pencil, Plus, Trash2, FileText, Languages, Copy, Loader2, Download, FileDown, FileUp, AlertTriangle, Search, Link2 } from 'lucide-react';
import {
  buildBundle, toTransferable, parseBundle, planImport, type ImportPlanItem,
} from '@/lib/contract-template-transfer';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { useAITextGeneration } from '@/hooks/useAITextGeneration';

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
  language: 'en',
  body_markdown: '',
  default_currency: 'EUR',
  default_renewal_type: 'none',
  default_renewal_notice_days: 30,
  default_value_cents: 0,
  is_default: false,
  is_active: true,
};

const TYPE_LABELS: Record<ContractType, string> = {
  service: 'Service',
  nda: 'NDA',
  employment: 'Employment',
  lease: 'Lease',
  other: 'Other',
};

export default function ContractTemplatesPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<ContractTemplate> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importPlan, setImportPlan] = useState<ImportPlanItem[] | null>(null);

  // Library controls — a growing agreement library is only "one system" if it
  // stays findable. Search covers the body too: operators look for a clause,
  // not just a filename.
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [langFilter, setLangFilter] = useState<string>('all');
  const [activeOnly, setActiveOnly] = useState(false);


  // Export: the operator's templates as a portable, readable file. Data
  // sovereignty is a promise, not a feature — a self-hosting customer can
  // take their agreement library with them, or seed a second instance.
  const exportAll = () => {
    const bundle = buildBundle(
      templates.map((t) => toTransferable(t as unknown as Record<string, unknown>)),
    );
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `contract-templates-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // same file can be re-picked after a fix
    if (!file) return;
    try {
      const bundle = parseBundle(await file.text());
      setImportPlan(planImport(bundle, templates.map((t) => t.name)));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const importMut = useMutation({
    mutationFn: async (items: ImportPlanItem[]) => {
      // Collisions are skipped, never overwritten: an existing template may be
      // a version-frozen reference from signed agreements.
      const rows = items
        .filter((i) => i.status === 'new')
        .map((i) => ({ ...i.template, is_default: false }));
      if (rows.length === 0) return 0;
      const { error } = await supabase.from('contract_templates').insert(rows as never);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (count) => {
      toast.success(`Imported ${count} template${count === 1 ? '' : 's'}`);
      qc.invalidateQueries({ queryKey: ['contract-templates'] });
      setImportPlan(null);
    },
    onError: (err) => toast.error(`Import failed: ${(err as Error).message}`),
  });
  // Read view: legal source text must have reading as the default posture —
  // the edit dialog's raw-markdown textarea is one stray keystroke from
  // changing agreement wording.
  const [reading, setReading] = useState<ContractTemplate | null>(null);

  // Läskopia: the customer's lawyers get THE TEMPLATE, stamped as such.
  // The print window copies the sheet's already-rendered HTML — one renderer,
  // zero chance the exported copy differs from what the screen shows.
  const printTemplate = (t: ContractTemplate) => {
    const body = document.querySelector('[data-template-body]')?.innerHTML ?? '';
    const w = window.open('', '_blank', 'noopener,width=800,height=1000');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8">
      <title>${t.name} — läskopia</title>
      <style>
        body { font-family: Georgia, 'Times New Roman', serif; max-width: 44rem; margin: 2rem auto; padding: 0 1.5rem; color: #111; line-height: 1.55; }
        .stamp { border: 2px solid #111; padding: .6rem 1rem; font-family: system-ui, sans-serif; font-size: .8rem; font-weight: 600; letter-spacing: .03em; margin-bottom: 2rem; }
        .meta { font-family: system-ui, sans-serif; font-size: .75rem; color: #555; margin-top: 2.5rem; border-top: 1px solid #ccc; padding-top: .75rem; }
        h1 { font-size: 1.5rem; } h2 { font-size: 1.2rem; margin-top: 1.8em; } h3 { font-size: 1.05rem; }
        table { border-collapse: collapse; width: 100%; font-size: .85em; }
        th, td { border: 1px solid #bbb; padding: .35rem .5rem; text-align: left; }
        blockquote { border-left: 3px solid #999; margin-left: 0; padding-left: 1rem; color: #444; }
        code { background: #eee; padding: 0 .25em; }
      </style></head><body>
      <div class="stamp">MALL / LÄSKOPIA — DETTA ÄR INTE ETT AVTAL<br>
        <span style="font-weight:400">Platshållare som {{…}} och [HAKPARENTESER] fylls i först när ett avtal upprättas ur mallen.</span>
      </div>
      ${body}
      <div class="meta">
        ${t.name} — senast uppdaterad ${new Date(t.updated_at).toLocaleDateString('sv-SE')} —
        läskopia renderad ${new Date().toLocaleString('sv-SE')} ur plattformens levande mall.
      </div>
      </body></html>`);
    w.document.close();
    w.onload = () => w.print();
  };

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

  // Usage: a template nobody drafts from is either wrong or dead. Showing the
  // count makes retirement (is_active=false) an informed decision.
  const { data: usage = {} } = useQuery({
    queryKey: ['contract-template-usage'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('template_id')
        .not('template_id', 'is', null);
      if (error) throw error;
      return (data as { template_id: string }[]).reduce<Record<string, number>>((acc, r) => {
        acc[r.template_id] = (acc[r.template_id] ?? 0) + 1;
        return acc;
      }, {});
    },
  });

  // Deep link: /admin/contracts/templates?template=<id> opens that template in the
  // read sheet (add &edit=1 for the editor). This is how a wiki page points at the
  // template it explains — one link, no copy of the text in the wiki, and the
  // reader lands on the live wording. The param is consumed so a refresh does not
  // reopen it, same as useOpenOnQueryParam.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const id = searchParams.get('template');
    if (!id || isLoading) return;
    const t = templates.find((x) => x.id === id);
    if (t) {
      if (searchParams.get('edit') === '1') setEditing(t);
      else setReading(t);
    } else {
      toast.error('That contract template no longer exists — the link may point at a deleted template');
    }
    const next = new URLSearchParams(searchParams);
    next.delete('template');
    next.delete('edit');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isLoading, templates]);

  const templateLink = (t: ContractTemplate) => `${window.location.origin}/admin/contracts/templates?template=${t.id}`;
  const copyTemplateLink = async (t: ContractTemplate) => {
    try {
      await navigator.clipboard.writeText(templateLink(t));
      toast.success('Link copied — paste it in a wiki page or a chat; it opens this template');
    } catch {
      toast.error('Could not copy — the link is ' + templateLink(t));
    }
  };



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

  const languages = Array.from(new Set(templates.map((t) => t.language))).sort();

  const q = search.trim().toLowerCase();
  const filtered = templates.filter((t) => {
    if (typeFilter !== 'all' && t.contract_type !== typeFilter) return false;
    if (langFilter !== 'all' && t.language !== langFilter) return false;
    if (activeOnly && !t.is_active) return false;
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      (t.description ?? '').toLowerCase().includes(q) ||
      t.body_markdown.toLowerCase().includes(q)
    );
  });

  const grouped = filtered.reduce<Record<string, ContractTemplate[]>>((acc, t) => {
    (acc[t.contract_type] ||= []).push(t);
    return acc;
  }, {});

  const hasFilters = !!q || typeFilter !== 'all' || langFilter !== 'all' || activeOnly;
  const activeCount = templates.filter((t) => t.is_active).length;


  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <AdminPageHeader
            title="Contract Templates"
            description="Reusable contract bodies with tokens. Agents render these via list_contract_templates + manage_contract template_id."
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportAll} disabled={templates.length === 0}>
              <FileDown className="h-4 w-4 mr-2" /> Export
            </Button>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <FileUp className="h-4 w-4 mr-2" /> Import
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={onImportFile}
            />
            <Button onClick={() => setEditing({ ...EMPTY })}>
              <Plus className="h-4 w-4 mr-2" /> New template
            </Button>
          </div>
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

        {/* Library toolbar — the same shape as Modules and Integrations:
            search first, filters as narrow selects, a live result count. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, description or clause text…"
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {(Object.keys(TYPE_LABELS) as ContractType[]).map((k) => (
                <SelectItem key={k} value={k}>{TYPE_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={langFilter} onValueChange={setLangFilter}>
            <SelectTrigger className="w-full sm:w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All languages</SelectItem>
              {languages.map((l) => (
                <SelectItem key={l} value={l}>{l.toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 shrink-0">
            <Switch id="active-only" checked={activeOnly} onCheckedChange={setActiveOnly} />
            <Label htmlFor="active-only" className="text-sm text-muted-foreground">Active only</Label>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {filtered.length} of {templates.length} template{templates.length === 1 ? '' : 's'}
            {' · '}{activeCount} active
          </span>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => { setSearch(''); setTypeFilter('all'); setLangFilter('all'); setActiveOnly(false); }}
            >
              Clear filters
            </Button>
          )}
        </div>

        {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

        {Object.entries(grouped).map(([type, items]) => (
          <div key={type} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {TYPE_LABELS[type as ContractType] ?? type}
              <span className="ml-2 font-normal normal-case tracking-normal">({items.length})</span>
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {items.map((t) => (
                <Card
                  key={t.id}
                  className={`transition-colors hover:border-primary/40 ${!t.is_active ? 'opacity-60' : ''}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <CardTitle className="text-base flex items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0" />
                          <button type="button" onClick={() => setReading(t)} className="hover:underline text-left truncate">
                            {t.name}
                          </button>
                        </CardTitle>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="outline" className="text-xs">{t.language.toUpperCase()}</Badge>
                          {t.is_default && <Badge className="text-xs">Default</Badge>}
                          {!t.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                          {(usage[t.id!] ?? 0) > 0 ? (
                            <Badge variant="secondary" className="text-xs">
                              {usage[t.id!]} contract{usage[t.id!] === 1 ? '' : 's'}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-muted-foreground">Unused</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" title="Copy link to this template" onClick={() => copyTemplateLink(t)}>
                          <Link2 className="h-4 w-4" />
                        </Button>
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

        {filtered.length === 0 && !isLoading && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              {templates.length === 0
                ? 'No templates yet. Create one to give agents a starting point.'
                : 'No templates match these filters.'}
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

      {/* Read view — the template rendered as the document it is. The läskopia
          export prints THE TEMPLATE, clearly stamped as not-an-agreement:
          unfilled {{tokens}} and [BRACKETS] are a feature here, they show the
          customer's lawyers exactly what is variable. */}
      <Sheet open={!!reading} onOpenChange={(o) => !o && setReading(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {reading && (
            <>
              <SheetHeader>
                <div className="flex items-start justify-between gap-3 pr-8">
                  <SheetTitle className="text-left">{reading.name}</SheetTitle>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => printTemplate(reading)}>
                      <Download className="h-4 w-4" />
                      Läskopia (PDF)
                    </Button>
                    <Button variant="ghost" size="sm" title="Copy link to this template" onClick={() => copyTemplateLink(reading)}>
                      <Link2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(reading); setReading(null); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Badge variant="outline" className="text-xs">{reading.contract_type}</Badge>
                  <Badge variant="outline" className="text-xs">{reading.language.toUpperCase()}</Badge>
                  <span className="text-xs text-muted-foreground self-center">
                    Uppdaterad {new Date(reading.updated_at).toLocaleDateString('sv-SE')}
                  </span>
                </div>
              </SheetHeader>
              <article data-template-body className="prose prose-sm dark:prose-invert max-w-none mt-4 pb-8">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{reading.body_markdown}</ReactMarkdown>
              </article>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Import confirmation — the plan is shown BEFORE anything is written.
          Existing names are skipped, never overwritten: they may be
          version-frozen references from signed agreements. */}
      <Dialog open={!!importPlan} onOpenChange={(o) => !o && setImportPlan(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import templates</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {(importPlan ?? []).map((item) => (
              <div key={item.template.name} className="rounded-md border p-3 text-sm space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{item.template.name}</span>
                  <Badge variant={item.status === 'new' ? 'default' : 'outline'}>
                    {item.status === 'new' ? 'will import' : 'exists — skipped'}
                  </Badge>
                </div>
                {item.unknownTokens.length > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-500 flex items-start gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      Uses tokens this instance will not fill:{' '}
                      <span className="font-mono">{item.unknownTokens.map((t) => `{{${t}}}`).join(', ')}</span>
                      {' '}— they would appear as literal text in agreements.
                    </span>
                  </p>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportPlan(null)}>Cancel</Button>
            <Button
              onClick={() => importPlan && importMut.mutate(importPlan)}
              disabled={importMut.isPending || !(importPlan ?? []).some((i) => i.status === 'new')}
            >
              {importMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Import {(importPlan ?? []).filter((i) => i.status === 'new').length} new
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
            <div className="flex items-center justify-between">
              <Label>Body (Markdown, with tokens)</Label>
              <TranslatePreviewButton text={t.body_markdown || ''} />
            </div>
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

// ----------------------------------------------------------------------
// Translate Preview — pure utility (per AI-Utility-vs-Skill).
// Calls chat-completion via useAITextGeneration. Read-only preview;
// the user can copy the translation but it never overwrites the source.
// This way the library stays English-only and any language is one click away.
// ----------------------------------------------------------------------
function TranslatePreviewButton({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState('Swedish');
  const [translated, setTranslated] = useState('');
  const { generate, isLoading } = useAITextGeneration();

  const run = async () => {
    if (!text || text.trim().length < 20) {
      toast.error('Add some body text first');
      return;
    }
    setTranslated('');
    const result = await generate({ text, action: 'translate', targetLanguage: language });
    if (result) setTranslated(result);
  };

  const copy = async () => {
    if (!translated) return;
    await navigator.clipboard.writeText(translated);
    toast.success('Copied translation');
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Languages className="h-3.5 w-3.5 mr-1.5" />
        Translate preview
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Translate template preview</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Templates are stored in English. Use this to preview the same body in any language —
              the translation is generated on the fly and never overwrites the source.
            </p>
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Target language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Swedish">Swedish</SelectItem>
                    <SelectItem value="Norwegian">Norwegian</SelectItem>
                    <SelectItem value="Danish">Danish</SelectItem>
                    <SelectItem value="Finnish">Finnish</SelectItem>
                    <SelectItem value="German">German</SelectItem>
                    <SelectItem value="French">French</SelectItem>
                    <SelectItem value="Spanish">Spanish</SelectItem>
                    <SelectItem value="Italian">Italian</SelectItem>
                    <SelectItem value="Dutch">Dutch</SelectItem>
                    <SelectItem value="Portuguese">Portuguese</SelectItem>
                    <SelectItem value="Polish">Polish</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={run} disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Languages className="h-4 w-4 mr-2" />}
                Translate
              </Button>
            </div>
            {translated && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Translated preview ({language})</Label>
                  <Button variant="ghost" size="sm" onClick={copy}>
                    <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
                  </Button>
                </div>
                <Textarea
                  rows={20}
                  value={translated}
                  readOnly
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Tokens like <code>{'{{counterparty.name}}'}</code> are preserved and still rendered at contract creation.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
