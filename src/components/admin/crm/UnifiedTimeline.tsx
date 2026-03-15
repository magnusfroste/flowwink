import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Phone, Mail, Users, MessageSquare, FileText, MailOpen,
  MousePointer, RefreshCw, Trophy, XCircle, Calendar,
  ShoppingCart, Video, Activity
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useUnifiedTimeline, type TimelineEvent } from '@/hooks/useUnifiedTimeline';

const ICON_MAP: Record<string, React.ElementType> = {
  Phone, Mail, Users, MessageSquare, FileText, MailOpen,
  MousePointer, RefreshCw, Trophy, XCircle, Calendar,
  ShoppingCart, Video, Activity,
};

interface UnifiedTimelineProps {
  leadId?: string;
  email?: string;
}

const TYPE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'activity', label: 'Activities' },
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

function TimelineList({ events, isLoading }: { events: TimelineEvent[]; isLoading: boolean }) {
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
                {event.points && event.points > 0 && (
                  <Badge variant="outline" className="text-xs">+{event.points}p</Badge>
                )}
                <TypeBadge type={event.type} />
              </div>
              {event.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {event.description}
                </p>
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
