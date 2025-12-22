import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Phone, Mail, Users, MessageSquare, FileText, MailOpen, 
  MousePointer, RefreshCw, Trophy, XCircle, Plus, Check, Clock
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { getActivityTypeInfo, type ActivityType } from '@/hooks/useActivities';

interface Activity {
  id: string;
  type: string;
  title?: string | null;
  description?: string | null;
  scheduled_at?: string | null;
  completed_at?: string | null;
  metadata?: Record<string, unknown> | null;
  points?: number | null;
  created_at: string;
}

interface ActivityTimelineProps {
  activities: Activity[];
  onAddActivity?: (activity: { type: ActivityType; title?: string; description?: string; scheduledAt?: string }) => void;
  onMarkComplete?: (activityId: string) => void;
  isLoading?: boolean;
  showAddForm?: boolean;
  title?: string;
  description?: string;
}

const ICON_MAP: Record<string, typeof Phone> = {
  Phone, Mail, Users, MessageSquare, FileText, MailOpen, 
  MousePointer, RefreshCw, Trophy, XCircle,
};

const ACTIVITY_TYPES: { value: ActivityType; label: string }[] = [
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'note', label: 'Note' },
];

export function ActivityTimeline({
  activities,
  onAddActivity,
  onMarkComplete,
  isLoading,
  showAddForm = true,
  title = 'Activity Timeline',
  description = 'Track calls, emails, meetings and notes',
}: ActivityTimelineProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newActivity, setNewActivity] = useState({
    type: 'call' as ActivityType,
    title: '',
    description: '',
    scheduledAt: '',
  });

  const handleAdd = () => {
    if (!newActivity.title.trim()) return;
    onAddActivity?.(newActivity);
    setNewActivity({ type: 'call', title: '', description: '', scheduledAt: '' });
    setIsAdding(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {showAddForm && onAddActivity && !isAdding && (
          <Button variant="outline" size="sm" onClick={() => setIsAdding(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Activity Form */}
        {isAdding && (
          <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <div className="flex gap-2">
              <Select 
                value={newActivity.type} 
                onValueChange={(v) => setNewActivity({ ...newActivity, type: v as ActivityType })}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Activity title..."
                value={newActivity.title}
                onChange={(e) => setNewActivity({ ...newActivity, title: e.target.value })}
                className="flex-1"
              />
            </div>
            <Textarea
              placeholder="Description (optional)..."
              value={newActivity.description}
              onChange={(e) => setNewActivity({ ...newActivity, description: e.target.value })}
              rows={2}
            />
            <div className="flex items-center gap-2">
              <Input
                type="datetime-local"
                value={newActivity.scheduledAt}
                onChange={(e) => setNewActivity({ ...newActivity, scheduledAt: e.target.value })}
                className="w-auto"
              />
              <span className="text-xs text-muted-foreground">Scheduled (optional)</span>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setIsAdding(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleAdd} disabled={!newActivity.title.trim()}>
                Add Activity
              </Button>
            </div>
          </div>
        )}

        {/* Timeline */}
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : !activities?.length ? (
          <p className="text-muted-foreground text-sm">No activities yet</p>
        ) : (
          <div className="space-y-4">
            {activities.map((activity) => {
              const typeInfo = getActivityTypeInfo(activity.type);
              const IconComponent = ICON_MAP[typeInfo.icon] || FileText;
              const metadata = activity.metadata as Record<string, unknown> | null;
              const isCompleted = !!activity.completed_at;
              const isScheduled = activity.scheduled_at && !isCompleted;

              return (
                <div key={activity.id} className="flex gap-3">
                  <div className="flex-shrink-0 mt-1">
                    <div className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center",
                      isCompleted ? "bg-green-100 dark:bg-green-900/30" : "bg-muted"
                    )}>
                      <IconComponent className={cn("h-4 w-4", typeInfo.color)} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs">
                        {typeInfo.label}
                      </Badge>
                      {activity.title && (
                        <span className="font-medium text-sm">{activity.title}</span>
                      )}
                      {activity.points && activity.points > 0 && (
                        <Badge variant="outline" className="text-xs">
                          +{activity.points}p
                        </Badge>
                      )}
                      {isScheduled && (
                        <Badge variant="outline" className="text-xs flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(activity.scheduled_at!), 'MMM d, HH:mm')}
                        </Badge>
                      )}
                      {isCompleted && (
                        <Badge className="text-xs bg-green-500 flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          Done
                        </Badge>
                      )}
                    </div>

                    {/* Description / Details */}
                    {activity.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {activity.description}
                      </p>
                    )}
                    
                    {/* Metadata-based details for lead activities */}
                    {activity.type === 'note' && metadata?.note && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {metadata.note as string}
                      </p>
                    )}
                    {activity.type === 'form_submit' && metadata?.form_name && (
                      <p className="text-sm text-muted-foreground">
                        Form: {metadata.form_name as string}
                      </p>
                    )}
                    {activity.type === 'status_change' && metadata?.from && (
                      <p className="text-sm text-muted-foreground">
                        {metadata.from as string} → {metadata.to as string}
                        {metadata.automated && ' (automated)'}
                      </p>
                    )}
                    {activity.type === 'link_click' && metadata?.url && (
                      <p className="text-sm text-muted-foreground truncate">
                        {metadata.url as string}
                      </p>
                    )}

                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                      </p>
                      {isScheduled && onMarkComplete && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 text-xs"
                          onClick={() => onMarkComplete(activity.id)}
                        >
                          Mark complete
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
