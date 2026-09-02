import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Bot, Headphones, Inbox, Loader2, Mail, MessageSquare, Phone, FileText, Ticket, UserRound, Hourglass, CheckCircle2, Route, ScrollText } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useInboxItems } from '@/hooks/useInboxItems';
import { useSupportPresence } from '@/hooks/useSupportPresence';
import { STATE_ORDER, type InboxChannel, type InboxItem, type InboxState } from '@/lib/inbox-items';
import { RoutingLenses } from '@/components/admin/flowbox/RoutingLenses';
import { MessageLogTab } from '@/components/admin/flowbox/MessageLogTab';
import { cn } from '@/lib/utils';

/**
 * FlowBox — where everything that flows in and out of the company is handled.
 * Three tabs, one concept:
 *   Queue    — every conversation on every channel, organised by who has it.
 *              FlowPilot goes first; "needs a person" is its hand-off list.
 *   Routing  — the rules: where each channel lands, who takes it first, when a
 *              person steps in. Lenses over each channel's own settings.
 *   Message log — the ledger: everything sent and received, with the record
 *              it binds to.
 *
 * Presence is a toggle here, not a separate room. Offline you read and catch
 * up — every step FlowPilot took is visible. "Live" means chat hand-offs and
 * calls can ring you. Answering an email or a ticket never needs it.
 */
const TABS = ['queue', 'routing', 'log'] as const;
type Tab = (typeof TABS)[number];

export default function FlowBoxPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const tab: Tab = (TABS as readonly string[]).includes(requested ?? '') ? (requested as Tab) : 'queue';
  const { agentRecord, onlineAgents, goOnline, goOffline, isUpdating } = useSupportPresence();
  const live = agentRecord?.status === 'online';

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="FlowBox"
          description="Everything that flows in and out — email, chat, tickets, forms, calls. FlowPilot goes first; what needs a person is at the top."
        >
          <div className={cn('flex items-center gap-3 rounded-md border px-3 py-2', live ? 'border-success/40 bg-success/10' : 'bg-muted/40')}>
            <Headphones className={cn('h-4 w-4', live ? 'text-success' : 'text-muted-foreground')} />
            <div className="text-sm leading-tight">
              <div className="font-medium">{live ? 'You are live' : 'You are reading'}</div>
              <div className="text-xs text-muted-foreground">
                {live ? 'Chat hand-offs and calls can reach you.' : 'Catch up; nothing rings you. Flip to take chats and calls.'}
                {onlineAgents.length > 0 && ` · ${onlineAgents.length} live now`}
              </div>
            </div>
            {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <Switch checked={live} onCheckedChange={(v) => (v ? goOnline() : goOffline())} aria-label="Go live" />
            )}
          </div>
        </AdminPageHeader>

        <Tabs value={tab} onValueChange={(v) => setSearchParams(v === 'queue' ? {} : { tab: v }, { replace: true })} className="space-y-4">
          <TabsList>
            <TabsTrigger value="queue"><Inbox className="h-4 w-4 mr-1" /> Queue</TabsTrigger>
            <TabsTrigger value="routing"><Route className="h-4 w-4 mr-1" /> Routing</TabsTrigger>
            <TabsTrigger value="log"><ScrollText className="h-4 w-4 mr-1" /> Message log</TabsTrigger>
          </TabsList>
          <TabsContent value="queue"><QueueTab /></TabsContent>
          <TabsContent value="routing"><RoutingLenses /></TabsContent>
          <TabsContent value="log"><MessageLogTab /></TabsContent>
        </Tabs>
      </AdminPageContainer>
    </AdminLayout>
  );
}

const CHANNEL_META: Record<InboxChannel, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  email: { label: 'Email', icon: Mail },
  chat: { label: 'Chat', icon: MessageSquare },
  ticket: { label: 'Tickets', icon: Ticket },
  form: { label: 'Forms', icon: FileText },
  voice: { label: 'Calls', icon: Phone },
};

