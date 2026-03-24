import { useState } from 'react';
import { ConfigRawEditor } from './ConfigRawEditor';
import { useQueryClient } from '@tanstack/react-query';
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
  HeartPulse,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Activity,
} from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { formatDistanceToNow } from 'date-fns';

// ── Types ────────────────────────────────────────────────────────────────────

interface BootstrapStats {
  skills: { total: number; enabled: number; lastCreated: string | null };
  automations: { total: number; enabled: number };
  workflows: { total: number; enabled: number };
  objectives: { total: number; active: number };
  cronJobs: string[];
}

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checked_at: string;
  version: {
    skill_count: number;
    enabled_count: number;
    skill_hash: string;
    expected_hash: string | null;
    hash_match: boolean | null;
  };
  memory: { soul: boolean; identity: boolean; agents: boolean };
  heartbeat: { last_run: string | null; age_hours: number | null; stale: boolean };
  integrity: { score: number; issues: string[] };
  checks_passed: number;
  checks_total: number;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function HealthStatusCard() {
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<HealthCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runHealthCheck = async () => {
    setIsChecking(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('instance-health', {
        body: {},
      });
      if (fnError) throw fnError;
      setResult(data as HealthCheckResult);
    } catch (err: any) {
      setError(err.message || 'Health check failed');
      toast.error('Health check failed');
    } finally {
      setIsChecking(false);
    }
  };

  const statusConfig = {
    healthy: { icon: ShieldCheck, color: 'text-success', bg: 'bg-success/10', label: 'Healthy' },
    degraded: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10', label: 'Degraded' },
    unhealthy: { icon: ShieldAlert, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Unhealthy' },
  };

  return (
    <div className="rounded-lg border p-3 bg-muted/20">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <HeartPulse className="h-4 w-4 text-primary" />
          Instance Health
        </div>
        {result && (() => {
          const cfg = statusConfig[result.status];
          const Icon = cfg.icon;
          return (
            <Badge variant={result.status === 'healthy' ? 'default' : result.status === 'degraded' ? 'secondary' : 'destructive'} className="text-[10px]">
              <Icon className="h-3 w-3 mr-1" />
              {cfg.label}
            </Badge>
          );
        })()}
      </div>

      {!result && !error && (
        <p className="text-[11px] text-muted-foreground mb-2">
          Run a health check to detect drift, stale heartbeats, and configuration issues.
        </p>
      )}

      {error && (
        <div className="rounded-md bg-destructive/10 p-2 mb-2">
          <p className="text-[11px] text-destructive">{error}</p>
        </div>
      )}

      {result && (
        <div className="space-y-2">
          {/* Score overview */}
          <div className="flex items-center gap-3 text-[11px]">
            <span className="text-muted-foreground">Checks:</span>
            <span className="font-medium">{result.checks_passed}/{result.checks_total} passed</span>
            <span className="text-muted-foreground">Integrity:</span>
            <span className="font-medium">{result.integrity.score}%</span>
          </div>

          {/* Drift warning */}
          {result.version.hash_match === false && (
            <div className="rounded-md bg-warning/10 border border-warning/20 p-2 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-medium text-warning">Skill Hash Drift Detected</p>
                <p className="text-[10px] text-muted-foreground">
                  Instance skills differ from bootstrap baseline. Re-run Bootstrap to sync.
                </p>
              </div>
            </div>
          )}

          {/* Stale heartbeat warning */}
          {result.heartbeat.stale && (
            <div className="rounded-md bg-warning/10 border border-warning/20 p-2 flex items-start gap-2">
              <Clock className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-medium text-warning">Heartbeat Stale</p>
                <p className="text-[10px] text-muted-foreground">
                  {result.heartbeat.age_hours
                    ? `Last heartbeat ${Math.round(result.heartbeat.age_hours)}h ago`
                    : 'No heartbeat recorded'}
                </p>
              </div>
            </div>
          )}

          {/* Missing memory keys */}
          {(!result.memory.soul || !result.memory.identity || !result.memory.agents) && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-2 flex items-start gap-2">
              <ShieldAlert className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-medium text-destructive">Missing Memory Keys</p>
                <p className="text-[10px] text-muted-foreground">
                  {[
                    !result.memory.soul && 'soul',
                    !result.memory.identity && 'identity',
                    !result.memory.agents && 'agents',
                  ].filter(Boolean).join(', ')}
                </p>
              </div>
            </div>
          )}

          {/* Integrity issues */}
          {result.integrity.issues.length > 0 && (
            <div className="space-y-1">
              {result.integrity.issues.slice(0, 3).map((issue, i) => (
                <p key={i} className="text-[10px] text-muted-foreground flex items-start gap-1.5">
                  <Activity className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" />
                  {issue}
                </p>
              ))}
            </div>
          )}

          {/* Timestamp */}
          <p className="text-[10px] text-muted-foreground text-right">
            Checked {formatDistanceToNow(new Date(result.checked_at), { addSuffix: true })}
          </p>
        </div>
      )}

      <Button
        onClick={runHealthCheck}
        disabled={isChecking}
        variant="outline"
        size="sm"
        className="w-full h-7 text-xs mt-2"
      >
        {isChecking ? (
          <><RefreshCw className="h-3 w-3 mr-1.5 animate-spin" /> Running check…</>
        ) : (
          <><HeartPulse className="h-3 w-3 mr-1.5" /> Run Health Check</>
        )}
      </Button>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function FlowPilotDetails() {
  const queryClient = useQueryClient();
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
        cronJobs: [],
      };
    },
  });

  const handleRebootstrap = async () => {
    setIsBootstrapping(true);
    try {
      const { error } = await supabase.functions.invoke('setup-flowpilot', {
        body: {
          seed_skills: true,
          seed_soul: true,
          template_flowpilot: {
            objectives: [
              {
                goal: 'Establish content presence — publish 3 blog posts within the first week',
                success_criteria: { published_posts: 3 },
                constraints: { no_destructive_actions: true },
              },
              {
                goal: 'Configure lead capture — ensure at least one form or chat is active on the site',
                success_criteria: { lead_capture_active: true },
              },
              {
                goal: 'Set up weekly digest — monitor site performance and report key metrics every Friday',
                success_criteria: { weekly_digest_active: true },
              },
            ],
            automations: [
              {
                name: 'Weekly Business Digest',
                description: 'Every Friday afternoon, analyze performance and generate a business digest with key metrics, wins, and next week priorities.',
                trigger_type: 'cron',
                trigger_config: { cron: '0 16 * * 5', timezone: 'UTC' },
                skill_name: 'weekly_business_digest',
                skill_arguments: {},
                enabled: true,
              },
            ],
            workflows: [
              {
                name: 'Content Pipeline',
                description: 'Research a topic, generate a blog post proposal, write and publish.',
                steps: [
                  { id: 'step-1', skill_name: 'research_content', skill_args: { query: '{{topic}}' } },
                  { id: 'step-2', skill_name: 'generate_content_proposal', skill_args: { research_context: '{{step-1.output}}' } },
                  { id: 'step-3', skill_name: 'write_blog_post', skill_args: { proposal: '{{step-2.output}}' }, on_failure: 'stop' },
                ],
                trigger_type: 'manual',
                enabled: true,
              },
            ],
          },
        },
      });
      if (error) throw error;

      // Seed AGENTS document if missing
      try {
        const { data: existingAgents } = await supabase
          .from('agent_memory')
          .select('id')
          .eq('key', 'agents')
          .maybeSingle();

        if (!existingAgents) {
          await supabase.from('agent_memory').insert({
            key: 'agents',
            value: {
              version: '1.0',
              direct_action_rules: 'When a user asks you to DO something (delete, update, create, fix, clean up), ALWAYS execute it directly using the appropriate skill — NEVER create an automation instead.',
              self_improvement: 'If a user asks you to do something you can\'t, consider creating a new skill. When you notice repetitive tasks, SUGGEST an automation.',
              memory_guidelines: 'Save user preferences, facts, and context with memory_write. Check memory before answering questions about the site.',
              browser_rules: 'When a user provides a URL, ALWAYS call browser_fetch. NEVER guess URLs for social profiles.',
            },
            category: 'preference',
            created_by: 'flowpilot',
          });
          logger.log('[ReBootstrap] AGENTS document seeded');
        }
      } catch (agentsErr) {
        logger.warn('[ReBootstrap] AGENTS seed failed (non-fatal):', agentsErr);
      }

      // Fire initial heartbeat
      try {
        await supabase.functions.invoke('flowpilot-heartbeat', {
          body: { time: new Date().toISOString(), trigger: 're-bootstrap' },
        });
      } catch (hbErr) {
        logger.warn('[ReBootstrap] Heartbeat failed (non-fatal):', hbErr);
      }

      queryClient.invalidateQueries({ queryKey: ['agent-skills'] });
      queryClient.invalidateQueries({ queryKey: ['agent-objectives'] });
      queryClient.invalidateQueries({ queryKey: ['agent-automations'] });
      queryClient.invalidateQueries({ queryKey: ['flowpilot-bootstrap-check'] });

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

      {/* Instance Health */}
      <HealthStatusCard />

      {/* Cron Jobs Info */}
      <div className="rounded-lg border p-3 bg-muted/20">
        <div className="flex items-center gap-2 mb-2 text-xs font-medium">
          <Clock className="h-3.5 w-3.5" />
          Scheduled Jobs
        </div>
        <div className="space-y-1">
          {[
            { name: 'flowpilot-heartbeat', schedule: 'Configurable (default: twice daily)', desc: 'Objective management & site health' },
            { name: 'automation-dispatcher', schedule: 'Every minute', desc: 'Cron-triggered automations' },
            { name: 'publish-scheduled-pages', schedule: 'Every minute', desc: 'Scheduled content publishing' },
            { name: 'flowpilot-learn', schedule: 'Daily 03:00', desc: 'Nightly learning & memory consolidation' },
            { name: 'flowpilot-daily-briefing', schedule: 'Daily 07:00', desc: 'Morning summary & action items' },
            { name: 'instance-health-check', schedule: 'Every 6 hours', desc: 'Drift detection & system health' },
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
