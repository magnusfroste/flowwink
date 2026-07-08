import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Mail, FileText, PenLine, ShieldOff, MessagesSquare, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  useEmailTemplates, useUpsertEmailTemplate, useDeleteEmailTemplate,
  useEmailSignatures, useUpsertEmailSignature,
  useEmailThreads, useThreadMessages,
  useEmailSuppressions, useAddSuppression, useRemoveSuppression,
  useEmailEvents,
  type EmailTemplate,
} from '@/hooks/useEmailModule';

export default function EmailPage() {
  return (
    <AdminLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Mail className="h-7 w-7" /> Email</h1>
          <p className="text-muted-foreground mt-1">Templates, threads, signatures and deliverability controls.</p>
        </div>
        <Tabs defaultValue="templates" className="space-y-4">
          <TabsList>
            <TabsTrigger value="templates"><FileText className="h-4 w-4 mr-1" /> Templates</TabsTrigger>
            <TabsTrigger value="threads"><MessagesSquare className="h-4 w-4 mr-1" /> Threads</TabsTrigger>
            <TabsTrigger value="signatures"><PenLine className="h-4 w-4 mr-1" /> Signatures</TabsTrigger>
            <TabsTrigger value="suppressions"><ShieldOff className="h-4 w-4 mr-1" /> Suppressions</TabsTrigger>
          </TabsList>
          <TabsContent value="templates"><TemplatesTab /></TabsContent>
          <TabsContent value="threads"><ThreadsTab /></TabsContent>
          <TabsContent value="signatures"><SignaturesTab /></TabsContent>
          <TabsContent value="suppressions"><SuppressionsTab /></TabsContent>
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
                    <TableCell className="font-medium font-mono text-xs">{t.name}</TableCell>
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
      <TemplateDialog open={open} onOpenChange={setOpen} template={editing} />
    </Card>
  );
}

function TemplateDialog({ open, onOpenChange, template }: { open: boolean; onOpenChange: (b: boolean) => void; template: EmailTemplate | null }) {
  const upsert = useUpsertEmailTemplate();
  const [name, setName] = useState(template?.name ?? '');
  const [subject, setSubject] = useState(template?.subject ?? '');
  const [html, setHtml] = useState(template?.html ?? '');
  const [text, setText] = useState(template?.text ?? '');
  const [category, setCategory] = useState(template?.category ?? '');
  const [variables, setVariables] = useState((template?.variables ?? []).join(', '));
  const [active, setActive] = useState(template?.active ?? true);

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
          <div className="space-y-2"><Label>HTML body</Label><Textarea rows={8} value={html} onChange={(e) => setHtml(e.target.value)} className="font-mono text-xs" /></div>
          <div className="space-y-2"><Label>Text fallback (optional)</Label><Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} /></div>
          <div className="space-y-2"><Label>Variables (comma-separated)</Label><Input value={variables} onChange={(e) => setVariables(e.target.value)} placeholder="first_name, invoice_number" /></div>
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

function ThreadsTab() {
  const { data, isLoading } = useEmailThreads();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const { data: msgs } = useThreadMessages(openKey ?? undefined);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="md:col-span-1">
        <CardHeader><CardTitle className="text-base">Conversations</CardTitle></CardHeader>
        <CardContent className="space-y-1 max-h-[70vh] overflow-y-auto">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
            : (data?.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">No threads yet.</p>
            : data!.map((t) => (
              <button key={t.thread_key}
                onClick={() => setOpenKey(t.thread_key)}
                className={`w-full text-left rounded-md px-3 py-2 hover:bg-accent ${openKey === t.thread_key ? 'bg-accent' : ''}`}
              >
                <div className="font-medium truncate">{t.subject || '(no subject)'}</div>
                <div className="text-xs text-muted-foreground">
                  {t.message_count} msg · {formatDistanceToNow(new Date(t.last_message_at), { addSuffix: true })}
                </div>
              </button>
            ))}
        </CardContent>
      </Card>
      <Card className="md:col-span-2">
        <CardHeader><CardTitle className="text-base">Messages</CardTitle></CardHeader>
        <CardContent>
          {!openKey ? <p className="text-sm text-muted-foreground">Pick a thread on the left.</p>
            : (msgs?.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">No messages in this thread.</p>
            : (
              <div className="space-y-3">
                {msgs!.map((m: any) => (
                  <div key={m.id} className="rounded-md border p-3">
                    <div className="flex justify-between items-center text-xs text-muted-foreground">
                      <span>{m.direction ?? 'out'} · {m.recipient}</span>
                      <span>{m.sent_at ? formatDistanceToNow(new Date(m.sent_at), { addSuffix: true }) : ''}</span>
                    </div>
                    <div className="font-medium mt-1">{m.subject ?? '(no subject)'}</div>
                    <div className="mt-2 text-sm prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: m.body_html ?? m.body_text ?? '' }} />
                  </div>
                ))}
              </div>
            )}
        </CardContent>
      </Card>
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
