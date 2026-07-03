import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, parseISO } from 'date-fns';
import {
  GitBranch, GitCommit, Boxes, Database, Clock, ExternalLink,
  CheckCircle2, AlertTriangle, HelpCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useDeployedEdgeFunctions } from '@/hooks/useDeployedEdgeFunctions';
import { useRequiredEdgeFunctions } from '@/hooks/useRequiredEdgeFunctions';

/**
 * Deploy Status panel — the drift dashboard.
 *
 * Supabase Studio already lists every deployed function with its version and
 * timestamp; duplicating that is low-value. What Supabase *cannot* show is
 * "does the deployed set match what this repo/DB says should be deployed?".
 * That's the gap this panel fills.
 *
 * Three sections:
 *   1. Frontend   — git commit + branch injected at build time.
 *   2. Edge drift — compares functions required by enabled `agent_skills`
 *                   (source of truth for what the instance expects) against
 *                   the last deploy manifest written by `flowwink.sh
 *                   /update-funcs` into `site_settings.edge_functions_deployed`.
 *                   Missing = deploy is stale; skill hash drift is a separate
 *                   signal covered by the Instance Health card above.
 *   3. Migrations — last 10 rows from the Supabase migrations ledger via
 *                   `get_recent_migrations()` RPC.
 */
