import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { GitBranch, GitCommit, Boxes, Database, Clock, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useDeployedEdgeFunctions } from '@/hooks/useDeployedEdgeFunctions';

/**
 * Deploy Status panel — single-glance answer to "what version of FlowWink is
 * running on this instance?". Three layers:
 *
 *   1. Frontend      — git commit + branch injected at build time via
 *                      vite.config.ts `define`, plus build timestamp.
 *   2. Edge functions — list of functions last deployed by
 *                      `flowwink.sh /update-funcs`, read from
 *                      `site_settings.edge_functions_deployed`. Supabase does
 *                      not expose per-function version hashes to our anon key,
 *                      so this is the closest deploy-truth we have client-side.
 *   3. Database      — most recent migrations from the Supabase migrations
 *                      ledger, exposed via `get_recent_migrations()` RPC.
 *
 * Purpose: catch the classic 4-layer drift (schema / skills / edge / frontend)
 * without needing SSH or the Supabase dashboard.
 */
export function DeployStatusPanel() {
  const gitCommit = typeof __GIT_COMMIT__ !== 'undefined' ? __GIT_COMMIT__ : 'unknown';
  const gitCommitFull = typeof __GIT_COMMIT_FULL__ !== 'undefined' ? __GIT_COMMIT_FULL__ : '';
  const gitBranch = typeof __GIT_BRANCH__ !== 'undefined' ? __GIT_BRANCH__ : 'unknown';
  const gitDate = typeof __GIT_COMMIT_DATE__ !== 'undefined' ? __GIT_COMMIT_DATE__ : '';
  const buildTime = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';

  const { data: deployed } = useDeployedEdgeFunctions();

  const migrationsQuery = useQuery({
    queryKey: ['deploy-status', 'recent-migrations'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_recent_migrations', { p_limit: 10 });
      if (error) throw error;
      return (data ?? []) as { version: string; name: string }[];
    },
    staleTime: 60_000,
  });

  const commitHref = gitCommitFull && gitCommitFull !== 'unknown'
    ? `https://github.com/${gitBranch === 'unknown' ? '' : ''}/commit/${gitCommitFull}`
    : null;

  return (
    <div className="rounded-lg border bg-card">
      <div className="px-4 pt-4 pb-2 flex items-center gap-2">
        <Boxes className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Deploy Status</h2>
        <span className="text-xs text-muted-foreground ml-2">
          What's actually running on this instance right now.
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
              committed {(() => { try { return formatDistanceToNow(parseISO(gitDate), { addSuffix: true }); } catch { return gitDate; } })()}
            </p>
          )}
          {buildTime && (
            <p className="text-[10px] text-muted-foreground">
              built {(() => { try { return formatDistanceToNow(parseISO(buildTime), { addSuffix: true }); } catch { return buildTime; } })()}
            </p>
          )}
          {commitHref && (
            <a
              href={commitHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-primary inline-flex items-center gap-1 hover:underline"
            >
              open on GitHub <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>

        {/* ── 2. Edge functions ── */}
        <div className="rounded-md border bg-muted/20 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium">
            <Boxes className="h-3.5 w-3.5 text-primary" />
            Edge functions
            {deployed?.functions && (
              <Badge variant="secondary" className="text-[10px]">
                {deployed.functions.length} deployed
              </Badge>
            )}
          </div>
          {deployed?.functions === null || deployed === undefined ? (
            <p className="text-[11px] text-muted-foreground">
              No deploy record. Run <code className="text-[10px] bg-muted px-1 rounded">flowwink.sh /update-funcs</code> to
              populate — until then this instance's edge-function version is unknown.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                {deployed.functions.slice(0, 40).map((fn) => (
                  <span
                    key={fn}
                    className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded border border-border/40"
                  >
                    {fn}
                  </span>
                ))}
                {deployed.functions.length > 40 && (
                  <span className="text-[10px] text-muted-foreground self-center">
                    +{deployed.functions.length - 40} more
                  </span>
                )}
              </div>
              {deployed.updatedAt && (
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  last synced {(() => { try { return formatDistanceToNow(parseISO(deployed.updatedAt), { addSuffix: true }); } catch { return deployed.updatedAt; } })()}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground/70">
                Per-function version hashes aren't exposed to the client — this list is the deploy
                script's declared set.
              </p>
            </>
          )}
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
