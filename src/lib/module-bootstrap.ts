/**
 * Module Bootstrap System
 * 
 * When a module is enabled, its bootstrap function runs to:
 * 1. Seed reference data (e.g. chart of accounts, templates)
 * 2. Enable skills owned by the module (by name)
 * 3. Seed full skill definitions (only if module has SkillSeed[])
 * 4. Seed automations (only if FlowPilot module is enabled)
 * 
 * When disabled, skills and automations are deactivated (not deleted).
 * Reference data is preserved.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { logger } from '@/lib/logger';
import type { ModulesSettings } from '@/hooks/useModules';
import { getModuleSkillNames } from '@/lib/module-bootstraps/skill-map';
import { getUnifiedModule, getUnifiedSkillNames, isUnifiedModule } from '@/lib/module-def';

export interface SkillSeed {
  name: string;
  description: string;
  category: 'content' | 'crm' | 'commerce' | 'communication' | 'automation' | 'search' | 'analytics' | 'system' | 'growth' | 'subscriptions';
  handler: string;
  scope: 'internal' | 'external' | 'both';
  tool_definition: Record<string, unknown>;
  instructions?: string;
  /** Approval gating. 'auto' = silent execute, 'notify' = execute + log (default), 'approve' = block until admin approves. */
  trust_level?: 'auto' | 'notify' | 'approve';
  /**
   * Staged-envelope protocol (ledger-perimeter treatment). When true, agent-execute
   * returns a pending-operation envelope on first call; the caller must
   * approve_pending_operation and re-invoke with _approved_operation_id.
   * Like trust_level, only applied on INSERT — runtime overrides survive resync.
   */
  requires_staging?: boolean;
}

export interface AutomationSeed {
  name: string;
  description: string;
  trigger_type: 'cron' | 'event' | 'signal';
  trigger_config: Record<string, unknown>;
  skill_name: string;
  skill_arguments: Record<string, unknown>;
  /** Who runs it. Defaults to 'platform' (deterministic, no FlowPilot needed). */
  executor?: 'platform' | 'flowpilot' | 'openclaw' | 'external';
}

export interface ModuleBootstrap {
  /** Seed reference data — always runs on enable */
  seedData?: () => Promise<void>;
  /** Full skill definitions to INSERT if not exists — only if FlowPilot is enabled */
  skills?: SkillSeed[];
  /** Automations to register — only if FlowPilot is enabled */
  automations?: AutomationSeed[];
}

/** Registry of module bootstrap configs */
const bootstrapRegistry: Partial<Record<keyof ModulesSettings, ModuleBootstrap>> = {};

export function registerBootstrap(moduleId: keyof ModulesSettings, bootstrap: ModuleBootstrap) {
  bootstrapRegistry[moduleId] = bootstrap;
}

/** Compute a stable hash of a module's bootstrap config — used to detect drift between runs. */
async function computeConfigHash(moduleId: keyof ModulesSettings): Promise<string | null> {
  try {
    const unified = getUnifiedModule(moduleId);
    const bootstrap = bootstrapRegistry[moduleId];
    const skills = unified?.skillSeeds ?? bootstrap?.skills ?? [];
    const automations = unified?.automations ?? bootstrap?.automations ?? [];
    const payload = JSON.stringify({
      skills: skills.map(s => s.name).sort(),
      automations: automations.map(a => a.name).sort(),
    });
    const buf = new TextEncoder().encode(payload);
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  } catch {
    return null;
  }
}

/** Check if a module is in degraded state (3+ consecutive failures). */
export async function getBootstrapHealth(moduleId: keyof ModulesSettings): Promise<{
  is_degraded: boolean;
  failure_streak: number;
  last_status: string | null;
  last_run_at: string | null;
  last_hash: string | null;
}> {
  const { data, error } = await supabase.rpc('get_bootstrap_health', { _module_id: String(moduleId) });
  if (error || !data || !Array.isArray(data) || data.length === 0) {
    return { is_degraded: false, failure_streak: 0, last_status: null, last_run_at: null, last_hash: null };
  }
  const row = data[0] as { is_degraded: boolean; failure_streak: number; last_status: string | null; last_run_at: string | null; last_hash: string | null };
  return row;
}

