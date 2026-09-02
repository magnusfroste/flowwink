import { Link, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { EmailTemplatePreview, EmailLogoNotice } from '@/components/admin/email/EmailTemplatePreview';
import { EmailBody } from '@/components/admin/email/EmailBody';
import { ThreadReply } from '@/components/admin/email/ThreadReply';
import { buildSampleValues, detectTokens } from '@/lib/email-preview';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatEmailHtml } from '@/lib/format-email-html';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Mail, FileText, PenLine, ShieldOff, MessagesSquare, Plus, Trash2, AlertTriangle, Send, Bot } from 'lucide-react';
import { EmailRouterSettings } from '@/components/admin/EmailRouterSettings';
import { formatDistanceToNow } from 'date-fns';
import {
  useEmailTemplates, useUpsertEmailTemplate, useDeleteEmailTemplate,
  useEmailSignatures, useUpsertEmailSignature,
  useEmailThreads, useThreadMessages, useThreadPeeks,
  useEmailSuppressions, useAddSuppression, useRemoveSuppression,
  useEmailEvents,
  type EmailTemplate,
} from '@/hooks/useEmailModule';

export default function EmailPage() {
  const [searchParams] = useSearchParams();
  // Djuplänkar (?tab=…) från proveniensrader ska landa rätt — en länk som
  // öppnar fel flik är en ratt som inte gör vad etiketten säger.
  const requestedTab = searchParams.get('tab');
  // The inbox opens first: the person watching email also watches forms,
  // tickets and the live chat — the conversations are the work, templates
  // are the setup.
  const initialTab = requestedTab && ['templates', 'threads', 'signatures', 'suppressions', 'sending'].includes(requestedTab) ? requestedTab : 'threads';
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-serif text-2xl font-bold text-foreground flex items-center gap-2"><Mail className="h-7 w-7" /> Email</h1>
          <p className="text-muted-foreground mt-1">Templates, threads, signatures and deliverability controls.</p>
        </div>
        <Tabs defaultValue={initialTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="threads"><MessagesSquare className="h-4 w-4 mr-1" /> Inbox</TabsTrigger>
            <TabsTrigger value="templates"><FileText className="h-4 w-4 mr-1" /> Templates</TabsTrigger>
            <TabsTrigger value="signatures"><PenLine className="h-4 w-4 mr-1" /> Signatures</TabsTrigger>
            <TabsTrigger value="suppressions"><ShieldOff className="h-4 w-4 mr-1" /> Suppressions</TabsTrigger>
            <TabsTrigger value="sending"><Send className="h-4 w-4 mr-1" /> Sending</TabsTrigger>
          </TabsList>
          <TabsContent value="templates"><TemplatesTab /></TabsContent>
          <TabsContent value="threads"><ThreadsTab /></TabsContent>
          <TabsContent value="signatures"><SignaturesTab /></TabsContent>
          <TabsContent value="suppressions"><SuppressionsTab /></TabsContent>
          {/* The HOW layer of email — provider, from-address, tracking, inbound
              mailboxes — lived on the old "Email Router" page. It is setup,
              so it lives with the rest of email setup. */}
          <TabsContent value="sending"><EmailRouterSettings /></TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

function TemplatesTab() {
  const { data, isLoading } = useEmailTemplates();
  const remove = useDeleteEmailTemplate();
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [open, setOpen] = useState(false);
  const [previewing, setPreviewing] = useState<EmailTemplate | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Email templates</CardTitle>
          <CardDescription>Reusable subject + HTML with {'{{variable}}'} substitution. Callable via <code>email-send</code> with <code>template_name</code>.</CardDescription>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4 mr-2" /> New template</Button>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
          : (data?.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">No templates yet.</p>
          : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead><TableHead>Subject</TableHead><TableHead>Category</TableHead>
                <TableHead>Variables</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data!.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium font-mono text-xs">
                      {/* Reading a template should not require entering edit
                          mode — same rule as the KB and contract templates. */}
                      <button
                        className="text-left hover:underline hover:text-primary"
                        onClick={() => setPreviewing(t)}
                      >
                        {t.name}
                      </button>
                    </TableCell>
                    <TableCell className="max-w-md truncate">{t.subject}</TableCell>
                    <TableCell>{t.category ?? '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{(t.variables ?? []).join(', ') || '—'}</TableCell>
                    <TableCell><Badge variant={t.active ? 'default' : 'outline'}>{t.active ? 'active' : 'inactive'}</Badge></TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => { setEditing(t); setOpen(true); }}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => remove.mutate(t.name)}><Trash2 className="h-3 w-3" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
      </CardContent>
      <TemplateDialog key={editing?.id ?? 'new'} open={open} onOpenChange={setOpen} template={editing} />
      <TemplatePreviewSheet
        template={previewing}
        onOpenChange={(o) => !o && setPreviewing(null)}
        onEdit={(t) => { setPreviewing(null); setEditing(t); setOpen(true); }}
      />
    </Card>
  );
}

function TemplatePreviewSheet({
  template, onOpenChange, onEdit,
}: {
  template: EmailTemplate | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (t: EmailTemplate) => void;
}) {
  const tokens = useMemo(
    () => detectTokens(template?.subject ?? '', template?.html ?? ''),
    [template],
  );
  const [values, setValues] = useState<Record<string, string>>({});
  // Sample data is regenerated per template, and operator edits to it are
  // deliberately not persisted — this is a viewer, not a fixture editor.
  useEffect(() => { setValues(buildSampleValues(tokens)); }, [tokens]);

  if (!template) return null;

  return (
    <Sheet open={!!template} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-mono text-base">{template.name}</SheetTitle>
          <SheetDescription>
            {template.category ? `${template.category} · ` : ''}
            {template.active ? 'Active' : 'Inactive'}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <EmailLogoNotice />

          {tokens.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Sample values
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {tokens.map((tok) => (
                  <div key={tok} className="space-y-1">
                    <Label className="text-xs font-mono">{`{{${tok}}}`}</Label>
                    <Input
                      className="h-8 text-xs"
                      value={values[tok] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [tok]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <EmailTemplatePreview
            subject={template.subject}
            html={template.html}
            values={values}
            className="w-full h-[520px] bg-white"
          />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            <Button onClick={() => onEdit(template)}>Edit</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TemplateDialog({ open, onOpenChange, template }: { open: boolean; onOpenChange: (b: boolean) => void; template: EmailTemplate | null }) {
  const upsert = useUpsertEmailTemplate();
  const [name, setName] = useState(template?.name ?? '');
  const [subject, setSubject] = useState(template?.subject ?? '');
  const [html, setHtml] = useState(formatEmailHtml(template?.html ?? ''));
  const [text, setText] = useState(template?.text ?? '');
  const [category, setCategory] = useState(template?.category ?? '');
  const [variables, setVariables] = useState((template?.variables ?? []).join(', '));
  const [active, setActive] = useState(template?.active ?? true);

  const usedTokens = useMemo(() => detectTokens(subject, html), [subject, html]);
  const previewValues = useMemo(() => buildSampleValues(usedTokens), [usedTokens]);
  const declaredVars = useMemo(
    () => variables.split(',').map((s) => s.trim()).filter(Boolean),
    [variables],
  );
  const undeclaredTokens = usedTokens.filter((t) => !declaredVars.includes(t));

  const save = () => {
    upsert.mutate({
      name, subject, html,
      text: text || undefined,
      category: category || undefined,
      variables: variables.split(',').map((s) => s.trim()).filter(Boolean),
      active,
    }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{template ? 'Edit template' : 'New template'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Name (slug)</Label><Input value={name} onChange={(e) => setName(e.target.value)} disabled={!!template} placeholder="welcome_v2" /></div>
            <div className="space-y-2"><Label>Category</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="sales / billing …" /></div>
          </div>
          <div className="space-y-2"><Label>Subject</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
          <Tabs defaultValue="html">
            <TabsList className="h-8">
              <TabsTrigger value="html" className="text-xs">HTML</TabsTrigger>
              <TabsTrigger value="preview" className="text-xs">Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="html" className="mt-2">
              <Textarea rows={12} value={html} onChange={(e) => setHtml(e.target.value)} className="font-mono text-xs" />
            </TabsContent>
            <TabsContent value="preview" className="mt-2 space-y-2">
              <EmailLogoNotice />
              <EmailTemplatePreview
                subject={subject}
                html={html}
                values={previewValues}
                className="w-full h-[380px] bg-white"
              />
              <p className="text-xs text-muted-foreground">
                Shown with sample values and your branding — the same shell{' '}
                <code>email-send</code> applies when the mail goes out.
              </p>
            </TabsContent>
          </Tabs>
          <div className="space-y-2"><Label>Text fallback (optional)</Label><Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} /></div>
          <div className="space-y-2">
            <Label>Variables (comma-separated)</Label>
            <Input value={variables} onChange={(e) => setVariables(e.target.value)} placeholder="first_name, invoice_number" />
            {undeclaredTokens.length > 0 && (
              // Declared variables are what an agent reads to learn how to call
              // the template; a token used but not declared is invisible to it.
              <p className="text-xs text-amber-600 dark:text-amber-500">
                Used in the template but not declared:{' '}
                <span className="font-mono">{undeclaredTokens.join(', ')}</span>
                <button
                  type="button"
                  className="ml-2 underline hover:no-underline"
                  onClick={() => setVariables([...declaredVars, ...undeclaredTokens].join(', '))}
                >
                  add them
                </button>
              </p>
            )}
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label>Active</Label>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!name || !subject || !html || upsert.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Anna Svensson <anna@x.se>" → "Anna Svensson"; a bare address → its local part. */
function displayName(raw: string | null | undefined): string {
  const s = (raw ?? '').trim();
  const m = s.match(/^"?([^"<]+?)"?\s*<[^>]+>$/);
  if (m) return m[1].trim();
  return s.includes('@') ? s.split('@')[0] : s || '—';
}

function timeShort(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * The inbox, shaped like a mail client and not like a card grid: a dense
 * list on the left (who · subject – newest line · time), the conversation on
 * the right with older messages folded to one line and the newest open, the
 * reply at the bottom. No nested cards, no headers that repeat the tab name.
 */
interface ThreadMsg {
  id: string;
  status?: string | null;
  direction?: string | null;
  sender?: string | null;
  recipient?: string | null;
  body_text?: string | null;
  body_html?: string | null;
  sent_at?: string | null;
  created_at?: string;
}

function ThreadsTab() {
  const { data, isLoading } = useEmailThreads();
  const { data: peeks = {} } = useThreadPeeks();
  // Deep link from the Inbox: ?thread=<key> opens that conversation.
  const [params] = useSearchParams();
  const [openKey, setOpenKey] = useState<string | null>(params.get('thread'));
  const { data: msgs } = useThreadMessages(openKey ?? undefined);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState('');

  const threads = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter((t) => {
      const pk = peeks[t.thread_key];
      return (t.subject ?? '').toLowerCase().includes(q) || (pk?.who ?? '').toLowerCase().includes(q) || (pk?.snippet ?? '').toLowerCase().includes(q);
    });
  }, [data, peeks, filter]);

  const open = openKey ? (data ?? []).find((t) => t.thread_key === openKey) ?? null : null;
  const visible = ((msgs ?? []) as ThreadMsg[]).filter((m) => m.status !== 'used' && m.status !== 'discarded');
  const lastId = visible.length ? visible[visible.length - 1].id : null;

  return (
    <div className="rounded-lg border bg-card overflow-hidden grid grid-cols-1 md:grid-cols-[minmax(260px,340px)_1fr] min-h-[60vh]">
      <div className="border-b md:border-b-0 md:border-r flex flex-col max-h-[75vh]">
        <div className="p-2 border-b">
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search mail" className="h-8 text-sm" />
        </div>
        <div className="overflow-y-auto divide-y">
          {isLoading ? <p className="text-sm text-muted-foreground p-3">Loading…</p>
            : threads.length === 0 ? <p className="text-sm text-muted-foreground p-3">{filter ? 'Nothing matches.' : 'No threads yet.'}</p>
            : threads.map((t) => {
              const pk = peeks[t.thread_key];
              const who = pk?.who ? displayName(pk.who) : '—';
              const active = openKey === t.thread_key;
              return (
                <button key={t.thread_key}
                  onClick={() => setOpenKey(t.thread_key)}
                  className={`w-full text-left px-3 py-2 hover:bg-accent/60 ${active ? 'bg-accent' : ''}`}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium truncate">{who}</span>
                    {t.message_count > 1 && <span className="text-[11px] text-muted-foreground">{t.message_count}</span>}
                    {pk?.hasDraft && <Bot className="h-3 w-3 text-primary shrink-0" aria-label="FlowPilot draft waiting" />}
                    <span className="ml-auto text-[11px] text-muted-foreground shrink-0">{timeShort(t.last_message_at)}</span>
                  </div>
                  <div className="text-xs truncate">
                    <span className="text-foreground/90">{t.subject || '(no subject)'}</span>
                    {pk?.snippet && <span className="text-muted-foreground"> – {pk.snippet}</span>}
                  </div>
                </button>
              );
            })}
        </div>
      </div>
      <div className="min-w-0 flex flex-col max-h-[75vh]">
        {!open ? (
          <p className="text-sm text-muted-foreground p-6">Pick a conversation.</p>
        ) : (
          <>
            <div className="px-4 py-3 border-b flex items-center gap-3">
              <h2 className="text-base font-medium truncate">{open.subject || '(no subject)'}</h2>
              {open.related_entity_type && open.related_entity_id && (
                <Link
                  to={open.related_entity_type === 'lead' ? `/admin/contacts?lead=${open.related_entity_id}` : open.related_entity_type === 'ticket' ? `/admin/tickets?ticket=${open.related_entity_id}` : open.related_entity_type === 'company' ? `/admin/companies/${open.related_entity_id}` : '#'}
                  className="shrink-0"
                >
                  <Badge variant="outline" className="capitalize hover:bg-accent">{open.related_entity_type}</Badge>
                </Link>
              )}
              <span className="ml-auto text-xs text-muted-foreground shrink-0">{open.message_count} message{open.message_count === 1 ? '' : 's'}</span>
            </div>
            <div className="overflow-y-auto px-4 py-2 divide-y">
              {visible.length === 0 ? <p className="text-sm text-muted-foreground py-4">No messages in this thread.</p>
                : visible.map((m) => {
                  const isDraft = m.status === 'draft';
                  const inbound = m.direction === 'inbound';
                  const fromRaw = inbound ? m.sender : (m.sender || 'us');
                  const isOpen = isDraft || m.id === lastId || expanded.has(m.id);
                  const initial = (isDraft ? 'F' : displayName(fromRaw)[0] || '?').toUpperCase();
                  return (
                    <div key={m.id} className={`py-3 ${isDraft ? 'bg-primary/5 -mx-4 px-4 border-l-2 border-primary/40' : ''}`}>
                      <button type="button" onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })} className="w-full text-left flex items-start gap-3">
                        <span className={`h-8 w-8 rounded-full shrink-0 grid place-items-center text-xs font-medium ${isDraft ? 'bg-primary/15 text-primary' : inbound ? 'bg-muted text-foreground' : 'bg-primary/10 text-primary'}`}>
                          {isDraft ? <Bot className="h-4 w-4" /> : initial}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <span className="text-sm font-medium truncate">{isDraft ? "FlowPilot's draft" : inbound ? displayName(m.sender) : 'You'}</span>
                            <span className="text-xs text-muted-foreground truncate hidden sm:inline">{isDraft ? 'not sent' : inbound ? m.sender : `to ${m.recipient}`}</span>
                            <span className="ml-auto text-[11px] text-muted-foreground shrink-0">{timeShort(m.sent_at ?? m.created_at)}</span>
                          </span>
                          {!isOpen && <span className="block text-xs text-muted-foreground truncate">{String(m.body_text ?? '').replace(/\s+/g, ' ').slice(0, 120)}</span>}
                        </span>
                      </button>
                      {isOpen && (
                        <div className="pl-11 mt-1">
                          {isDraft
                            ? <p className="text-sm text-muted-foreground italic">Waiting in the reply box below — edit, send or discard.</p>
                            : <EmailBody html={m.body_html} text={m.body_text} className="text-sm" />}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
            <div className="border-t p-3 mt-auto">
              <ThreadReply threadKey={open.thread_key} messages={msgs ?? []} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SignaturesTab() {
  const { data, isLoading } = useEmailSignatures();
  const upsert = useUpsertEmailSignature();
  const [html, setHtml] = useState('');
  const [fromAddress, setFromAddress] = useState('');
  const [isDefault, setIsDefault] = useState(true);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">New / update signature</CardTitle><CardDescription>Appended automatically to sends where sender_user_id or from-address matches.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2"><Label>From address (optional — shared)</Label><Input value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} placeholder="sales@company.com" /></div>
          <div className="space-y-2"><Label>Signature HTML</Label><Textarea rows={6} value={html} onChange={(e) => setHtml(e.target.value)} className="font-mono text-xs" placeholder="<p>Jane Doe</p><p>Sales, ACME</p>" /></div>
          <div className="flex items-center justify-between rounded-md border p-3"><Label>Set as default for me</Label><Switch checked={isDefault} onCheckedChange={setIsDefault} /></div>
          <Button onClick={() => upsert.mutate({ html, from_address: fromAddress || undefined, is_default: isDefault })} disabled={!html || upsert.isPending}>Save signature</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Saved signatures</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
            : (data?.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">None yet.</p>
            : (
              <div className="space-y-3">
                {data!.map((s) => (
                  <div key={s.id} className="rounded-md border p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">{s.from_address ?? '(personal)'}</div>
                      {s.is_default && <Badge>default</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground" dangerouslySetInnerHTML={{ __html: s.html }} />
                  </div>
                ))}
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}

function SuppressionsTab() {
  const { data, isLoading } = useEmailSuppressions();
  const { data: events } = useEmailEvents(50);
  const add = useAddSuppression();
  const remove = useRemoveSuppression();
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('manual');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldOff className="h-4 w-4" /> Suppression list</CardTitle><CardDescription>Hard bounces and complaints auto-suppress. email-send skips these recipients.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="bad@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input className="w-40" placeholder="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button onClick={() => add.mutate({ email, reason }, { onSuccess: () => setEmail('') })} disabled={!email}>Add</Button>
          </div>
          {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
            : (data?.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">No suppressions.</p>
            : (
              <Table>
                <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Reason</TableHead><TableHead>Since</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {data!.map((s) => (
                    <TableRow key={s.email}>
                      <TableCell className="font-mono text-xs">{s.email}</TableCell>
                      <TableCell><Badge variant="outline">{s.reason}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}</TableCell>
                      <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => remove.mutate(s.email)}>Remove</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Recent delivery events</CardTitle><CardDescription>From ESP webhooks (bounces / complaints / delivered).</CardDescription></CardHeader>
        <CardContent>
          {(events?.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">No events yet.</p>
            : (
              <Table>
                <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Recipient</TableHead><TableHead>Hard?</TableHead><TableHead>When</TableHead></TableRow></TableHeader>
                <TableBody>
                  {events!.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell><Badge variant={e.event_type === 'bounced' || e.event_type === 'complained' ? 'destructive' : 'outline'}>{e.event_type}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{e.recipient ?? '—'}</TableCell>
                      <TableCell>{e.hard_bounce ? 'yes' : ''}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
