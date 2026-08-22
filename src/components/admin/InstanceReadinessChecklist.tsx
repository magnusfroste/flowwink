/**
 * Instance Readiness — the first screen that makes a half-provisioned instance
 * impossible to miss.
 *
 * Magnus, on why this exists: "What makes today's onboarding risky is not that
 * steps are missing — it's that they are invisible. An admin lands on a
 * dashboard that looks healthy while the agent surface is empty and the
 * automation file is dead."
 *
 * WHERE IT LIVES: the top of /admin — the page every first login lands on —
 * and it renders NOTHING once every measurable layer is complete. A mature
 * instance never sees it. The same component renders in `compact` mode inside
 * /admin/system → Observability, where it stays reachable after it has
 * disappeared from the dashboard (that page is where you go looking).
 *
 * WHAT IT IS NOT: a settings page. Every row is a VIEW over a decision that
 * already lives somewhere else — the migration ledger, agent_skills, cron.job,
 * site_settings. Nothing here stores state, and there is no dismiss button:
 * hiding a red row would be the same silent half-success the surface exists to
 * expose. It disappears by being satisfied, or not at all.
 *
 * The measurement rules and the visibility rule are pure and tested in
 * `src/lib/instance-readiness.ts`.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  HelpCircle,
  Loader2,
  Rocket,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import instanceManifest from '../../../supabase/seed/instance-manifest.json';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useDeployedEdgeFunctions } from '@/hooks/useDeployedEdgeFunctions';
import { useIntegrationStatus, useIsAIConfigured } from '@/hooks/useIntegrationStatus';
import { ensurePlatformCron, ensureSkillRegistry } from '@/lib/module-bootstrap';
import { bootstrapPlatform, PLATFORM_SKILL_NAMES } from '@/lib/platform-seeds';
import { logger } from '@/lib/logger';
import {
  evaluateInstanceReadiness,
  blockingRows,
  isInstanceReady,
  type CronJobState,
  type ReadinessRow,
  type ReadinessStatus,
} from '@/lib/instance-readiness';

interface SyncStatus {
  schema: {
    migration_head: string | null;
    migrations_count: number | null;
    applied?: Array<{ version: string; name: string }>;
  };
  skills: {
    total: number | null;
    enabled: number | null;
    last_updated_at: string | null;
    stamp: { seed_hash?: string; stamped_at?: string } | null;
  };
}

interface CronReport {
  cron_available: boolean;
  jobs: CronJobState[];
}

/**
 * Reads every layer this instance can actually be asked about.
 *
 * Cost on a healthy instance: two admin RPCs and two `site_settings` reads,
 * cached for five minutes and shared with the Observability tab through the
 * same query keys. Nothing polls.
 */