/**
 * Ensure the instance's scheduled jobs exist.
 *
 * `register_flowpilot_cron()` and `register_retrieval_cron()` need the instance's
 * OWN url + anon key, which Postgres cannot derive (app.settings.* is not exposed),
 * so both were parameterised and left provisioning-opt-in — and nothing ever called
 * them. A fresh install therefore came up with NO scheduled jobs at all: no
 * heartbeat, no automation dispatcher, no learn sweep. Nothing errored; it simply
 * looked like the operator did nothing (observed on demo: every automation sat at
 * run_count 0 since creation because the per-minute tick never existed).
 *
 * The browser knows what Postgres cannot, so bootstrap registers them. Both
 * registrars guard each job with "create only if absent", which also means they
 * must be re-run whenever a new job is added — running this on every bootstrap
 * makes that automatic. Failure is non-fatal: never block a module bootstrap on it.
 */
export async function ensurePlatformCron(): Promise<{ registered: boolean; error?: string }> {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return { registered: false, error: 'VITE_SUPABASE_URL / _PUBLISHABLE_KEY missing' };
  }
  try {
    const { error } = await supabase.rpc('register_flowpilot_cron', {
      p_supabase_url: url,
      p_anon_key: key,
    });
    if (error) throw error;
    // Retrieval (knowledge-indexer) has its own registrar; absent on older instances.
    const { error: rErr } = await (supabase.rpc as any)('register_retrieval_cron', {
      p_supabase_url: url,
      p_anon_key: key,
    });
    if (rErr && !/could not find|does not exist/i.test(rErr.message)) {
      logger.warn('[module-bootstrap] retrieval cron registration failed:', rErr.message);
    }
    // Booking reminders — samma tolerans: en äldre instans utan registrarn är
    // inte ett fel, den får jobbet vid nästa bootstrap efter sin migration.
    const { error: bErr } = await (supabase.rpc as any)('register_booking_cron', {
      p_supabase_url: url,
      p_anon_key: key,
    });
    if (bErr && !/could not find|does not exist/i.test(bErr.message)) {
      logger.warn('[module-bootstrap] booking cron registration failed:', bErr.message);
    }
    logger.log('[module-bootstrap] platform cron ensured');
    return { registered: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error registering cron';
    logger.warn('[module-bootstrap] platform cron registration failed:', msg);
    return { registered: false, error: msg };
  }
}

/**
 * Ensure the instance's skill registry matches the deployed code — the 4th
 * deploy layer, applied from the browser the same way ensurePlatformCron
 * anchors the cron jobs.
 *
 * The edge deploy bundles the full skill-seed artifact into agent-execute;
 * sync_skills_from_code reconciles agent_skills against it (insert missing,
 * refresh drifted definition fields, never trust_level). Observed failure this
 * closes: a fresh install sat at 5 skills with 18 modules enabled because
 * nothing ever applied the seeds.
 *
 * The handler MEASURES coverage — how many of the skills the enabled modules
 * require are actually present and exposed — on every call, and only takes the
 * hash short-circuit when that measurement agrees. The earlier version asked
 * "has this artifact been applied?" instead, which is a question about the code,
 * not about the instance: a fresh, fully provisioned instance sat at 96 of 347
 * skills while the sync answered {"status":"unchanged"}.
 *
 * So the answer is evidence, not a claim, and this function refuses to swallow
 * it: an incomplete layer is logged as an ERROR and returned to the caller.
 *
 * Fire-and-forget: a failed sync must never block a module bootstrap.
 */
export interface SkillRegistryResult {
  status: string;
  /** Skills the ENABLED modules require but the instance does not carry (after the write). */
  missing: number;
  /** What the enabled modules require in total, per the deployed seed artifact. */
  expected: number;
  /** First few missing names — enough to name the gap in a toast. */
  missingNames: string[];
  error?: string;
}

/**
 * Deduped at module scope, like ensureModulesRow: the admin shell and the
 * readiness checklist both want the SAME measurement, and measuring twice per
 * page load would be two edge invocations for one truth. Pass `{ fresh: true }`
 * whenever the requirement has just CHANGED (a module was toggled, an operator
 * pressed a repair button) — the memo would otherwise answer with the coverage
 * from before the change.
 */
let skillRegistryPromise: Promise<SkillRegistryResult> | null = null;

export function ensureSkillRegistry(options: { fresh?: boolean } = {}): Promise<SkillRegistryResult> {
  if (!options.fresh && skillRegistryPromise) return skillRegistryPromise;
  const run = syncSkillRegistry();
  if (!options.fresh) {
    skillRegistryPromise = run;
    // A failed or incomplete run must not be cached as the answer for the rest
    // of the session — the next caller has to be able to try again.
    void run.then((r) => {
      if (r.status === 'error' || r.missing > 0) skillRegistryPromise = null;
    });
  }
  return run;
}

