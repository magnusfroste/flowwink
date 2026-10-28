import { useState } from 'react';
import { toast } from 'sonner';
import { MessageSquarePlus, Send, Radio, Inbox, ExternalLink } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFeedbackSettings, useGeneralSettings, useUpdateFeedbackSettings } from '@/hooks/useSiteSettings';
import { FEEDBACK_DEFAULT_ENDPOINT, receivesHere } from '@/lib/feedback-endpoint';
import { useFeedbackInstances, useFeedbackSkill, useReceivedFeedback, type FeedbackPost } from '@/hooks/useFeedbackBoard';
import { ReceivedFeedbackTable } from '@/components/admin/feedback/ReceivedFeedbackTable';

const BOARDS = [
  { id: 'bug', label: 'Bug report' },
  { id: 'feature', label: 'Feature request' },
  { id: 'template', label: 'Template' },
  { id: 'question', label: 'Question' },
] as const;

/**
 * Feedback — two halves on one page. SEND: where this instance's feedback and
 * its daily ping go (www.flowwink.com by default) and a form to send one now.
 * RECEIVE: the board this instance collects when the endpoint names it — the
 * posts to triage, and the instances that ping here.
 */
export default function FeedbackPage() {
  const { data: settings } = useFeedbackSettings();
  const { data: general } = useGeneralSettings();
  const update = useUpdateFeedbackSettings();
  const skill = useFeedbackSkill();
  const ownUrl = general?.siteUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  const endpoint = settings?.endpoint ?? FEEDBACK_DEFAULT_ENDPOINT;
  const receiving = receivesHere(endpoint, ownUrl);
  const [endpointDraft, setEndpointDraft] = useState<string | null>(null);
  const [form, setForm] = useState({ board: 'feature', title: '', body: '', author_name: '', author_email: '' });

  const saveEndpoint = (value: string) => {
    update.mutate({ ...(settings ?? { endpoint: FEEDBACK_DEFAULT_ENDPOINT, share_usage: true, board_title: 'Feedback', board_intro: '' }), endpoint: value.trim() });
    setEndpointDraft(null);
  };

  const send = async () => {
    if (form.title.trim().length < 3) { toast.error('Give the feedback a title (3–200 characters).'); return; }
    try {
      const r = await skill.mutateAsync({ skill: 'submit_feedback', args: { ...form, author_name: form.author_name || undefined, author_email: form.author_email || undefined } });
      toast.success(`Sent to ${String(r.sent_to ?? endpoint)}`);
      setForm({ ...form, title: '', body: '' });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Feedback"
          description="What the platform hears back — or what your own product hears, when the board is yours."
          icon={MessageSquarePlus}
        />

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Radio className="h-4 w-4" /> Where feedback goes</CardTitle>
            <CardDescription>
              By default this instance sends its feedback and a daily usage ping to FlowWink. Point the endpoint at this instance to collect feedback for your own product instead — the board is then at <code>/feedback</code> on this site.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-64 flex-1 space-y-1">
                <Label htmlFor="fb-endpoint">Endpoint</Label>
                <Input id="fb-endpoint" value={endpointDraft ?? endpoint} onChange={(e) => setEndpointDraft(e.target.value)} placeholder={FEEDBACK_DEFAULT_ENDPOINT} />
              </div>
              <Button size="sm" disabled={endpointDraft === null || update.isPending} onClick={() => saveEndpoint(endpointDraft ?? endpoint)}>Save</Button>
              <Button size="sm" variant="outline" disabled={update.isPending || receiving} onClick={() => saveEndpoint(ownUrl)}>Use this instance</Button>
              <Button size="sm" variant="ghost" disabled={update.isPending || endpoint === FEEDBACK_DEFAULT_ENDPOINT} onClick={() => saveEndpoint(FEEDBACK_DEFAULT_ENDPOINT)}>Back to FlowWink</Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {receiving
                ? <>This instance <strong>receives</strong>: posts and pings land here. Visitors use <a className="underline" href="/feedback" target="_blank" rel="noreferrer">/feedback <ExternalLink className="inline h-3 w-3" /></a>.</>
                : <>This instance <strong>sends</strong> to <code>{endpoint}</code>. Nothing is collected here.</>}
            </p>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Share usage with the endpoint</p>
                <p className="text-xs text-muted-foreground">A daily ping: a random instance id, this site's URL, the skills version and which modules are on. No business data. This is how the project knows how many run the platform. <code>FEEDBACK_SHARE_USAGE=false</code> in the edge environment switches it off too.</p>
              </div>
              <Switch checked={settings?.share_usage ?? true} onCheckedChange={(v) => update.mutate({ ...(settings ?? { endpoint, share_usage: true, board_title: 'Feedback', board_intro: '' }), share_usage: v })} />
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue={receiving ? 'received' : 'send'}>
          <TabsList>
            <TabsTrigger value="send"><Send className="mr-1 h-3.5 w-3.5" /> Send feedback</TabsTrigger>
            <TabsTrigger value="received"><Inbox className="mr-1 h-3.5 w-3.5" /> Received</TabsTrigger>
            <TabsTrigger value="instances"><Radio className="mr-1 h-3.5 w-3.5" /> Instances</TabsTrigger>
          </TabsList>

          <TabsContent value="send" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Send feedback to {receiving ? 'this board' : 'FlowWink'}</CardTitle>
                <CardDescription>A bug, a feature, a template wish or a question. The post carries this instance's version so it is read with its context.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label>Board</Label>
                    <Select value={form.board} onValueChange={(v) => setForm({ ...form, board: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{BOARDS.map((b) => <SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1"><Label>Your name</Label><Input value={form.author_name} onChange={(e) => setForm({ ...form, author_name: e.target.value })} /></div>
                  <div className="space-y-1"><Label>E-mail (for an answer)</Label><Input type="email" value={form.author_email} onChange={(e) => setForm({ ...form, author_email: e.target.value })} /></div>
                </div>
                <div className="space-y-1"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What, where, expected vs actual" maxLength={200} /></div>
                <div className="space-y-1"><Label>Details</Label><Textarea rows={6} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Steps, what you saw, why it matters" /></div>
                <Button onClick={send} disabled={skill.isPending}><Send className="mr-1 h-4 w-4" /> Send</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="received" className="mt-4">
            <ReceivedBoard receiving={receiving} />
          </TabsContent>

          <TabsContent value="instances" className="mt-4">
            <InstancesCard receiving={receiving} />
          </TabsContent>
        </Tabs>
      </AdminPageContainer>
    </AdminLayout>
  );
}

function ReceivedBoard({ receiving }: { receiving: boolean }) {
  const [board, setBoard] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const { data: posts = [], isLoading } = useReceivedFeedback({ board: board || undefined, status: status || undefined });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Received</CardTitle>
        <CardDescription>
          {receiving ? 'Posts on this board — from visitors, from other instances, from agents. Set the status; a note goes to the reporter as a staff reply.' : 'This instance sends elsewhere; anything listed here arrived before the endpoint was changed, or from a visitor on /feedback.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Select value={board || 'all'} onValueChange={(v) => setBoard(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All boards" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All boards</SelectItem>{BOARDS.map((b) => <SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={status || 'all'} onValueChange={(v) => setStatus(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {['open', 'planned', 'in_progress', 'done', 'declined'].map((s) => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="self-center">{posts.length} post{posts.length === 1 ? '' : 's'}</Badge>
        </div>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : <ReceivedFeedbackTable posts={posts as FeedbackPost[]} />}
      </CardContent>
    </Card>
  );
}

function InstancesCard({ receiving }: { receiving: boolean }) {
  const { data, isLoading } = useFeedbackInstances();
  const rows = data?.instances ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Instances that ping here</CardTitle>
        <CardDescription>
          {receiving ? 'Every instance whose endpoint names this site, once a day: when it was first and last seen, its skills and schema versions and which modules it runs.' : 'This instance sends its ping elsewhere. Only an endpoint sees its fleet.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-6 text-sm">
          <div><span className="text-2xl font-semibold">{data?.total ?? 0}</span> <span className="text-muted-foreground">instances</span></div>
          <div><span className="text-2xl font-semibold">{data?.active_7d ?? 0}</span> <span className="text-muted-foreground">active last 7 days</span></div>
          <div><span className="text-2xl font-semibold">{Object.keys(data?.versions ?? {}).length}</span> <span className="text-muted-foreground">versions</span></div>
        </div>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : rows.length === 0 ? <p className="text-sm text-muted-foreground">No pings yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1 pr-3">Site</th><th className="py-1 pr-3">Skills</th><th className="py-1 pr-3">Schema</th><th className="py-1 pr-3">Modules</th><th className="py-1 pr-3">First seen</th><th className="py-1 pr-3">Last seen</th><th className="py-1">Pings</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.instance_id} className="border-t">
                    <td className="py-1 pr-3">{r.site_url ? <a className="underline" href={r.site_url} target="_blank" rel="noreferrer">{r.site_url.replace(/^https?:\/\//, '')}</a> : <span className="text-muted-foreground">{r.instance_id.slice(0, 8)}</span>}</td>
                    <td className="py-1 pr-3"><code className="text-xs">{r.skills_sha ?? '—'}</code></td>
                    <td className="py-1 pr-3"><code className="text-xs">{r.migration_head ?? '—'}</code></td>
                    <td className="py-1 pr-3">{r.module_count}</td>
                    <td className="py-1 pr-3">{new Date(r.first_seen_at).toLocaleDateString()}</td>
                    <td className="py-1 pr-3">{new Date(r.last_seen_at).toLocaleDateString()}</td>
                    <td className="py-1">{r.ping_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