export function useInstanceReadiness() {
  // Provisioning state is admin-only by construction: instance_sync_status()
  // and cron_health_report() both refuse a non-admin caller. Asking anyway
  // would turn a permission denial into a fake "could not read" alarm on a
  // salesperson's dashboard — permission-denied dressed up as absent data.
  const { isAdmin } = useAuth();

  const syncQ = useQuery({
    // Same key as the Instance Sync card — one read serves both surfaces.
    queryKey: ['instance-sync-status'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('instance_sync_status' as never);
      if (error) throw error;
      return data as unknown as SyncStatus;
    },
    staleTime: 60_000,
    enabled: isAdmin,
  });

  // The RPC, not the instance-health edge function: a half-provisioned instance
  // is precisely where an edge function might not be there, and this row must
  // still be able to answer. cron_health_report() ships with the schema.
  const cronQ = useQuery({
    queryKey: ['cron-health-report'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cron_health_report' as never);
      if (error) throw error;
      return data as unknown as CronReport;
    },
    staleTime: 300_000,
    enabled: isAdmin,
  });

  // One read for both human-decision rows.
  const settingsQ = useQuery({
    queryKey: ['instance-readiness', 'settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('key, value')
        .in('key', ['general', 'modules']);
      if (error) throw error;
      const rows = data ?? [];
      const general = rows.find((r) => r.key === 'general')?.value as { siteUrl?: string } | null;
      const modulesValue = (rows.find((r) => r.key === 'modules')?.value ?? null) as Record<
        string,
        Record<string, unknown>
      > | null;
      const entries = modulesValue ? Object.values(modulesValue).filter((m) => m && typeof m === 'object') : [];
      return {
        siteUrl: (general?.siteUrl ?? '').trim() || null,
        // The row exists from birth (ensure_modules_settings), so presence is
        // no longer evidence of a decision. The birth seed writes exactly
        // {enabled}; the admin Save path writes the whole module object. See
        // the `modules` row in instance-readiness.ts.
        modulesChosen: entries.some((m) => Object.keys(m).some((k) => k !== 'enabled')),
        modulesEnabled: modulesValue ? entries.filter((m) => m.enabled === true).length : null,
      };
    },
    staleTime: 60_000,
    enabled: isAdmin,
  });

  // Skill COVERAGE — not the row count.
  //
  // "Hur många rader finns i agent_skills" kan inte se ett hål: instansen som
  // bar 96 av 347 skills (commerce/contracts/subscriptions/invoicing/tickets/
  // sla/field-service påslagna och tomma) lyste grönt på radantalet. Kravet
  // kommer ur seed-artefakten som deployen bär, korsat med modulraden — och det
  // finns bara EN plats som kan göra den korsningen billigt: servern, i
  // sync_skills_from_code, som är samma skrivare som seedar raderna.
  //
  // Anropet är också reparationen (idempotent, skriver bara när något fattas),
  // deduplicerat per sidladdning i ensureSkillRegistry — samma mätning som
  // admin-skalet redan gör, inte en andra.
  const coverageQ = useQuery({
    queryKey: ['skill-registry-coverage'],
    queryFn: () => ensureSkillRegistry(),
    staleTime: 60_000,
    enabled: isAdmin,
  });

  const edgeQ = useDeployedEdgeFunctions();
  const secretsQ = useIntegrationStatus();
  const aiConfigured = useIsAIConfigured();

  const isLoading =
    !isAdmin ||
    syncQ.isLoading ||
    cronQ.isLoading ||
    settingsQ.isLoading ||
    // Utan den här skulle raden hinna lysa grönt på radantalet innan täckningen
    // svarat — en falsk grön bock i en halv sekund är fortfarande en lögn.
    coverageQ.isLoading ||
    edgeQ.isLoading ||
    secretsQ.isLoading;

  const rows = useMemo(() => {
    const expected = instanceManifest.layers;
    return evaluateInstanceReadiness({
      schema: {
        applied: syncQ.data?.schema?.applied ?? null,
        expected: expected.schema.migrations,
      },
      skills: {
        total: syncQ.data?.skills?.total ?? null,
        enabled: syncQ.data?.skills?.enabled ?? null,
        stampHash: syncQ.data?.skills?.stamp?.seed_hash ?? null,
        expectedHash: expected.skills.seed_hash,
        expectedCount: expected.skills.skill_count,
        platformFloor: PLATFORM_SKILL_NAMES.length,
        // `expected: 0` betyder "servern kunde inte mäta" (fel, eller ett svar
        // utan täckningsblock från en äldre deployad agent-execute) — det ska
        // läsa som "vet inte", aldrig som "inget krävs".
        requiredByEnabledModules:
          coverageQ.data && coverageQ.data.expected > 0 ? coverageQ.data.expected : null,
        missingForEnabledModules:
          coverageQ.data && coverageQ.data.expected > 0 ? coverageQ.data.missing : null,
        missingSample: coverageQ.data?.missingNames ?? [],
      },
      edge: {
        deployed: edgeQ.data?.functions ?? null,
        deployedAt: edgeQ.data?.updatedAt ?? null,
        expected: Object.keys(expected.edge_functions.functions),
      },
      cron: {
        jobs: cronQ.data?.jobs ?? null,
        available: cronQ.data ? cronQ.data.cron_available : null,
      },
      ai: { configured: secretsQ.isError ? null : secretsQ.data ? aiConfigured : null },
      siteUrl: {
        configured: settingsQ.data?.siteUrl ?? null,
        origin: typeof window !== 'undefined' ? window.location.origin : '',
        // Avgör moln vs self-hosted: en self-hosted stack har varken dashboard
        // eller Management-API, så andra halvan sätts som miljövariabel.
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? null,
      },
      modules: {
        chosen: settingsQ.isError ? null : settingsQ.data ? settingsQ.data.modulesChosen : null,
        enabledCount: settingsQ.data?.modulesEnabled ?? null,
      },
    });
  }, [syncQ.data, cronQ.data, settingsQ.data, settingsQ.isError, coverageQ.data, edgeQ.data, secretsQ.data, secretsQ.isError, aiConfigured]);

  return {
    rows,
    blocking: blockingRows(rows),
    ready: isInstanceReady(rows),
    isLoading,
  };
}