async function syncSkillRegistry(): Promise<SkillRegistryResult> {
  const unknownResult = (status: string, error?: string): SkillRegistryResult => ({
    status, missing: 0, expected: 0, missingNames: [], error,
  });
  try {
    const { data, error } = await supabase.functions.invoke('agent-execute', {
      body: { skill_name: 'sync_skills_from_code', agent_type: 'bootstrap', arguments: {} },
    });
    if (error) throw error;
    const result = (data as any)?.result ?? data;
    if (result?.error) return unknownResult('error', String(result.error));

    // `after` on a sync, `coverage` on the short-circuit — both are the
    // read-back, never the writer's own count.
    const measured = (result?.after ?? result?.coverage ?? null) as
      | { expected_for_enabled_modules?: number; missing?: number; missing_names?: string[] }
      | null;
    const expected = measured?.expected_for_enabled_modules ?? 0;
    const missing = measured?.missing ?? 0;
    const missingNames = measured?.missing_names ?? [];

    if (result?.status === 'synced' || result?.status === 'incomplete') {
      logger.log(
        `[module-bootstrap] skill registry sync: +${result.inserted ?? 0} / ~${result.updated ?? 0} ` +
          `(${expected - missing}/${expected} required skills present)`
      );
    }
    if (result?.discrepancy) logger.warn(`[module-bootstrap] ${result.discrepancy}`);

    if (missing > 0) {
      // Shout. This is the exact state that shipped an instance whose external
      // operator could not perform its assignment at all.
      logger.error(
        `[module-bootstrap] skill registry INCOMPLETE — ${missing}/${expected} skill(s) required by the ` +
          `enabled modules are missing (${missingNames.slice(0, 5).join(', ')}). ` +
          'Agents will not find them; search_skills answers with whatever else ranks.'
      );
    }

    return { status: result?.status ?? 'unknown', missing, expected, missingNames };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error syncing skills';
    logger.warn('[module-bootstrap] skill registry sync failed:', msg);
    return unknownResult('error', msg);
  }
}

/**
 * Ensure `site_settings.modules` EXISTS, seeded from the code defaults.
 *
 * The client and the server read an absent row differently, and both are
 * internally consistent:
 *   • useModules() merges `defaultModulesSettings` over the stored row, so an
 *     absent row renders as a configured product — 7 modules on, nav populated.
 *     It never persists that merge.
 *   • _shared/modules.ts (isModuleEnabled) reads `value?.[name]?.enabled`, so an
 *     absent row means EVERY module is off.
 *
 * Together that is a split brain: the admin sees a working instance while ~20
 * edge functions no-op. The sharpest consequence is sync_skills_from_code — it
 * is module-gated server-side, so with no row it syncs only the `platform`
 * pseudo-module and a fresh install lands on 14 skills instead of ~150.
 *
 * The row is seeded at birth by migration 20260822190000. THIS caller exists
 * for the two things a migration cannot do:
 *   1. carry the LIVE `defaultModulesSettings`, so a module added to the code
 *      after install still reaches the row (the migration's ledger row stops it
 *      from ever running again), and
 *   2. repair an instance whose row was emptied — ResetSiteDialog wrote
 *      `{key:'modules', value:{}}` for months, manufacturing exactly the state
 *      the migration was written to prevent.
 *
 * The RPC owns the rule, not this function: fill missing keys, never overwrite
 * an operator's choice. Steady state is one round trip that writes nothing.
 * Measure → act → READ BACK → shout: the RPC's own report is not evidence, so
 * the row is re-read and compared against the defaults before we call it done.
 */
let modulesRowPromise: Promise<{ status: string; missing: string[]; error?: string }> | null = null;