export function DeployStatusPanel() {
  const gitCommit = typeof __GIT_COMMIT__ !== 'undefined' ? __GIT_COMMIT__ : 'unknown';
  const gitCommitFull = typeof __GIT_COMMIT_FULL__ !== 'undefined' ? __GIT_COMMIT_FULL__ : '';
  const gitBranch = typeof __GIT_BRANCH__ !== 'undefined' ? __GIT_BRANCH__ : 'unknown';
  const gitDate = typeof __GIT_COMMIT_DATE__ !== 'undefined' ? __GIT_COMMIT_DATE__ : '';
  const buildTime = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';

  const deployedQ = useDeployedEdgeFunctions();
  const requiredQ = useRequiredEdgeFunctions();

  const drift = useMemo(() => {
    const required = requiredQ.data ?? [];
    const deployed = deployedQ.data?.functions;
    if (!deployed) return { state: 'unknown' as const, required, missing: [] as string[], extra: [] as string[] };
    const deployedSet = new Set(deployed);
    const requiredSet = new Set(required);
    return {
      state: 'known' as const,
      required,
      missing: required.filter((fn) => !deployedSet.has(fn)),
      extra: deployed.filter((fn) => !requiredSet.has(fn)),
    };
  }, [requiredQ.data, deployedQ.data]);

  const migrationsQuery = useQuery({
    queryKey: ['deploy-status', 'recent-migrations'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_recent_migrations', { p_limit: 10 });
      if (error) throw error;
      return (data ?? []) as { version: string; name: string }[];
    },
    staleTime: 60_000,
  });

  return (
    <div className="rounded-lg border bg-card">
      <div className="px-4 pt-4 pb-2 flex items-center gap-2">
        <Boxes className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Deploy Status</h2>
        <span className="text-xs text-muted-foreground ml-2">
          Drift check — where the running instance diverges from the repo.
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4">
        {/* ── 1. Frontend ── */}
        <div className="rounded-md border bg-muted/20 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium">
            <GitBranch className="h-3.5 w-3.5 text-primary" />
            Frontend
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="font-mono text-[11px]">
              <GitCommit className="h-3 w-3 mr-1" />
              {gitCommit}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">{gitBranch}</Badge>
          </div>
          {gitDate && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              committed {safeRelative(gitDate)}
            </p>
          )}
          {buildTime && (
            <p className="text-[10px] text-muted-foreground">
              built {safeRelative(buildTime)}
            </p>
          )}
          {gitCommitFull && gitCommitFull !== 'unknown' && (
            <p className="text-[10px] text-muted-foreground font-mono truncate" title={gitCommitFull}>
              {gitCommitFull}
            </p>
          )}
        </div>

        {/* ── 2. Edge functions drift ── */}
        <div className="rounded-md border bg-muted/20 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium">
            <Boxes className="h-3.5 w-3.5 text-primary" />
            Edge functions
            <EdgeStatusBadge drift={drift} />
          </div>

          {(requiredQ.isLoading || deployedQ.isLoading) && (
            <p className="text-[11px] text-muted-foreground">Loading…</p>
          )}

          {drift.state === 'unknown' && !requiredQ.isLoading && (
            <p className="text-[11px] text-muted-foreground">
              No deploy manifest recorded. On self-hosted instances,
              <code className="text-[10px] bg-muted px-1 rounded mx-0.5">flowwink.sh /update-funcs</code>
              writes to <code className="text-[10px] bg-muted px-1 rounded">site_settings.edge_functions_deployed</code>
              after each deploy. Until it runs, drift can't be detected — use the Supabase Functions view for the source of truth.
            </p>
          )}

          {drift.state === 'known' && drift.missing.length === 0 && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              All {drift.required.length} required functions are in the last deploy.
            </p>
          )}

          {drift.state === 'known' && drift.missing.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-warning flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                {drift.missing.length} required function{drift.missing.length === 1 ? '' : 's'} missing from last deploy
              </p>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                {drift.missing.map((fn) => (
                  <span
                    key={fn}
                    className="font-mono text-[10px] bg-warning/10 text-warning border border-warning/30 px-1.5 py-0.5 rounded"
                  >
                    {fn}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Run <code className="bg-muted px-1 rounded">flowwink.sh /update-funcs</code> to deploy the current repo.
              </p>
            </div>
          )}

          {drift.state === 'known' && (
            <p className="text-[10px] text-muted-foreground">
              {drift.required.length} required · {deployedQ.data?.functions?.length ?? 0} deployed
              {deployedQ.data?.updatedAt && <> · last sync {safeRelative(deployedQ.data.updatedAt)}</>}
            </p>
          )}

          <p className="text-[10px] text-muted-foreground/70">
            Per-function version + timestamp lives in the Supabase Functions view.
            <a
              href="https://supabase.com/dashboard/project/_/functions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary inline-flex items-center gap-0.5 hover:underline ml-1"
            >
              Open <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </p>
        </div>

        {/* ── 3. Database migrations ── */}
        <div className="rounded-md border bg-muted/20 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium">
            <Database className="h-3.5 w-3.5 text-primary" />
            Migrations
            {migrationsQuery.data && (
              <Badge variant="secondary" className="text-[10px]">
                latest {migrationsQuery.data.length}
              </Badge>
            )}
          </div>
          {migrationsQuery.isLoading && (
            <p className="text-[11px] text-muted-foreground">Loading…</p>
          )}
          {migrationsQuery.isError && (
            <p className="text-[11px] text-destructive">
              Could not read migration ledger: {(migrationsQuery.error as Error).message}
            </p>
          )}
          {migrationsQuery.data && migrationsQuery.data.length === 0 && (
            <p className="text-[11px] text-muted-foreground">No migrations recorded.</p>
          )}
          {migrationsQuery.data && migrationsQuery.data.length > 0 && (
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {migrationsQuery.data.map((m) => {
                const ts = parseMigrationVersion(m.version);
                return (
                  <li key={m.version} className="text-[10px] font-mono flex items-baseline gap-2">
                    <span className="text-muted-foreground shrink-0">{m.version.slice(0, 14)}</span>
                    <span className="truncate text-foreground/80" title={m.name}>
                      {m.name || <em className="text-muted-foreground">(unnamed)</em>}
                    </span>
                    {ts && (
                      <span className="ml-auto text-muted-foreground text-[9px] shrink-0">
                        {formatDistanceToNow(ts, { addSuffix: true })}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function EdgeStatusBadge({
  drift,
}: {
  drift:
    | { state: 'unknown'; missing: string[] }
    | { state: 'known'; missing: string[] };
}) {
  if (drift.state === 'unknown') {
    return (
      <Badge variant="secondary" className="text-[10px]">
        <HelpCircle className="h-3 w-3 mr-1" /> unknown
      </Badge>
    );
  }
  if (drift.missing.length === 0) {
    return (
      <Badge variant="default" className="text-[10px]">
        <CheckCircle2 className="h-3 w-3 mr-1" /> in sync
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="text-[10px]">
      <AlertTriangle className="h-3 w-3 mr-1" /> {drift.missing.length} missing
    </Badge>
  );
}

function safeRelative(iso: string): string {
  try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }); }
  catch { return iso; }
}

/**
 * Supabase migration versions are `YYYYMMDDHHMMSS` — parse into a Date so we
 * can show a relative timestamp next to each row.
 */
function parseMigrationVersion(v: string): Date | null {
  if (!/^\d{14}/.test(v)) return null;
  const y = Number(v.slice(0, 4));
  const mo = Number(v.slice(4, 6)) - 1;
  const d = Number(v.slice(6, 8));
  const h = Number(v.slice(8, 10));
  const mi = Number(v.slice(10, 12));
  const s = Number(v.slice(12, 14));
  const dt = new Date(Date.UTC(y, mo, d, h, mi, s));
  return isNaN(dt.getTime()) ? null : dt;
}