const STATUS_META: Record<
  ReadinessStatus,
  { icon: typeof CheckCircle2; className: string; label: string }
> = {
  ok: { icon: CheckCircle2, className: 'text-emerald-500', label: 'done' },
  blocked: { icon: AlertTriangle, className: 'text-destructive', label: 'not done' },
  drift: { icon: AlertTriangle, className: 'text-amber-500', label: 'drift' },
  unverifiable: { icon: HelpCircle, className: 'text-muted-foreground', label: "can't be measured here" },
  unknown: { icon: CircleDashed, className: 'text-amber-500', label: 'could not read' },
};

function RowAction({
  row,
  onRun,
  running,
}: {
  row: ReadinessRow;
  onRun: (id: 'seed-skills' | 'register-cron' | 'set-site-url') => void;
  running: string | null;
}) {
  const action = row.action;
  if (!action) return null;

  if (action.kind === 'run') {
    const busy = running === action.id;
    return (
      <Button size="sm" variant="outline" disabled={!!running} onClick={() => onRun(action.id)}>
        {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
        {busy ? 'Running…' : action.label}
      </Button>
    );
  }

  if (action.kind === 'link') {
    return (
      <Button size="sm" variant="outline" asChild>
        <Link to={action.to}>
          {action.label}
          <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
        </Link>
      </Button>
    );
  }

  return (
    <Button size="sm" variant="outline" asChild>
      <a href={action.href} target="_blank" rel="noopener noreferrer">
        {action.label}
        <ExternalLink className="h-3 w-3 ml-1.5" />
      </a>
    </Button>
  );
}

function ChecklistRow({
  row,
  compact,
  onRun,
  running,
}: {
  row: ReadinessRow;
  compact: boolean;
  onRun: (id: 'seed-skills' | 'register-cron' | 'set-site-url') => void;
  running: string | null;
}) {
  const meta = STATUS_META[row.status];
  const Icon = meta.icon;
  const settled = row.status === 'ok';

  return (
    <div className="flex items-start gap-3 py-3">
      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${meta.className}`} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{row.label}</span>
          {!settled && (
            <Badge variant="outline" className="text-[10px] font-normal">
              {meta.label}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{row.detail}</p>
        {/* Pedagogy belongs here, not in a runbook: an operator who does not
            know WHY a step matters will skip it and never find out. Only shown
            for steps that still need attention — a green row is finished
            teaching. */}
        {!settled && !compact && <p className="text-xs text-muted-foreground/90">{row.why}</p>}
        {!settled && row.note && (
          <p className="text-xs text-muted-foreground/90 border-l-2 border-border pl-2">{row.note}</p>
        )}
        {!compact && (
          <p className="text-[11px] text-muted-foreground/70">
            <span className="uppercase tracking-wide">measured from</span> {row.measuredBy}
          </p>
        )}
      </div>
      {!settled && (
        <div className="shrink-0">
          <RowAction row={row} onRun={onRun} running={running} />
        </div>
      )}
    </div>
  );
}

export interface InstanceReadinessChecklistProps {
  /** `compact` drops the pedagogy and provenance lines — for diagnostics pages. */
  variant?: 'full' | 'compact';
  /**
   * Render even when nothing is blocking. Only for surfaces you visit ON
   * PURPOSE (Observability). The dashboard must never pass this — an
   * always-present checklist is furniture, and furniture is ignored.
   */
  alwaysShow?: boolean;
}

export function InstanceReadinessChecklist({
  variant = 'full',
  alwaysShow = false,
}: InstanceReadinessChecklistProps) {
  const { rows, blocking, ready, isLoading } = useInstanceReadiness();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [running, setRunning] = useState<string | null>(null);
  const compact = variant === 'compact';

  /**
   * Läs om varje rad åtgärderna kan ha ändrat — och VÄNTA IN läsningen.
   *
   * `['instance-readiness','settings']` saknades här, vilket är varför en satt
   * site-URL krävde en manuell omladdning för att synas: skrivningen gick
   * igenom, raden läste kvar gammal data, och kortet såg ut att ignorera
   * klicket. Await:en gör att raderna hunnit uppdateras innan resultatet
   * påstås — samma regel som allt annat här: verifiera, lita inte.
   */
  // Minns om den här mountningen någonsin haft något att göra — grunden för
  // klart-läget nedan. En ref, inte state: den ska inte trigga en rendering,
  // bara färga den sista.
  //
  // `!isLoading` är inte kosmetik utan hela villkoret. `ready` härleds ur rader
  // som är `unknown` innan datan finns, så FÖRSTA renderingen på varje
  // sidladdning har ready=false. Utan laddningsvakten sattes flaggan där, på
  // varje instans, och kortet kunde aldrig försvinna igen — vilket är precis
  // vad som hände på nordbrygg: allt grönt, "This instance is set up", och
  // kortet låg kvar. Kvittot ska bara minnas ARBETE, inte ovisshet.
  const [receiptAcknowledged, setReceiptAcknowledged] = useState(false);
  const hadWorkRef = useRef(false);
  if (!isLoading && !ready) hadWorkRef.current = true;
  const hadWork = hadWorkRef.current;

  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['instance-sync-status'] }),
      queryClient.invalidateQueries({ queryKey: ['instance-readiness', 'settings'] }),
      queryClient.invalidateQueries({ queryKey: ['cron-health-report'] }),
      queryClient.invalidateQueries({ queryKey: ['cron-health'] }),
      queryClient.invalidateQueries({ queryKey: ['agent-skills'] }),
      queryClient.invalidateQueries({ queryKey: ['agent-automations'] }),
      queryClient.invalidateQueries({ queryKey: ['skill-registry-coverage'] }),
    ]);
  }, [queryClient]);

  const handleRun = useCallback(
    async (id: 'seed-skills' | 'register-cron' | 'set-site-url') => {
      setRunning(id);
      try {
        if (id === 'seed-skills') {
          const platform = await bootstrapPlatform();
          const registry = await ensureSkillRegistry({ fresh: true });
          await invalidate();
          // Verify, don't trust: the seeder's own report is a claim. Re-read
          // the registry and quote the number that came back.
          const { count } = await supabase
            .from('agent_skills')
            .select('id', { count: 'exact', head: true });
          // "Klar" är inte "körningen svarade utan fel" — det är "hålet är
          // borta". registry.missing kommer ur serverns återläsning, så en
          // halvlyckad seedning kan inte stämpla sig grön.
          const failed =
            platform.errors.length > 0 || registry.status === 'error' || registry.missing > 0;

          // Stamp the instance with the seed bundle that was just applied —
          // ONLY on a fully clean run, exactly as the Modules page does.
          //
          // Without this the button could never turn its own row green: the
          // skills row asks for the stamp (rows alone prove nothing about
          // WHICH build the definitions came from), and this path seeded
          // without ever writing one. Verified on nordbrygg 2026-08-22 —
          // 65 skills present, stamp absent, row stuck at "not done" while
          // the seeding had in fact succeeded. A partial run still must not
          // stamp: a half-synced registry has to keep reading as out-of-date.
          if (!failed) {
            const { error: stampError } = await supabase
              .from('site_settings')
              .upsert(
                {
                  key: 'instance_manifest_stamp',
                  value: {
                    seed_hash: instanceManifest.layers.skills.seed_hash,
                    skill_count: instanceManifest.layers.skills.skill_count,
                    stamped_at: new Date().toISOString(),
                  },
                } as never,
                { onConflict: 'key' },
              );
            if (stampError) {
              logger.warn('[Readiness] seed stamp failed:', stampError.message);
            }
            await invalidate();
          }

          toast({
            variant: failed ? 'destructive' : 'default',
            title: failed ? 'Skill seeding did not fully succeed' : 'Skills seeded',
            description: failed
              ? `${
                  platform.errors[0] ??
                  registry.error ??
                  (registry.missing > 0
                    ? `${registry.missing}/${registry.expected} required skill(s) still missing (${registry.missingNames
                        .slice(0, 3)
                        .join(', ')})`
                    : 'Unknown error')
                } — agent_skills now holds ${count ?? '?'} row(s).`
              : `agent_skills now holds ${count ?? '?'} row(s) — all ${registry.expected} required by the enabled modules.`,
          });
        } else if (id === 'set-site-url') {
          // Du står redan på domänen — skriv inte in den för hand. MERGE, inte
          // överskrivning: `general` bär fler fält än siteUrl (t.ex.
          // terms-slug), och en blind upsert hade tystat dem.
          const origin = window.location.origin;
          const { data: existing } = await supabase
            .from('site_settings').select('value').eq('key', 'general').maybeSingle();
          const merged = { ...((existing?.value as Record<string, unknown>) ?? {}), siteUrl: origin };
          const { error: urlError } = await supabase
            .from('site_settings')
            .upsert({ key: 'general', value: merged } as never, { onConflict: 'key' });
          await invalidate();
          // Verifiera, lita inte: läs tillbaka och citera vad som faktiskt står.
          const { data: after } = await supabase
            .from('site_settings').select('value').eq('key', 'general').maybeSingle();
          const stored = (after?.value as { siteUrl?: string } | null)?.siteUrl ?? null;
          toast({
            variant: urlError || stored !== origin ? 'destructive' : 'default',
            title: urlError || stored !== origin ? 'Could not set the site URL' : 'Site URL set',
            description: urlError
              ? urlError.message
              : stored === origin
                ? `Backend links will now be built from ${stored}. The Supabase half is still yours to set — see the note.`
                : `Wrote ${origin} but read back ${stored ?? 'nothing'}.`,
          });
        } else {
          const cron = await ensurePlatformCron();
          await invalidate();
          toast({
            variant: cron.registered ? 'default' : 'destructive',
            title: cron.registered ? 'Platform jobs registered' : 'Could not register platform jobs',
            description: cron.registered
              ? 'Re-reading cron.job — the row above updates from the live schedule, not from this message.'
              : (cron.error ?? 'Unknown error'),
          });
        }
      } catch (err) {
        logger.error('[InstanceReadiness] action failed:', err);
        toast({
          variant: 'destructive',
          title: 'Action failed',
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      } finally {
        setRunning(null);
      }
    },
    [invalidate, toast],
  );

  // Never flash a checklist at an instance that turns out to be complete: wait
  // for the verdict before delivering one.
  if (isLoading) return null;
  // Ett kort som bara TYSTNAR säger inte om det gick vägen eller om något gick
  // sönder. Har den här mountningen visat arbete och allt sedan löst sig,
  // stannar kortet kvar i ett klart-läge tills sidan laddas om — så att sista
  // klicket får ett kvitto. Det är inte en dismiss: nästa laddning är den borta
  // av sig själv, och tas ett värde bort kommer den tillbaka.
  if (ready && !alwaysShow && (!hadWork || receiptAcknowledged)) return null;

  const advisory = rows.filter((r) => r.status === 'drift' || r.status === 'unverifiable');

  return (
    <Card className={ready ? undefined : 'border-primary/40'}>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="font-serif flex items-center gap-2">
              {ready ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <Rocket className="h-4 w-4 text-primary" />
              )}
              {ready ? 'This instance is set up' : 'Finish setting up this instance'}
            </CardTitle>
            <CardDescription className="mt-1">
              {ready ? (
                <>
                  Every measurable layer is complete — this card is done and will not come back unless
                  something it measures goes missing.
                  {advisory.length > 0 && ` ${advisory.length} row(s) below can only be verified outside FlowWink.`}
                </>
              ) : (
                <>
                  {blocking.length} of {rows.length} step(s) still need attention. A FlowWink site is four
                  layers — schema, edge functions, skills, frontend — plus the decisions only you can make.
                  This card disappears on its own when they are done; there is nothing to dismiss.
                </>
              )}
            </CardDescription>
          </div>
          {ready && !alwaysShow && (
            // Stänger KVITTOT, inte checklistan — och bara i grönt läge.
            //
            // Skillnaden mot en dismiss är strukturell, inte en artighet:
            // villkoret nedan låter `receiptAcknowledged` betyda något ENDAST
            // när `ready` är sant. Ett rött kort går alltså inte att stänga,
            // hur man än klickar. Och ingenting sparas — nästa sidladdning
            // börjar om, och saknas något igen är kortet tillbaka.
            //
            // Ingen "gå vidare"-knapp här med flit: valet mellan mall och tom
            // sida bor redan längre ned på samma dashboard. Att skicka admin
            // till mallgalleriet vore att dubblera ett val hen redan har.
            <Button size="sm" variant="outline" onClick={() => setReceiptAcknowledged(true)}>
              Close
            </Button>
          )}
          {!ready && (
            <Badge variant="outline" className="shrink-0">
              {rows.length - blocking.length}/{rows.length}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="divide-y pt-0">
        {rows.map((row) => (
          <ChecklistRow key={row.id} row={row} compact={compact} onRun={handleRun} running={running} />
        ))}
      </CardContent>
    </Card>
  );
}
