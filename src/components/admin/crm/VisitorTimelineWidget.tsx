import { useVisitorTimeline } from '@/hooks/useVisitorTimeline';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MousePointerClick, Sparkles, Mail, TrendingUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface VisitorTimelineWidgetProps {
  leadId: string | null | undefined;
}

const KIND_ICON = {
  page_view: MousePointerClick,
  signal: Sparkles,
  newsletter_open: Mail,
  newsletter_click: TrendingUp,
} as const;

export function VisitorTimelineWidget({ leadId }: VisitorTimelineWidgetProps) {
  const { data: events, isLoading } = useVisitorTimeline(leadId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Visitor behavior</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !events || events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tracked activity yet. Once this contact returns to the site with cookies accepted, visits and signals will appear here.
          </p>
        ) : (
          <ol className="space-y-3 max-h-[420px] overflow-y-auto pr-2">
            {events.map((e) => {
              const Icon = KIND_ICON[e.kind] ?? MousePointerClick;
              return (
                <li key={e.id} className="flex gap-3 text-sm">
                  <div className="mt-0.5 shrink-0 rounded-full bg-muted p-1.5">
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium truncate">{e.title}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(e.at), { addSuffix: true })}
                      </span>
                    </div>
                    {e.detail && (
                      <p className="text-xs text-muted-foreground truncate">{e.detail}</p>
                    )}
                    {typeof e.score_delta === 'number' && e.score_delta !== 0 && (
                      <Badge variant="secondary" className="mt-1 text-xs">
                        {e.score_delta > 0 ? '+' : ''}{e.score_delta} score
                      </Badge>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