// `ModulesSettings` is an interface, and TypeScript grants implicit index
// signatures to object type ALIASES but never to interfaces — so the live
// `defaultModulesSettings` could not be passed to a plain
// `Record<string, { enabled?: boolean }>` parameter (TS2345). The union takes
// both, and `Object.entries` reads either without indexing a union type. The
// call site stays literally `ensureModulesRow(defaultModulesSettings)`, which
// is the shape module-defaults-reach-the-server.guardrails.test.ts pins: the
// LIVE code defaults must be what reaches the row, not a migration snapshot.
export function ensureModulesRow(
  defaults: ModulesSettings | Record<string, { enabled?: boolean }>
): Promise<{ status: string; missing: string[]; error?: string }> {
  if (modulesRowPromise) return modulesRowPromise;

  modulesRowPromise = (async () => {
    const entries = Object.entries(defaults) as Array<[string, { enabled?: boolean } | undefined]>;
    const ids = entries.map(([id]) => id);
    const minimal = Object.fromEntries(entries.map(([id, cfg]) => [id, { enabled: cfg?.enabled === true }]));

    try {
      // `ensure_modules_settings` is newer than the generated types. Cast the
      // ARGUMENTS, not `supabase.rpc` itself — the RPC-vs-matrix guardrail scans
      // for the literal `.rpc('name'` and goes blind on `(supabase.rpc as any)`.
      const { data, error } = await supabase.rpc('ensure_modules_settings' as never, {
        p_defaults: minimal as unknown as Json,
      } as never);
      if (error) throw error;

      // Verify — don't trust the writer's own report. Re-read the row.
      const { data: row, error: readErr } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'modules')
        .maybeSingle();
      if (readErr) throw readErr;

      const stored = (row?.value ?? {}) as Record<string, unknown>;
      const missing = ids.filter((id) => !(id in stored));
      const status = (data as { status?: string } | null)?.status ?? 'unknown';

      if (missing.length > 0) {
        logger.error(
          `[module-bootstrap] site_settings.modules still missing ${missing.length}/${ids.length} module(s) ` +
            `after ensure_modules_settings (${missing.slice(0, 5).join(', ')}). ` +
            'Server-side module gating will read these as OFF while the admin UI shows them ON.'
        );
        modulesRowPromise = null; // let the next load retry
        return { status, missing };
      }

      if (status !== 'unchanged') {
        logger.log(`[module-bootstrap] site_settings.modules ${status} — ${ids.length} modules now visible to the server`);
      }
      return { status, missing: [] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error seeding module settings';
      logger.error('[module-bootstrap] could not seed site_settings.modules:', msg);
      modulesRowPromise = null; // let the next load retry
      return { status: 'error', missing: ids, error: msg };
    }
  })();

  return modulesRowPromise;
}

/**
 * Run bootstrap for a module being enabled.
 * Idempotent — safe to run multiple times.
 *
 * Circuit breaker: refuses to run if module has 3+ consecutive failures unless `force=true`.
 * Every run is recorded in `bootstrap_runs` for observability.
 */
