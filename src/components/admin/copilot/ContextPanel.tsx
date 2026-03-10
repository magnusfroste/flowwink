/**
 * ContextPanel
 * 
 * Right-side panel for the FlowPilot cockpit.
 * Aggregates: Agent Status, Active Objectives, Live Activity Feed.
 * Provides cross-navigation links to Skill Hub.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Target, Settings2, Workflow, TrendingUp, ChevronDown, ChevronRight, 
  CircleDot, RefreshCw 
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useObjectives } from '@/hooks/useObjectives';
import { AgentStatusBar } from './AgentStatusBar';
import type { AgentActivity } from '@/types/agent';

// ─── Compact Objective Card ───────────────────────────────────────────────────

function ObjectiveChip({ goal, status, progress }: { 
  goal: string; 
  status: string; 
  progress: Record<string, unknown>;
}) {
  const pct = deriveProgress(progress);
  
  return (
    <div className="p-2.5 rounded-lg bg-card border hover:bg-accent/50 transition-colors cursor-pointer">
      <div className="flex items-center gap-2 mb-1">
        <span className={cn(
          'h-1.5 w-1.5 rounded-full shrink-0',
          status === 'active' ? 'bg-emerald-500' :
          status === 'paused' ? 'bg-amber-500' :
          status === 'completed' ? 'bg-blue-500' : 'bg-destructive'
        )} />
        <p className="text-xs font-medium truncate flex-1">{goal}</p>
      </div>
      {pct !== null && (
        <Progress value={pct} className="h-1" />
      )}
    </div>
  );
}

function deriveProgress(progress: Record<string, unknown>): number | null {
  const current = (progress.current ?? progress.done ?? progress.count) as number | undefined;
  const target = (progress.target ?? progress.total ?? progress.goal) as number | undefined;
  if (typeof current === 'number' && typeof target === 'number' && target > 0) {
    return Math.min(Math.round((current / target) * 100), 100);
  }
  return null;
}

// ─── Activity Item ────────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  success: 'bg-emerald-500',
  failed: 'bg-destructive',
  pending_approval: 'bg-amber-500',
  approved: 'bg-primary',
  rejected: 'bg-muted-foreground',
};

function ActivityItem({ activity }: { activity: AgentActivity }) {
  return (
    <div className="flex items-start gap-2 py-2 px-1 group overflow-hidden">
      <span className={cn(
        'h-2 w-2 rounded-full mt-1.5 shrink-0',
        STATUS_DOT[activity.status] ?? 'bg-muted-foreground'
      )} />
      <div className="flex-1 min-w-0 overflow-hidden">
        <p className="text-xs font-medium truncate">
          {(activity.skill_name || 'Unknown').replace(/_/g, ' ')}
        </p>
        <p className="text-[10px] text-muted-foreground truncate">
          {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
          {activity.duration_ms ? ` · ${activity.duration_ms}ms` : ''}
        </p>
      </div>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function PanelSection({ 
  title, icon: Icon, defaultOpen = true, badge, children 
}: { 
  title: string; 
  icon: React.ElementType; 
  defaultOpen?: boolean;
  badge?: string | number;
  children: React.ReactNode; 
}) {
  const [open, setOpen] = useState(defaultOpen);
  
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-accent/50 transition-colors">
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex-1 text-left truncate">
          {title}
        </span>
        {badge !== undefined && (
          <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
            {badge}
          </Badge>
        )}
        {open ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-3 overflow-hidden">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface ContextPanelProps {
  activities: AgentActivity[];
  onApprove?: (activityId: string) => void;
  onRefresh?: () => void;
}

export function ContextPanel({ activities, onApprove, onRefresh }: ContextPanelProps) {
  const navigate = useNavigate();
  const { data: objectives = [] } = useObjectives('active');
  const [realtimeActivities, setRealtimeActivities] = useState<AgentActivity[]>([]);
  const [isLive, setIsLive] = useState(false);

  // Merge realtime + initial activities
  const allActivities = [...realtimeActivities, ...activities]
    .filter((a, i, arr) => arr.findIndex(b => b.id === a.id) === i)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 50);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('context-panel-activity')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'agent_activity' },
        (payload) => {
          setRealtimeActivities(prev => [payload.new as unknown as AgentActivity, ...prev].slice(0, 20));
        }
      )
      .subscribe((status) => {
        setIsLive(status === 'SUBSCRIBED');
      });

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="p-3 border-b">
        <AgentStatusBar />
      </div>

      <ScrollArea className="flex-1">
        {/* Objectives */}
        <PanelSection title="Objectives" icon={Target} badge={objectives.length || undefined}>
          {objectives.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No active objectives</p>
          ) : (
            <div className="space-y-1.5">
              {objectives.slice(0, 5).map(obj => (
                <div key={obj.id} onClick={() => navigate('/admin/skills?tab=objectives')}>
                  <ObjectiveChip 
                    goal={obj.goal} 
                    status={obj.status} 
                    progress={obj.progress} 
                  />
                </div>
              ))}
              {objectives.length > 5 && (
                <Button 
                  variant="ghost" size="sm" className="w-full text-xs h-7"
                  onClick={() => navigate('/admin/skills?tab=objectives')}
                >
                  View all {objectives.length} objectives
                </Button>
              )}
            </div>
          )}
        </PanelSection>

        {/* Activity */}
        <PanelSection title="Activity" icon={CircleDot} badge={allActivities.length || undefined}>
          <div className="flex items-center gap-2 mb-2">
            {isLive && (
              <div className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] text-emerald-600 font-medium">Live</span>
              </div>
            )}
            <div className="flex-1" />
            {onRefresh && (
              <Button variant="ghost" size="sm" onClick={onRefresh} className="h-6 px-1.5">
                <RefreshCw className="h-3 w-3" />
              </Button>
            )}
          </div>
          {allActivities.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No activity yet</p>
          ) : (
            <div className="divide-y divide-border/50">
              {allActivities.slice(0, 20).map(a => (
                <ActivityItem key={a.id} activity={a} />
              ))}
            </div>
          )}
        </PanelSection>
      </ScrollArea>

      {/* Cross-navigation footer */}
      <div className="border-t p-2 space-y-0.5">
        <Button 
          variant="ghost" size="sm" className="w-full justify-start gap-2 h-7 text-xs"
          onClick={() => navigate('/admin/skills')}
        >
          <Settings2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Skills</span>
        </Button>
        <Button 
          variant="ghost" size="sm" className="w-full justify-start gap-2 h-7 text-xs"
          onClick={() => navigate('/admin/skills?tab=automations')}
        >
          <Workflow className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Automations</span>
        </Button>
        <Button 
          variant="ghost" size="sm" className="w-full justify-start gap-2 h-7 text-xs"
          onClick={() => navigate('/admin/skills?tab=evolution')}
        >
          <TrendingUp className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Evolution</span>
        </Button>
      </div>
    </div>
  );
}
