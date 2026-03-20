import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Zap, 
  Bot, 
  RefreshCw, 
  CheckCircle2, 
  Target, 
  Workflow, 
  Clock,
  Hash,
  FlaskConical,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface BootstrapStats {
  skills: { total: number; enabled: number; lastCreated: string | null };
  automations: { total: number; enabled: number };
  workflows: { total: number; enabled: number };
  objectives: { total: number; active: number };
  cronJobs: string[];
}

export function FlowPilotDetails() {
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const navigate = useNavigate();

  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ['flowpilot-bootstrap-stats'],
    queryFn: async (): Promise<BootstrapStats> => {
      const [skills, automations, workflows, objectives] = await Promise.all([
        supabase.from('agent_skills').select('id, enabled, created_at').order('created_at', { ascending: false }),
        supabase.from('agent_automations').select('id, enabled'),
        supabase.from('agent_workflows').select('id, enabled'),
        supabase.from('agent_objectives').select('id, status'),
      ]);

      return {
        skills: {
          total: skills.data?.length ?? 0,
          enabled: skills.data?.filter(s => s.enabled).length ?? 0,
          lastCreated: skills.data?.[0]?.created_at ?? null,
        },
        automations: {
          total: automations.data?.length ?? 0,
          enabled: automations.data?.filter(a => a.enabled).length ?? 0,
        },
        workflows: {
          total: workflows.data?.length ?? 0,
          enabled: workflows.data?.filter(w => w.enabled).length ?? 0,
        },
        objectives: {
          total: objectives.data?.length ?? 0,
          active: objectives.data?.filter(o => o.status === 'active').length ?? 0,
        },
        cronJobs: [], // We can't query pg_cron from client
      };
    },
  });

  const handleRebootstrap = async () => {
    setIsBootstrapping(true);
    try {
      const { error } = await supabase.functions.invoke('setup-flowpilot', {
        body: { template_flowpilot: 'default' },
      });
      if (error) throw error;
      toast.success('FlowPilot bootstrap completed');
      refetch();
    } catch (err) {
      console.error('Bootstrap failed:', err);
      toast.error('Bootstrap failed — check AI provider configuration');
    } finally {
      setIsBootstrapping(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-14 rounded-lg bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }

  const statItems = [
    {
      label: 'Skills',
      icon: Bot,
      total: stats?.skills.total ?? 0,
      detail: `${stats?.skills.enabled ?? 0} enabled`,
      lastActivity: stats?.skills.lastCreated,
    },
    {
      label: 'Automations',
      icon: Zap,
      total: stats?.automations.total ?? 0,
      detail: `${stats?.automations.enabled ?? 0} enabled`,
    },
    {
      label: 'Workflows',
      icon: Workflow,
      total: stats?.workflows.total ?? 0,
      detail: `${stats?.workflows.enabled ?? 0} enabled`,
    },
    {
      label: 'Objectives',
      icon: Target,
      total: stats?.objectives.total ?? 0,
      detail: `${stats?.objectives.active ?? 0} active`,
    },
  ];

  const hasAnyData = statItems.some(s => s.total > 0);

  return (
    <div className="space-y-4">
      {/* Bootstrap Status */}
      <div className="rounded-lg border p-3 bg-muted/20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Zap className="h-4 w-4 text-primary" />
            Bootstrap Status
          </div>
          <Badge 
            variant={hasAnyData ? 'default' : 'secondary'} 
            className="text-[10px]"
          >
            {hasAnyData ? (
              <><CheckCircle2 className="h-3 w-3 mr-1" /> Active</>
            ) : (
              <><Clock className="h-3 w-3 mr-1" /> Not initialized</>
            )}
          </Badge>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2">
          {statItems.map(item => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-lg bg-background/60 p-2.5">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <Icon className="h-3 w-3" />
                  <span className="text-[11px]">{item.label}</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-bold">{item.total}</span>
                  <span className="text-[10px] text-muted-foreground">{item.detail}</span>
                </div>
                {item.lastActivity && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Latest {formatDistanceToNow(new Date(item.lastActivity), { addSuffix: true })}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Cron Jobs Info */}
      <div className="rounded-lg border p-3 bg-muted/20">
        <div className="flex items-center gap-2 mb-2 text-xs font-medium">
          <Clock className="h-3.5 w-3.5" />
          Scheduled Jobs
        </div>
        <div className="space-y-1">
          {[
            { name: 'flowpilot-heartbeat', schedule: 'Every 12 hours', desc: 'Objective management & site health' },
            { name: 'automation-dispatcher', schedule: 'Every minute', desc: 'Cron-triggered automations' },
            { name: 'publish-scheduled-pages', schedule: 'Every minute', desc: 'Scheduled content publishing' },
            { name: 'flowpilot-learn', schedule: 'Daily 03:00', desc: 'Nightly learning & memory consolidation' },
            { name: 'flowpilot-daily-briefing', schedule: 'Daily 07:00', desc: 'Morning summary & action items' },
          ].map(job => (
            <div key={job.name} className="flex items-start gap-2 py-1">
              <Hash className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono font-medium truncate">{job.name}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{job.schedule}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">{job.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <Button
          onClick={handleRebootstrap}
          disabled={isBootstrapping}
          variant="outline"
          size="sm"
          className="w-full h-8 text-xs"
        >
          {isBootstrapping ? (
            <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Running bootstrap…</>
          ) : (
            <><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Re-run Bootstrap</>
          )}
        </Button>
        <Button
          onClick={() => navigate('/admin/autonomy-tests')}
          variant="ghost"
          size="sm"
          className="w-full h-8 text-xs"
        >
          <FlaskConical className="h-3.5 w-3.5 mr-1.5" /> Autonomy Test Suite
        </Button>
        <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
          Bootstrap is idempotent. Test Suite validates OpenClaw conformance.
        </p>
      </div>
    </div>
  );
}