export async function bootstrapModule(
  moduleId: keyof ModulesSettings,
  allModules: ModulesSettings,
  options: { force?: boolean; triggeredBy?: string } = {}
): Promise<{ seededSkills: number; seededAutomations: number; errors: string[]; degraded?: boolean }> {
  const bootstrap = bootstrapRegistry[moduleId];
  const unified = getUnifiedModule(moduleId);
  const result = { seededSkills: 0, seededAutomations: 0, errors: [] as string[], degraded: false };

  // Circuit breaker check
  if (!options.force) {
    const health = await getBootstrapHealth(moduleId);
    if (health.is_degraded) {
      logger.warn(`[module-bootstrap] ${moduleId} is DEGRADED (${health.failure_streak} consecutive failures). Pass force=true to retry.`);
      result.degraded = true;
      result.errors.push(`Module is degraded after ${health.failure_streak} consecutive failures. Re-bootstrap with "force" to retry.`);
      return result;
    }
  }

  const startedAt = Date.now();
  const configHash = await computeConfigHash(moduleId);

  // Scheduled jobs are instance-level, not module-level, but bootstrap is the one
  // provisioning moment that reliably happens — so ensure them here. Idempotent,
  // and non-fatal: a cron failure must never block seeding the module itself.
  await ensurePlatformCron();
  // Same anchor for the skill registry: the edge deploy carries the seed
  // artifact, this applies it. `fresh` because bootstrapping a module is
  // exactly the moment the requirement changed — a memoized answer from before
  // the toggle would report the old coverage as current.
  await ensureSkillRegistry({ fresh: true });

  // 1. Always seed reference data (unified seedData takes precedence over legacy bootstrap.seedData)
  const seedFn = unified?.seedData ?? bootstrap?.seedData;
  if (seedFn) {
    try {
      await seedFn();
      logger.log(`[module-bootstrap] Seeded reference data for ${moduleId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error seeding data';
      result.errors.push(msg);
      logger.error(`[module-bootstrap] Failed to seed data for ${moduleId}:`, err);
    }
  }

  // 2. Skills + MCP exposure are PLATFORM-level — always seeded regardless of FlowPilot.
  //    External MCP clients (OpenClaw, ClawWink, Claude Desktop, etc.) must see the
  //    same skills as FlowPilot. Only `automations` (cron/event triggers) require
  //    FlowPilot since FlowPilot is the in-house executor for those.
  //    See: docs/architecture/mcp-as-platform.md
  const flowpilotEnabled = allModules.flowpilot?.enabled ?? true;

  // 3. Enable existing skills by name (unified registry first, then legacy skill-map)
  const skillNames = isUnifiedModule(moduleId)
    ? getUnifiedSkillNames(moduleId)
    : getModuleSkillNames(moduleId);
  if (skillNames.length > 0) {
    try {
      const { error } = await supabase
        .from('agent_skills')
        .update({ enabled: true })
        .in('name', skillNames);
      if (error) throw error;
      result.seededSkills += skillNames.length;
      logger.log(`[module-bootstrap] Enabled ${skillNames.length} skills for ${moduleId}`);
    } catch (err) {
      const msg = `Enable skills for ${moduleId}: ${err instanceof Error ? err.message : 'Unknown'}`;
      result.errors.push(msg);
      logger.error(`[module-bootstrap] ${msg}`);
    }
  }

  // 4. Seed full skill definitions (INSERT if not exists) — unified skillSeeds or legacy bootstrap.skills
  const skillSeeds = unified?.skillSeeds ?? bootstrap?.skills ?? [];
  if (skillSeeds.length) {
    for (const skill of skillSeeds) {
      // Defensive: skip undefined/empty entries (trailing-comma or accidental holes
      // in a seeds array would otherwise crash the entire module bootstrap).
      if (!skill || typeof skill !== 'object' || !skill.name) {
        const msg = `Skipped invalid skill seed in ${moduleId} (missing name)`;
        result.errors.push(msg);
        logger.warn(`[module-bootstrap] ${msg}`, skill);
        continue;
      }
      try {
        const { data: existing } = await supabase
          .from('agent_skills')
          .select('id')
          .eq('name', skill.name)
          .maybeSingle();

        if (existing) {
          // Re-enable and refresh ALL definition fields so schema fixes (e.g. OpenAI-safe
          // flat schemas replacing allOf/if-then) propagate without a full module reset.
          await supabase
            .from('agent_skills')
            .update({
              enabled: true,
              mcp_exposed: true,
              description: skill.description,
              instructions: skill.instructions || null,
              tool_definition: skill.tool_definition as Json,
              category: skill.category,
              handler: skill.handler,
              scope: skill.scope,
            })
            .eq('id', existing.id);
        } else {
          const { error } = await supabase
            .from('agent_skills')
            .insert([{
              name: skill.name,
              description: skill.description,
              category: skill.category,
              handler: skill.handler,
              scope: skill.scope,
              tool_definition: skill.tool_definition as Json,
              instructions: skill.instructions || null,
              enabled: true,
              mcp_exposed: true,
              origin: 'bundled' as const,
              trust_level: skill.trust_level ?? ('notify' as const),
              requires_staging: skill.requires_staging ?? false,
            }]);
          if (error) throw error;
        }
        result.seededSkills++;
      } catch (err) {
        const skillName = skill?.name ?? '<unknown>';
        const msg = `Skill ${skillName}: ${err instanceof Error ? err.message : 'Unknown'}`;
        result.errors.push(msg);
        logger.error(`[module-bootstrap] ${msg}`);
      }
    }
  }


  // 5. Seed automations (upsert by name).
  //    Platform-executor automations always seed (the dispatcher runs them).
  //    Only `executor='flowpilot'` ones require the FlowPilot module to be on.
  const automations = (unified?.automations ?? bootstrap?.automations ?? []);
  for (const auto of automations) {
    if (!auto || typeof auto !== 'object' || !auto.name) {
      const msg = `Skipped invalid automation seed in ${moduleId} (missing name)`;
      result.errors.push(msg);
      logger.warn(`[module-bootstrap] ${msg}`, auto);
      continue;
    }
    const executor = auto.executor ?? 'platform';
    if (executor === 'flowpilot' && !flowpilotEnabled) {
      logger.log(`[module-bootstrap] FlowPilot disabled — skipping flowpilot automation '${auto.name}'`);
      continue;
    }
    try {
      const { data: existing } = await supabase
        .from('agent_automations')
        .select('id')
        .eq('name', auto.name)
        .maybeSingle();

      if (!existing) {
        const { error } = await supabase
          .from('agent_automations')
          .insert([{
            name: auto.name,
            description: auto.description,
            trigger_type: auto.trigger_type,
            trigger_config: auto.trigger_config as Json,
            skill_name: auto.skill_name,
            skill_arguments: auto.skill_arguments as Json,
            executor,
            enabled: true,
          }]);
        if (error) throw error;
        result.seededAutomations++;
      }
    } catch (err) {
      const autoName = auto?.name ?? '<unknown>';
      const msg = `Automation ${autoName}: ${err instanceof Error ? err.message : 'Unknown'}`;
      result.errors.push(msg);
      logger.error(`[module-bootstrap] ${msg}`);
    }
  }



  logger.log(`[module-bootstrap] ${moduleId}: ${result.seededSkills} skills, ${result.seededAutomations} automations`);

  // 6. Recompute expected_skill_hash after skill changes
  if (result.seededSkills > 0) {
    try {
      await supabase.functions.invoke('instance-health', { body: {} });
      logger.log(`[module-bootstrap] Triggered hash recompute after ${moduleId} bootstrap`);
    } catch (hashErr) {
      logger.warn(`[module-bootstrap] Hash recompute failed (non-fatal):`, hashErr);
    }
  }

  // 7. Record the run for circuit breaker + observability
  try {
    await supabase.from('bootstrap_runs').insert({
      module_id: String(moduleId),
      status: result.errors.length > 0 ? 'failed' : 'success',
      seeded_skills: result.seededSkills,
      seeded_automations: result.seededAutomations,
      errors: result.errors as unknown as Json,
      config_hash: configHash,
      duration_ms: Date.now() - startedAt,
      triggered_by: options.triggeredBy ?? 'manual',
    });
  } catch (recErr) {
    logger.warn(`[module-bootstrap] Failed to record run (non-fatal):`, recErr);
  }

  return result;
}

/**
 * Deactivate skills and automations for a disabled module.
 * Uses the skill-map for name-based disable + any registered SkillSeed[].
 * Does NOT delete data — just sets enabled=false.
 */
export async function teardownModule(
  moduleId: keyof ModulesSettings
): Promise<void> {
  const bootstrap = bootstrapRegistry[moduleId];
  const unified = getUnifiedModule(moduleId);

  // Collect all skill names from unified registry OR legacy sources
  const skillNames = isUnifiedModule(moduleId)
    ? [...getUnifiedSkillNames(moduleId)]
    : [...getModuleSkillNames(moduleId)];
  
  // Also include any legacy SkillSeed names from bootstrap
  if (!isUnifiedModule(moduleId) && bootstrap?.skills?.length) {
    for (const s of bootstrap.skills) {
      if (!skillNames.includes(s.name)) {
        skillNames.push(s.name);
      }
    }
  }

  // Utility skills are platform-shared and ALWAYS MCP-exposed (see mem://architecture/mcp-exposure-invariants).
  // Disabling them violates the MCP invariant (mcp_exposed=true requires enabled=true). Skip during teardown.
  const UTILITY_SKILLS = new Set([
    'migrate_url', 'scrape_url', 'search_web', 'extract_pdf_text',
    'sla_check', 'process_signal', 'competitor_monitor',
  ]);
  const skillsToDisable = skillNames.filter(n => !UTILITY_SKILLS.has(n));

  if (skillsToDisable.length > 0) {
    const { error } = await supabase
      .from('agent_skills')
      .update({ enabled: false })
      .in('name', skillsToDisable);
    if (error) logger.error(`[module-bootstrap] Failed to disable skills for ${moduleId}:`, error);
  }

  // Disable automations by name — unified or legacy
  const automations = unified?.automations ?? bootstrap?.automations ?? [];
  if (automations.length) {
    const autoNames = automations.map(a => a.name);
    const { error } = await supabase
      .from('agent_automations')
      .update({ enabled: false })
      .in('name', autoNames);
    if (error) logger.error(`[module-bootstrap] Failed to disable automations for ${moduleId}:`, error);
  }

  logger.log(`[module-bootstrap] Teardown complete for ${moduleId} (${skillsToDisable.length}/${skillNames.length} skills disabled, utility-skills preserved)`);

  // Recompute expected_skill_hash after disabling skills
  if (skillsToDisable.length > 0) {
    try {
      await supabase.functions.invoke('instance-health', { body: {} });
    } catch { /* non-fatal */ }
  }
}

export function getBootstrapRegistry() {
  return bootstrapRegistry;
}
