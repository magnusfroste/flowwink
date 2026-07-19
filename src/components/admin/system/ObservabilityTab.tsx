import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Activity, Zap, Sparkles, LogIn, ArrowRight, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgentEvents } from '@/hooks/useAgentEvents';
import { useAutomationHealth } from '@/hooks/useAutomationHealth';
import { McpActivityPanel } from '@/components/admin/developer/McpActivityPanel';

function timeAgo(iso: string | null) {
  if (!iso) return '—';
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

function EventBusCard() {
  const { data, isLoading } = useAgentEvents();
  const events = data ?? [];
  const processed = events.filter((e) => e.processed_at).length;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="font-serif flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-amber-500" />
            Event Bus
          </CardTitle>
          <CardDescription>
            {isLoading ? '…' : `${events.length} recent · ${processed} processed`}
          </CardDescription>
        </div>
        <Link
          to="/admin/automations"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          Open <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events emitted yet.</p>
        ) : (
          <ul className="space-y-1.5 max-h-64 overflow-auto">
            {events.slice(0, 8).map((ev) => (
              <li key={ev.id} className="flex items-center justify-between gap-2 text-sm py-1">
                <div className="min-w-0 flex-1">
                  <code className="text-xs font-mono truncate block">{ev.event_name}</code>
                  {ev.source && (
                    <span className="text-[10px] text-muted-foreground">{ev.source}</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{timeAgo(ev.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AutomationQueueCard() {
  const { data, isLoading } = useAutomationHealth();

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="font-serif flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-blue-500" />
            Automation Health
          </CardTitle>
          <CardDescription>
            {isLoading
              ? '…'
              : `${data?.enabled ?? 0}/${data?.total ?? 0} enabled · ${data?.totalRuns7d ?? 0} runs (7d)`}
          </CardDescription>
        </div>
        <Link
          to="/admin/automations"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          Open <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2 mb-3">
              <Stat label="Healthy" value={data?.healthy ?? 0} tone="ok" />
              <Stat label="Warning" value={data?.warning ?? 0} tone="warn" />
              <Stat label="Erroring" value={data?.erroring ?? 0} tone="bad" />
              <Stat label="Stale" value={data?.stale ?? 0} tone="muted" />
            </div>
            {(data?.erroring ?? 0) > 0 && (
              <ul className="space-y-1 mt-2 border-t pt-2">
                {data!.items
                  .filter((i) => i.health === 'error')
                  .slice(0, 5)
                  .map((i) => (
                    <li key={i.id} className="text-xs flex items-center gap-2">
                      <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                      <span className="truncate">{i.name}</span>
                    </li>
                  ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'ok' | 'warn' | 'bad' | 'muted';
}) {
  const toneCls = {
    ok: 'text-emerald-600 dark:text-emerald-400',
    warn: 'text-amber-600 dark:text-amber-400',
    bad: 'text-rose-600 dark:text-rose-400',
    muted: 'text-muted-foreground',
  }[tone];
  return (
    <div className="rounded-md border p-2 text-center">
      <div className={`text-lg font-semibold ${toneCls}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function SkillAuditCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['system-skill-audit'],
    queryFn: async () => {
      const [skillsRes, failuresRes] = await Promise.all([
        (supabase.from('agent_skills') as any).select('id, enabled, mcp_exposed, requires_staging'),
        (supabase.from('agent_audit_trail') as any)
          .select('id, skill_name, status, created_at')
          .eq('status', 'error')
          .order('created_at', { ascending: false })
          .limit(5),
      ]);
      const skills = (skillsRes.data ?? []) as any[];
      return {
        total: skills.length,
        enabled: skills.filter((s: any) => s.enabled).length,
        mcpExposed: skills.filter((s: any) => s.mcp_exposed && s.enabled).length,
        staged: skills.filter((s: any) => s.requires_staging).length,
        recentFailures: failuresRes.data ?? [],
      };
    },
    refetchInterval: 60_000,
  });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="font-serif flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-violet-500" />
            Skill Audit
          </CardTitle>
          <CardDescription>
            {isLoading
              ? '…'
              : `${data?.enabled ?? 0}/${data?.total ?? 0} enabled · ${data?.mcpExposed ?? 0} MCP-exposed`}
          </CardDescription>
        </div>
        <Link
          to="/admin/skills"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          Open <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-3">
              <Badge variant="secondary">{data?.staged ?? 0} staged ops</Badge>
              <Badge variant="secondary">{(data?.total ?? 0) - (data?.enabled ?? 0)} disabled</Badge>
            </div>
            {(data?.recentFailures.length ?? 0) === 0 ? (
              <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> No recent skill failures
              </p>
            ) : (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Recent failures</p>
                <ul className="space-y-1">
                  {data!.recentFailures.map((f: any) => (
                    <li key={f.id} className="text-xs flex items-center justify-between gap-2">
                      <code className="font-mono truncate">{f.skill_name ?? 'unknown'}</code>
                      <span className="text-muted-foreground shrink-0">{timeAgo(f.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LoginActivityCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['system-recent-auth'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('auth_events')
        .select('id, event_type, email, created_at')
        .order('created_at', { ascending: false })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  const failed = (data ?? []).filter((e: any) => e.event_type === 'failed_login').length;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="font-serif flex items-center gap-2 text-base">
            <LogIn className="h-4 w-4 text-emerald-500" />
            Login Activity
          </CardTitle>
          <CardDescription>
            {isLoading ? '…' : `${data?.length ?? 0} recent · ${failed} failed`}
          </CardDescription>
        </div>
        <Link
          to="/admin/users/login-activity"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          Open <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No auth events yet.</p>
        ) : (
          <ul className="space-y-1.5 max-h-64 overflow-auto">
            {data!.map((e: any) => (
              <li key={e.id} className="flex items-center justify-between gap-2 text-sm py-1">
                <div className="min-w-0 flex-1">
                  <span className="text-xs">{e.event_type}</span>
                  {e.email && (
                    <span className="text-[10px] text-muted-foreground block truncate">{e.email}</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{timeAgo(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// Scheduled-job health (hardening #1, layer 2). Calls the cron-health edge
// function (cron_health_report enriched with staleness via the shared parser)
// and surfaces the failure classes pg_cron's own "succeeded" status hides —
// foreign_host being the headline signal that caught the July fleet incidents.
function CronHealthCard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['cron-health'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('cron-health');
      if (error) throw error;
      return data as {
        cron_available: boolean;
        self_host: string | null;
        jobs: Array<{ jobname: string; schedule: string | null; active: boolean; target_host: string | null; foreign_host: boolean; never_ran: boolean; stale: boolean; unparsed_schedule: boolean; red: boolean; last_status: string | null; last_run: string | null; reasons: string[] }>;
        http_errors_recent: Array<{ status_code: number | null; url: string | null; created: string; error: string | null }>;
        flags: { jobs_total: number; jobs_red: number; jobs_stale: number; jobs_foreign_host: number; http_errors_24h: number };
      };
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const redJobs = (data?.jobs ?? []).filter((j) => j.red);
  const httpErrors = data?.http_errors_recent ?? [];
  const allGreen = !!data?.cron_available && redJobs.length === 0 && httpErrors.length === 0;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="font-serif flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-sky-500" />
            Scheduled Jobs
          </CardTitle>
          <CardDescription>
            {isLoading
              ? '…'
              : error
                ? 'health check unavailable'
                : data?.cron_available === false
                  ? 'no pg_cron on this instance'
                  : allGreen
                    ? `${data?.flags.jobs_total ?? 0} jobs · all healthy`
                    : `${redJobs.length} need attention · ${httpErrors.length} HTTP error(s) 24h`}
          </CardDescription>
        </div>
        <Link to="/admin/automations" className="text-muted-foreground hover:text-foreground">
          <ArrowRight className="h-4 w-4" />
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : allGreen ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Every scheduled job ran on time and self-references this instance.
          </div>
        ) : (
          <div className="space-y-2">
            {redJobs.map((j) => (
              <div key={j.jobname} className="flex items-start gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="font-medium truncate">{j.jobname}</div>
                  <div className="text-xs text-muted-foreground">{j.reasons.join(' · ')}</div>
                </div>
                {j.foreign_host && (
                  <Badge variant="destructive" className="text-[10px] shrink-0">foreign host</Badge>
                )}
              </div>
            ))}
            {httpErrors.length > 0 && (
              <div className="flex items-start gap-2 text-sm pt-1 border-t">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <div className="text-xs text-muted-foreground">
                  {httpErrors.length} HTTP error(s) from cron calls in 24h
                  {httpErrors[0]?.url ? ` — e.g. ${httpErrors[0].status_code ?? 'ERR'} ${httpErrors[0].url}` : ''}
                </div>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground pt-1">
              Note: a job's "succeeded" status only means pg_cron dispatched the command — an HTTP 404/401 still reads as success there.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ObservabilityTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Live signal from the platform — events, automations, skills and auth. Click any card to dive deeper.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <EventBusCard />
        <AutomationQueueCard />
        <SkillAuditCard />
        <LoginActivityCard />
      </div>
      <CronHealthCard />
      <div className="pt-4 border-t">
        <div className="mb-3">
          <h3 className="font-serif text-base font-semibold">MCP Activity</h3>
          <p className="text-xs text-muted-foreground">
            Platform-wide MCP traffic. For peer-centric view see{' '}
            <Link to="/admin/federation" className="underline hover:text-foreground">Federation</Link>.
          </p>
        </div>
        <McpActivityPanel />
      </div>
    </div>
  );
}
