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
        supabase.from('agent_skills').select('id, enabled, mcp_exposed, requires_staging'),
        supabase
          .from('agent_audit_trail')
          .select('id, skill_name, status, created_at')
          .eq('status', 'error')
          .order('created_at', { ascending: false })
          .limit(5),
      ]);
      const skills = skillsRes.data ?? [];
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
    </div>
  );
}
