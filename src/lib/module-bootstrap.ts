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
  category: 'content' | 'crm' | 'commerce' | 'communication' | 'automation' | 'search' | 'analytics' | 'system';
  handler: string;
  scope: 'internal' | 'external' | 'both';
  tool_definition: Record<string, unknown>;
  instructions?: string;
  /** Approval gating. 'auto' = silent execute, 'notify' = execute + log (default), 'approve' = block until admin approves. */
  trust_level?: 'auto' | 'notify' | 'approve';
}

export interface AutomationSeed {
  name: string;
  description: string;
  trigger_type: 'cron' | 'event' | 'signal';
  trigger_config: Record<string, unknown>;
  skill_name: string;
  skill_arguments: Record<string, unknown>;
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


  // 5. Seed automations (upsert by name) — unified or legacy.
  //    Automations only run when FlowPilot module is enabled (FlowPilot owns the cron loop).
  const automations = (unified?.automations ?? bootstrap?.automations ?? []);
  if (automations.length && !flowpilotEnabled) {
    logger.log(`[module-bootstrap] FlowPilot disabled — skipping ${automations.length} automations for ${moduleId} (skills still seeded for MCP)`);
  }
  if (automations.length && flowpilotEnabled) {
    for (const auto of automations) {
      if (!auto || typeof auto !== 'object' || !auto.name) {
        const msg = `Skipped invalid automation seed in ${moduleId} (missing name)`;
        result.errors.push(msg);
        logger.warn(`[module-bootstrap] ${msg}`, auto);
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
