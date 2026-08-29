import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { useEditActivityNote } from '@/hooks/useEditActivityNote';
import { LinkifiedText } from '@/components/ui/linkified-text';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Phone, Mail, Users, MessageSquare, FileText, MailOpen,
  MousePointer, RefreshCw, Trophy, XCircle, Calendar,
  ShoppingCart, Video, Activity, CheckCircle2, ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronRight, Pencil
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useUnifiedTimeline, type TimelineEvent } from '@/hooks/useUnifiedTimeline';

const ICON_MAP: Record<string, React.ElementType> = {
  Phone, Mail, Users, MessageSquare, FileText, MailOpen,
  MousePointer, RefreshCw, Trophy, XCircle, Calendar,
  ShoppingCart, Video, Activity, CheckCircle2, ArrowDownLeft, ArrowUpRight,
};

interface UnifiedTimelineProps {
  leadId?: string;
  email?: string;
}

const TYPE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'activity', label: 'Activities' },
  { value: 'email', label: 'Email' },
  { value: 'booking', label: 'Bookings' },
  { value: 'chat', label: 'Chat' },
  { value: 'newsletter', label: 'Newsletter' },
  { value: 'order', label: 'Orders' },
];

export function UnifiedTimeline({ leadId, email }: UnifiedTimelineProps) {
  const { data: events = [], isLoading } = useUnifiedTimeline(leadId, email);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity Timeline</CardTitle>
        <CardDescription>
          All interactions across channels ({events.length} events)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="all">
          <TabsList className="mb-4 h-8">
            {TYPE_FILTERS.map(f => {
              const count = f.value === 'all' 
                ? events.length 
                : f.value === 'newsletter'
                  ? events.filter(e => e.type === 'newsletter_open' || e.type === 'newsletter_click').length
                  : events.filter(e => e.type === f.value).length;
              
              if (f.value !== 'all' && count === 0) return null;

              return (
                <TabsTrigger key={f.value} value={f.value} className="text-xs h-7">
                  {f.label}
                  {count > 0 && <Badge variant="secondary" className="ml-1 h-4 text-[10px] px-1">{count}</Badge>}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {TYPE_FILTERS.map(f => (
            <TabsContent key={f.value} value={f.value} className="mt-0">
              <TimelineList
                events={f.value === 'all' 
                  ? events 
                  : f.value === 'newsletter'
                    ? events.filter(e => e.type === 'newsletter_open' || e.type === 'newsletter_click')
                    : events.filter(e => e.type === f.value)
                }
                isLoading={isLoading}
              />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

/**
 * A meeting summary can be 2 600 characters with 38 line breaks (measured on a
 * live contact, 2026-08-29). Clamped to two lines with no way out, it is stored
 * but unreadable: the log looked like it had lost the text. The clamp stays —
 * a timeline must survive twenty contacts' worth of scanning — but anything
 * long enough to be cut off now says so and opens in place, keeping its own
 * line breaks. Long-form belongs in the record, not in the scan line.
 */
function isExpandable(text: string): boolean {
  return text.length > 160 || text.includes('\n');
}

/**
 * Which entries carry text a human wrote — the only text anyone may correct.
 * A system observation ("email opened", "deal created") has no authored
 * sentence in it, so it needs no edit affordance at all.
 */
const HUMAN_LOGGED = new Set(['note', 'call', 'meeting', 'email', 'task_completed']);

function TimelineList({ events, isLoading }: { events: TimelineEvent[]; isLoading: boolean }) {
  const { user, isAdmin } = useAuth();
  const editNote = useEditActivityNote();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // The entry is immutable; its text is correctable — by the person who wrote
  // it, or an admin. Rows from before authorship was recorded have no author,
  // so only an admin may touch them: we do not know whose words they are.
  const mayCorrect = (e: TimelineEvent) =>
    !!e.activityId &&
    HUMAN_LOGGED.has(e.activityType ?? '') &&
    (isAdmin || (!!e.authorId && e.authorId === user?.id));

  const startEdit = (e: TimelineEvent) => {
    setEditing(e.id);
    setDraft(e.description ?? '');
  };
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-4">Loading timeline...</p>;
  }

  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No events yet</p>;
  }

  return (
    <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
      {events.map((event) => {
        const IconComponent = ICON_MAP[event.icon] || Activity;

        return (
          <div key={event.id} className="flex gap-3">
            <div className="flex-shrink-0 mt-1">
              <div className="h-8 w-8 rounded-full flex items-center justify-center bg-muted">
                <IconComponent className={cn("h-4 w-4", event.color)} />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{event.title}</span>
                {event.actor && (
                  <Badge variant="outline" className="text-[10px] h-5 max-w-52 truncate">
                    {event.actor}
                  </Badge>
                )}
                {event.status && event.type === 'email' && (
                  <Badge variant="secondary" className="text-[10px] h-5">{event.status}</Badge>
                )}
                {event.points && event.points > 0 && (
                  <Badge variant="outline" className="text-xs">+{event.points}p</Badge>
                )}
                <TypeBadge type={event.type} />
              </div>
              {editing === event.id ? (
                <div className="mt-1 space-y-2">
                  <Textarea
                    value={draft}
                    onChange={(ev) => setDraft(ev.target.value)}
                    rows={4}
                    className="[field-sizing:content] max-h-96 resize-y text-xs leading-relaxed"
                    placeholder="Correct the wording. Emptying it redacts the text and leaves the entry standing."
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      disabled={editNote.isPending}
                      onClick={() =>
                        editNote.mutate(
                          { activityId: event.activityId!, note: draft },
                          { onSuccess: () => setEditing(null) },
                        )
                      }
                    >
                      Save correction
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                    <span className="text-[10px] text-muted-foreground">
                      The entry, its time and its points stay as they are.
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  {event.description ? (
                    <p
                      className={cn(
                        'text-xs text-muted-foreground mt-0.5',
                        expanded.has(event.id) ? 'whitespace-pre-wrap' : 'line-clamp-2',
                      )}
                    >
                      {/* A ledger entry that points at the wiki instead of
                          repeating it is the right shape — so the pointer has
                          to be a link, not text to select and copy. */}
                      <LinkifiedText text={event.description} />
                    </p>
                  ) : (
                    // A corrected-away note: the row stands, the words are gone.
                    event.editedAt && HUMAN_LOGGED.has(event.activityType ?? '') && (
                      <p className="text-xs text-muted-foreground/70 italic mt-0.5">Note redacted</p>
                    )
                  )}
                  <div className="flex items-center gap-2 mt-0.5">
                    {event.description && isExpandable(event.description) && (
                      <button
                        type="button"
                        onClick={() => toggle(event.id)}
                        className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                      >
                        {expanded.has(event.id)
                          ? <><ChevronDown className="h-3 w-3" /> Show less</>
                          : <><ChevronRight className="h-3 w-3" /> Show more</>}
                      </button>
                    )}
                    {mayCorrect(event) && (
                      <button
                        type="button"
                        onClick={() => startEdit(event)}
                        className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3 w-3" /> Correct
                      </button>
                    )}
                    {event.editedAt && (
                      <span className="text-[10px] text-muted-foreground/70" title={new Date(event.editedAt).toLocaleString()}>
                        edited
                      </span>
                    )}
                  </div>
                </>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    activity: '',
    booking: 'Booking',
    form: 'Form',
    chat: 'Chat',
    email: 'Email',
    newsletter_open: 'Newsletter',
    newsletter_click: 'Newsletter',
    order: 'Order',
    task: 'Task',
  };

  const label = labels[type];
  if (!label) return null;

  return (
    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
      {label}
    </Badge>
  );
}
