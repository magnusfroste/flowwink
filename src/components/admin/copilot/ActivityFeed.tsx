import { useEffect } from 'react';
import { CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import type { AgentActivity } from '@/types/agent';
import { ValidationErrorDetails, hasValidationDetails } from '@/components/admin/agent/ValidationErrorDetails';

interface ActivityFeedProps {
  activities: AgentActivity[];
  onApprove?: (activityId: string) => void;
  onRefresh?: () => void;
}

const STATUS_CONFIG = {
  success: { icon: CheckCircle2, color: 'text-green-500', label: 'Success' },
  failed: { icon: XCircle, color: 'text-destructive', label: 'Failed' },
  pending_approval: { icon: Clock, color: 'text-yellow-500', label: 'Pending' },
  approved: { icon: CheckCircle2, color: 'text-primary', label: 'Approved' },
  rejected: { icon: AlertTriangle, color: 'text-muted-foreground', label: 'Rejected' },
} as const;

export function ActivityFeed({ activities, onApprove, onRefresh }: ActivityFeedProps) {
  if (!activities.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-3">
        <p className="text-sm text-muted-foreground">No agent activity yet</p>
        <p className="text-xs text-muted-foreground/60">Actions will appear here as FlowPilot executes skills</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Activity</h3>
          {onRefresh && (
            <Button variant="ghost" size="sm" onClick={onRefresh} className="text-xs h-6 px-2">
              Refresh
            </Button>
          )}
        </div>

        {activities.map((activity) => {
          const config = STATUS_CONFIG[activity.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.success;
          const Icon = config.icon;

          return (
            <div
              key={activity.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-card/50 border border-border/50 hover:bg-card/80 transition-colors"
            >
              <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', config.color)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">
                    {(activity.skill_name || 'Unknown').replace(/_/g, ' ')}
                  </span>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {activity.agent}
                  </Badge>
                </div>
                {activity.status === 'failed' && hasValidationDetails(activity.output) ? (
                  <ValidationErrorDetails
                    output={activity.output}
                    errorMessage={activity.error_message}
                    compact
                  />
                ) : activity.error_message ? (
                  <p className="text-xs text-destructive mt-0.5 break-words">{activity.error_message}</p>
                ) : null}
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                  {activity.duration_ms && ` · ${activity.duration_ms}ms`}
                </p>

                {activity.status === 'pending_approval' && onApprove && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 text-xs"
                    onClick={() => onApprove(activity.id)}
                  >
                    Approve
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