const STATE_META: Record<InboxState, { label: string; hint: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  human: { label: 'Needs a person', hint: 'Escalated, asked for, or not allowed to finish — your hand-off list.', icon: UserRound, tone: 'text-destructive' },
  agent: { label: 'With FlowPilot', hint: 'Being handled by the operator. Nothing hidden — open any row to read every step.', icon: Bot, tone: 'text-primary' },
  customer: { label: 'Waiting on the customer', hint: 'Answered; the ball is with them.', icon: Hourglass, tone: 'text-muted-foreground' },
  done: { label: 'Done', hint: 'Closed or handled in the last 30 days.', icon: CheckCircle2, tone: 'text-muted-foreground' },
};

function QueueTab() {
  const { data: items = [], isLoading } = useInboxItems();
  const [channel, setChannel] = useState<InboxChannel | 'all'>('all');
  const [showDone, setShowDone] = useState(false);

  const filtered = useMemo(() => items.filter((i) => channel === 'all' || i.channel === channel), [items, channel]);
  const grouped = useMemo(() => {
    const g: Record<InboxState, InboxItem[]> = { human: [], agent: [], customer: [], done: [] };
    for (const i of filtered) g[i.state].push(i);
    return g;
  }, [filtered]);
  const channelCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of items) if (i.state !== 'done') c[i.channel] = (c[i.channel] ?? 0) + 1;
    return c;
  }, [items]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={channel === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setChannel('all')}>
          <Inbox className="h-3.5 w-3.5 mr-1.5" /> All
        </Button>
        {(Object.keys(CHANNEL_META) as InboxChannel[]).map((c) => {
          const Icon = CHANNEL_META[c].icon;
          return (
            <Button key={c} variant={channel === c ? 'default' : 'outline'} size="sm" onClick={() => setChannel(c)}>
              <Icon className="h-3.5 w-3.5 mr-1.5" /> {CHANNEL_META[c].label}
              {channelCounts[c] ? <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{channelCounts[c]}</Badge> : null}
            </Button>
          );
        })}
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={showDone} onCheckedChange={setShowDone} aria-label="Show done" />
          Show done
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading the queue…</p>
      ) : (
        <div className="space-y-6">
          {STATE_ORDER.filter((s) => s !== 'done' || showDone).map((state) => {
            const meta = STATE_META[state];
            const Icon = meta.icon;
            const rows = grouped[state];
            return (
              <section key={state} className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <Icon className={cn('h-4 w-4 self-center', meta.tone)} />
                  <h2 className="font-medium">{meta.label}</h2>
                  <span className="text-xs text-muted-foreground">{rows.length}</span>
                  <span className="text-xs text-muted-foreground hidden md:inline">· {meta.hint}</span>
                </div>
                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground pl-6">Nothing here.</p>
                ) : (
                  <Card>
                    <CardContent className="p-0 divide-y">
                      {rows.map((i) => {
                        const CIcon = CHANNEL_META[i.channel].icon;
                        return (
                          <Link key={i.key} to={i.href} className="flex items-start gap-3 px-4 py-3 hover:bg-accent/50">
                            <CIcon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm truncate">{i.subject}</span>
                                {i.priority && i.priority !== 'normal' && (
                                  <Badge variant={i.priority === 'urgent' || i.priority === 'high' ? 'destructive' : 'outline'} className="text-[10px] px-1.5 py-0 capitalize">{i.priority}</Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                <span className="text-foreground/80">{i.who}</span> · {i.reason}
                                {i.preview ? ` · ${i.preview}` : ''}
                              </div>
                            </div>
                            {i.entity && (
                              <Link
                                to={i.entity.type === 'lead' ? `/admin/contacts?lead=${i.entity.id}` : i.entity.type === 'company' ? `/admin/companies/${i.entity.id}` : '#'}
                                onClick={(e) => e.stopPropagation()}
                                className="shrink-0"
                              >
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize hover:bg-accent">{i.entity.type}</Badge>
                              </Link>
                            )}
                            <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                              {formatDistanceToNow(new Date(i.at), { addSuffix: true })}
                            </span>
                          </Link>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
