import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSurveyTemplates, useSurveyCampaigns, useSurveyResponses, useNpsStats, useCreateCampaign, useSendSurvey, useSaveTemplate, useDeleteTemplate, type SurveyTemplate } from '@/hooks/useSurveys';
import { Smile, Frown, Meh, Plus, Send, Loader2, MessageSquare, Pencil, Trash2, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

const TRIGGERS = ['manual', 'order.delivered', 'order.paid', 'ticket.closed', 'contract.renewed', 'booking.completed', 'deal.won'];

export default function SurveysPage() {
  const { data: templates } = useSurveyTemplates();
  const { data: campaigns } = useSurveyCampaigns();
  const { data: stats } = useNpsStats();
  const [selectedCampaign, setSelectedCampaign] = useState<string | undefined>();
  const { data: responses } = useSurveyResponses(selectedCampaign);
  const createCampaign = useCreateCampaign();
  const sendSurvey = useSendSurvey();
  const saveTemplate = useSaveTemplate();
  const deleteTemplate = useDeleteTemplate();

  const [createOpen, setCreateOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState<string | null>(null);
  const [templateEdit, setTemplateEdit] = useState<Partial<SurveyTemplate> | null>(null);
  const [form, setForm] = useState({ name: '', template_id: '', trigger: 'manual', email_subject: 'How was your experience?', email_intro: 'We would love your feedback. It takes 10 seconds.' });
  const [recipients, setRecipients] = useState('');

  const overallNps = stats && stats.length > 0
    ? Math.round((stats.reduce((s, c) => s + (c.promoters || 0), 0) - stats.reduce((s, c) => s + (c.detractors || 0), 0)) /
        Math.max(1, stats.reduce((s, c) => s + (c.total_responses || 0), 0)) * 100)
    : null;
  const totalResponses = stats?.reduce((s, c) => s + (c.total_responses || 0), 0) ?? 0;

  return (
    <AdminLayout>
      <AdminPageHeader title="Surveys & NPS" description="Capture customer satisfaction with one-click surveys." />
      <AdminPageContainer>
        {/* KPI strip */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <KpiCard label="Overall NPS" value={overallNps !== null ? overallNps.toString() : '—'} hint={`${totalResponses} responses`} />
          <KpiCard label="Promoters" value={stats?.reduce((s, c) => s + (c.promoters || 0), 0).toString() ?? '0'} icon={<Smile className="h-4 w-4 text-emerald-500" />} />
          <KpiCard label="Passives" value={stats?.reduce((s, c) => s + (c.passives || 0), 0).toString() ?? '0'} icon={<Meh className="h-4 w-4 text-amber-500" />} />
          <KpiCard label="Detractors" value={stats?.reduce((s, c) => s + (c.detractors || 0), 0).toString() ?? '0'} icon={<Frown className="h-4 w-4 text-rose-500" />} />
        </div>

        <Tabs defaultValue="campaigns">
          <TabsList>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="responses">Responses</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="campaigns" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1.5" />New campaign</Button>
            </div>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>NPS</TableHead>
                  <TableHead>Responses</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(campaigns ?? []).map(c => {
                    const s = stats?.find(x => x.campaign_id === c.id);
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.survey_templates?.name} <Badge variant="outline" className="ml-1 uppercase text-[10px]">{c.survey_templates?.kind}</Badge></TableCell>
                        <TableCell><Badge variant="secondary" className="font-mono text-xs">{c.trigger}</Badge></TableCell>
                        <TableCell className="font-mono">{s?.nps_score ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{s?.total_responses ?? 0}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => setSendOpen(c.id)}><Send className="h-3.5 w-3.5 mr-1" />Send</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!campaigns?.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No campaigns yet</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="responses" className="space-y-4 mt-4">
            <Select value={selectedCampaign ?? 'all'} onValueChange={(v) => setSelectedCampaign(v === 'all' ? undefined : v)}>
              <SelectTrigger className="w-64"><SelectValue placeholder="All campaigns" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All campaigns</SelectItem>
                {(campaigns ?? []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Score</TableHead><TableHead>Email</TableHead><TableHead>Comment</TableHead><TableHead>When</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(responses ?? []).map(r => (
                    <TableRow key={r.id}>
                      <TableCell><CategoryBadge category={r.category} score={r.score} /></TableCell>
                      <TableCell className="text-sm">{r.recipient_email}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-md truncate">{r.comment || <em className="opacity-50">—</em>}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</TableCell>
                    </TableRow>
                  ))}
                  {!responses?.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8"><MessageSquare className="h-6 w-6 mx-auto mb-2 opacity-40" />No responses yet</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="templates" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <Button onClick={() => setTemplateEdit({ name: '', kind: 'nps', description: '', questions: [{ id: 'q1', type: 'score', label: 'How likely are you to recommend us?', required: true }], is_active: true })}>
                <Plus className="h-4 w-4 mr-1.5" />New template
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(templates ?? []).map(t => (
                <Card key={t.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">{t.name}<Badge variant="outline" className="uppercase text-[10px]">{t.kind}</Badge></CardTitle>
                        <CardDescription>{t.description}</CardDescription>
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setTemplateEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => { if (confirm(`Delete template "${t.name}"?`)) deleteTemplate.mutate(t.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {t.questions?.map((q, i) => <li key={i}>• {q.label}</li>)}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Create campaign dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>New survey campaign</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Campaign name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <Select value={form.template_id} onValueChange={v => setForm({ ...form, template_id: v })}>
                <SelectTrigger><SelectValue placeholder="Choose template" /></SelectTrigger>
                <SelectContent>{(templates ?? []).map(t => <SelectItem key={t.id} value={t.id}>{t.name} ({t.kind})</SelectItem>)}</SelectContent>
              </Select>
              <Select value={form.trigger} onValueChange={v => setForm({ ...form, trigger: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TRIGGERS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
              <Input placeholder="Email subject" value={form.email_subject} onChange={e => setForm({ ...form, email_subject: e.target.value })} />
              <Textarea placeholder="Email intro" value={form.email_intro} onChange={e => setForm({ ...form, email_intro: e.target.value })} rows={2} />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button disabled={!form.name || !form.template_id || createCampaign.isPending} onClick={() => createCampaign.mutate(form, { onSuccess: () => { setCreateOpen(false); setForm({ ...form, name: '' }); } })}>
                {createCampaign.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Send dialog */}
        <Dialog open={!!sendOpen} onOpenChange={() => setSendOpen(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Send survey</DialogTitle></DialogHeader>
            <Textarea placeholder="One email per line: name@example.com" value={recipients} onChange={e => setRecipients(e.target.value)} rows={6} />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setSendOpen(null)}>Cancel</Button>
              <Button disabled={!recipients.trim() || sendSurvey.isPending} onClick={() => {
                const list = recipients.split(/[\n,]/).map(s => s.trim()).filter(Boolean).map(email => ({ email }));
                if (!list.length || !sendOpen) return;
                sendSurvey.mutate({ campaign_id: sendOpen, recipients: list }, { onSuccess: () => { setSendOpen(null); setRecipients(''); } });
              }}>
                {sendSurvey.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Send
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Template editor dialog */}
        <Dialog open={!!templateEdit} onOpenChange={(o) => !o && setTemplateEdit(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{templateEdit?.id ? 'Edit template' : 'New template'}</DialogTitle></DialogHeader>
            {templateEdit && (
              <div className="space-y-3">
                <Input placeholder="Template name" value={templateEdit.name ?? ''} onChange={e => setTemplateEdit({ ...templateEdit, name: e.target.value })} />
                <Select value={templateEdit.kind ?? 'nps'} onValueChange={v => setTemplateEdit({ ...templateEdit, kind: v as SurveyTemplate['kind'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nps">NPS — 0–10 recommendation</SelectItem>
                    <SelectItem value="csat">CSAT — 1–5 satisfaction</SelectItem>
                    <SelectItem value="ces">CES — customer effort</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea placeholder="Description (internal)" value={templateEdit.description ?? ''} onChange={e => setTemplateEdit({ ...templateEdit, description: e.target.value })} rows={2} />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Questions</label>
                    <Button size="sm" variant="ghost" onClick={() => setTemplateEdit({ ...templateEdit, questions: [...(templateEdit.questions ?? []), { id: `q${Date.now()}`, type: 'text', label: '', required: false }] })}>
                      <Plus className="h-3.5 w-3.5 mr-1" />Add question
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {(templateEdit.questions ?? []).map((q, i) => (
                      <div key={q.id ?? i} className="flex gap-2 items-start">
                        <Select value={q.type} onValueChange={v => {
                          const next = [...(templateEdit.questions ?? [])];
                          next[i] = { ...q, type: v };
                          setTemplateEdit({ ...templateEdit, questions: next });
                        }}>
                          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="score">Score</SelectItem>
                            <SelectItem value="text">Comment</SelectItem>
                            <SelectItem value="choice">Choice</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input placeholder="Question label" value={q.label} onChange={e => {
                          const next = [...(templateEdit.questions ?? [])];
                          next[i] = { ...q, label: e.target.value };
                          setTemplateEdit({ ...templateEdit, questions: next });
                        }} />
                        <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => {
                          const next = (templateEdit.questions ?? []).filter((_, j) => j !== i);
                          setTemplateEdit({ ...templateEdit, questions: next });
                        }}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                    ))}
                    {!templateEdit.questions?.length && <p className="text-xs text-muted-foreground italic">No questions yet — click "Add question" above.</p>}
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setTemplateEdit(null)}>Cancel</Button>
              <Button
                disabled={!templateEdit?.name || !templateEdit?.questions?.length || saveTemplate.isPending}
                onClick={() => {
                  if (!templateEdit) return;
                  saveTemplate.mutate(templateEdit as SurveyTemplate, { onSuccess: () => setTemplateEdit(null) });
                }}>
                {saveTemplate.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AdminPageContainer>
    </AdminLayout>
  );
}

function KpiCard({ label, value, hint, icon }: { label: string; value: string; hint?: string; icon?: React.ReactNode }) {
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{label}</p>{icon}</div>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </CardContent></Card>
  );
}

function CategoryBadge({ category, score }: { category: string | null; score: number | null }) {
  if (score === null) return <span className="text-muted-foreground">—</span>;
  const map: Record<string, string> = {
    promoter: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    passive: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    detractor: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  };
  return <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono font-semibold', map[category ?? ''] ?? 'bg-muted')}>{score}</span>;
}
