import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Activity, Zap, Sparkles, LogIn, ArrowRight, AlertTriangle, CheckCircle2, Layers, Library, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import instanceManifest from '../../../../supabase/seed/instance-manifest.json';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAgentEvents } from '@/hooks/useAgentEvents';
import { useAutomationHealth } from '@/hooks/useAutomationHealth';
import { useKnowledgeIndexHealth, useRunKnowledgeIndexer, KNOWLEDGE_SOURCES } from '@/hooks/useKnowledgeIndex';
import { McpActivityPanel } from '@/components/admin/developer/McpActivityPanel';
import { InstanceReadinessChecklist } from '@/components/admin/InstanceReadinessChecklist';
import { IntegrationHealthCard } from '@/components/admin/system/IntegrationHealthCard';
import { PerformanceModeCard } from '@/components/admin/system/PerformanceModeCard';
import { PLATFORM_SKILL_NAMES } from '@/lib/platform-seeds';

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
    ok: 'text-success',
    warn: 'text-warning',
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
          .select('id, skill_name, success, error_message, occurred_at')
          .eq('success', false)
          .order('occurred_at', { ascending: false })
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
              <p className="text-sm text-success flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> No recent skill failures
              </p>
            ) : (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Recent failures</p>
                <ul className="space-y-1">
                  {data!.recentFailures.map((f: any) => (
                    <li key={f.id} className="text-xs flex items-center justify-between gap-2">
                      <code className="font-mono truncate">{f.skill_name ?? 'unknown'}</code>
                      <span className="text-muted-foreground shrink-0">{timeAgo(f.occurred_at)}</span>
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

// Scheduled-job health (hardening #1, layer 2). Calls the instance-health edge
// function (cron_health_report enriched with pg_cron's OWN run evidence from
// job_run_details — never the agent-automation cron parser, whose narrower
// dialect false-alarmed on healthy pg_cron jobs in the River incident) and
// surfaces failed runs, never-ran jobs, and foreign_host — the headline signal
// that caught the July fleet incidents.
function CronHealthCard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['cron-health'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('instance-health', { body: { check: 'cron' } });
      if (error) throw error;
      return data as {
        cron_available: boolean;
        self_host: string | null;
        jobs: Array<{ jobname: string; schedule: string | null; active: boolean; target_host: string | null; foreign_host: boolean; never_ran: boolean; last_failed: boolean; red: boolean; last_status: string | null; last_run: string | null; reasons: string[] }>;
        http_errors_recent: Array<{ status_code: number | null; url: string | null; created: string; error: string | null }>;
        flags: { jobs_total: number; jobs_red: number; jobs_failed: number; jobs_foreign_host: number; http_errors_24h: number };
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

// Instance Sync (root fix #2): the bundle CARRIES the repo's desired-state
// manifest (frontend is the one auto-deployed layer, so the expectation is
// always fresh), and instance_sync_status() returns what this instance
// actually runs. Diffing the two answers "did that migration/skill-sync
// actually land?" — a query instead of archaeology.
function LayerRow({ name, ok, detail }: { name: string; ok: boolean | null; detail: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {ok === null
        ? <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        : ok
          ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
          : <AlertTriangle className="h-4 w-4 text-rose-500 mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <span className="font-medium">{name}</span>
        <span className="text-xs text-muted-foreground ml-2">{detail}</span>
      </div>
    </div>
  );
}

function InstanceSyncCard() {
  const expected = instanceManifest.layers;
  const { data, isLoading, error } = useQuery({
    queryKey: ['instance-sync-status'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('instance_sync_status' as never);
      if (error) throw error;
      return data as unknown as {
        schema: { migration_head: string | null; migrations_count: number | null; applied?: Array<{ version: string; name: string }> };
        skills: { total: number | null; enabled: number | null; last_updated_at: string | null; stamp: { seed_hash?: string; stamped_at?: string } | null };
      };
    },
    staleTime: 60_000,
    refetchInterval: 300_000,
  });

  // Schema comparison matches each expected migration by IDENTITY, not by
  // timestamp: a Lovable-managed ledger stamps `version` with the RUN TIME, so
  // a head-timestamp compare false-flags it. A migration counts as applied if
  // the ledger has a row whose version == its timestamp (CLI convention) OR
  // whose name matches its descriptive name (managed convention). Missing =
  // expected but not found — that is the real "did it apply?" answer.
  const applied = data?.schema?.applied ?? null;
  const appliedVersions = new Set((applied ?? []).map((m) => m.version));
  const appliedNames = new Set((applied ?? []).map((m) => m.name));
  const missing = applied === null
    ? []
    : expected.schema.migrations.filter(
        (m) => !appliedVersions.has(m.version)
          && !appliedNames.has(m.name)
          // managed ledgers sometimes store the full <ts>_<name> basename
          && !appliedNames.has(`${m.version}_${m.name}`),
      );
  const schemaOk = applied === null ? null : missing.length === 0;
  const schemaDetail = applied === null
    ? 'ledger unreadable'
    : missing.length === 0
      ? `all ${expected.schema.migrations_count} migrations applied`
      : `${missing.length} migration(s) MISSING — e.g. ${missing.slice(0, 2).map((m) => m.name).join(', ')}${missing.length > 2 ? '…' : ''}`;

  // Floor check before stamp check. A never-seeded instance has NO stamp, and
  // "no stamp yet" reads as a neutral grey — so the loudest possible failure
  // (the agent surface was never built at all: measured 6 skills on a fresh
  // replay vs 537 on a mature instance) rendered as a shrug. Carrying fewer
  // skills than the platform layer alone requires is not ambiguous: the 4th
  // deploy layer never landed. That is red.
  const platformFloor = PLATFORM_SKILL_NAMES.length;
  const skillsTotal = data?.skills?.total ?? null;
  const belowFloor = skillsTotal !== null && skillsTotal < platformFloor;

  const stampHash = data?.skills?.stamp?.seed_hash ?? null;
  const skillsOk = belowFloor ? false : stampHash === null ? null : stampHash === expected.skills.seed_hash;
  const skillsDetail = belowFloor
    ? `only ${skillsTotal} skill(s) — below the ${platformFloor}-skill platform floor. The skills layer was never seeded; the agent surface is empty. Run "Sync skills from code" in Modules.`
    : stampHash === null
      ? `${data?.skills?.enabled ?? '…'} enabled — no sync stamp yet (run "Sync skills from code" once to stamp)`
      : skillsOk
        ? `bundle in sync (${data?.skills?.enabled ?? 0} enabled)`
        : 'seed bundle OUT OF DATE — run "Sync skills from code" (hard-refresh /admin/modules first)';

  const allKnownGreen = schemaOk === true && skillsOk === true;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="font-serif flex items-center gap-2 text-base">
            <Layers className="h-4 w-4 text-teal-500" />
            Instance Sync
          </CardTitle>
          <CardDescription>
            {isLoading ? '…' : error ? 'status RPC unavailable (instance-sync-status migration not applied?)' : allKnownGreen ? 'all measurable layers in sync with this build' : 'layer drift vs this build'}
          </CardDescription>
        </div>
        <Link to="/admin/modules" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          Modules <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : error ? (
          <p className="text-sm text-muted-foreground">Could not read instance state — apply the instance-sync-status migration on this instance.</p>
        ) : (
          <div className="space-y-2">
            <LayerRow name="Schema" ok={schemaOk} detail={schemaDetail} />
            <LayerRow name="Skills" ok={skillsOk} detail={skillsDetail} />
            <LayerRow name="Edge functions" ok={null} detail={`${expected.edge_functions.count} expected by this build — actual deploy state is CLI-verified (fleet tooling), not DB-visible`} />
            <LayerRow name="Frontend" ok={true} detail={`this build (expects schema ${expected.schema.migration_head}, ${expected.skills.skill_count} skills)`} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The Knowledge Index is a platform SERVICE — one index, every grounded
 * surface. It has no module toggle (like the Skill Relevance Engine), which is
 * exactly why it needs a window: an empty index is invisible everywhere except
 * in the answers, which merely get vaguer. On 2026-08-12 a fresh instance ran
 * for a day with zero chunks and a chat that invented pages; nothing in the UI
 * said so. This card says so.
 */
function KnowledgeIndexCard() {
  const { data, isLoading } = useKnowledgeIndexHealth();
  const runIndexer = useRunKnowledgeIndexer();
  const { toast } = useToast();

  const SOURCE_LABELS: Record<string, string> = {
    pages: 'Pages',
    kb_articles: 'Knowledge Base',
    wiki_pages: 'Wiki',
    docs_pages: 'Docs',
    handbook_chapters: 'Handbook',
    documents: 'Documents',
  };

  const empty = !isLoading && (data?.totalChunks ?? 0) === 0;
  const backlog = (data?.queueDepth ?? 0) > 0;

  const handleRun = async (fullReindex = false) => {
    try {
      const res = await runIndexer.mutateAsync(fullReindex ? { fullReindex: true } : {});
      toast({
        title: fullReindex ? 'Full reindex queued' : 'Indexer swept',
        description: fullReindex
          ? `${res.queued ?? 0} item(s) queued — the sweep runs every 5 minutes and drains them in bounded slices; press Sweep now to start at once`
          : `${res.indexed_chunks ?? 0} chunk(s) indexed · ${res.processed ?? 0} item(s) processed`,
      });
    } catch (e) {
      toast({
        title: 'Indexer run failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="font-serif flex items-center gap-2 text-base">
            <Library className="h-4 w-4 text-sky-500" />
            Knowledge Index
          </CardTitle>
          <CardDescription>
            {isLoading
              ? '…'
              : `${data?.totalChunks ?? 0} chunk(s) · ${data?.queueDepth ?? 0} queued · updated ${timeAgo(data?.lastIndexedAt ?? null)}`}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => handleRun(false)} disabled={runIndexer.isPending}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${runIndexer.isPending ? 'animate-spin' : ''}`} />
            Sweep now
          </Button>
          {/* Sweep drains the QUEUE, and only an edited entity is ever queued.
              When the indexer's own rules change — a widened content hash, a
              re-enabled module — nothing edits the content, so nothing is
              queued, and the stale rows are never revisited. This re-queues
              every entity so the current rules are applied to all of them.
              Chunks whose text is unchanged keep their embedding, so a full
              reindex costs no provider spend. */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleRun(true)}
            disabled={runIndexer.isPending}
            title="Re-queue every entity and re-apply the current indexing rules. Unchanged text keeps its embedding, so this costs no AI spend."
          >
            Reindex all
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <div className="space-y-2">
            {empty && (
              <p className="text-sm text-amber-600 dark:text-amber-500 flex items-start gap-1.5">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Nothing indexed yet — grounded answers fall back to full-text until the first sweep
                  completes. Press <strong>Sweep now</strong> to start it.
                </span>
              </p>
            )}
            {backlog && !empty && (
              <p className="text-xs text-muted-foreground">
                {data?.queueDepth} item(s) waiting for the next sweep (runs every 5 minutes).
              </p>
            )}
            {(data?.missingEmbedding ?? 0) > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                {data?.missingEmbedding} chunk(s) without an embedding
                {data?.gaveUp ? ` — ${data.gaveUp} parked after 5 failed attempts` : ' — the sweep embeds 80 per run'}
                {data?.lastEmbeddingError
                  ? <>. Last provider error{data.lastEmbeddingErrorAt ? ` (${timeAgo(data.lastEmbeddingErrorAt)})` : ''}: <span className="font-mono">{data.lastEmbeddingError.slice(0, 200)}</span></>
                  : '.'}
              </p>
            )}
            {data?.bounded && (
              <p className="text-xs text-muted-foreground">
                Counts come from a client read capped at 1,000 rows — this instance lacks the stats function; run the pending migration for whole numbers.
              </p>
            )}
            {/* A file waiting to become text has no chunks, so every count below
                reports it as absent. Say it out loud instead. */}
            {(() => {
              const w = data?.documentsAwaitingText;
              if (!w) return null;
              const queued = w.pending + w.processing;
              return (
                <>
                  {queued > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {queued} uploaded file(s) still being read — they join the index once
                      their text is extracted.
                    </p>
                  )}
                  {w.failed > 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-500">
                      {w.failed} upload(s) could not be read. They are not retried
                      automatically — re-upload to try again.
                    </p>
                  )}
                  {w.unsupported > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {w.unsupported} upload(s) are of a file type this instance cannot read
                      yet (PDF only).
                    </p>
                  )}
                </>
              );
            })()}
            <ul className="space-y-1">
              {KNOWLEDGE_SOURCES.map((src) => (
                <li key={src} className="flex items-center justify-between text-sm py-0.5">
                  <span className="text-muted-foreground">{SOURCE_LABELS[src] ?? src}</span>
                  <span className="font-mono text-xs">{data?.bySource?.[src] ?? 0}</span>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-muted-foreground pt-1">
              One index, every grounded surface — visitor chat sees public content, staff surfaces
              also see internal.
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
        <KnowledgeIndexCard />
        <IntegrationHealthCard />
      </div>
      {/*
        The provisioning checklist keeps a home here after it has vanished from
        the dashboard. `alwaysShow` is correct on THIS page and nowhere else:
        Observability is a page you open on purpose, so a green checklist is an
        answer ("yes, this instance was finished"), not furniture.
      */}
      <InstanceReadinessChecklist variant="compact" alwaysShow />
      <InstanceSyncCard />
      <CronHealthCard />
      <PerformanceModeCard />
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
