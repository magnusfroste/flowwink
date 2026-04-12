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
  requires_approval?: boolean;
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

/**
 * Run bootstrap for a module being enabled.
 * Idempotent — safe to run multiple times.
 */
export async function bootstrapModule(
  moduleId: keyof ModulesSettings,
  allModules: ModulesSettings
): Promise<{ seededSkills: number; seededAutomations: number; errors: string[] }> {
  const bootstrap = bootstrapRegistry[moduleId];
  const unified = getUnifiedModule(moduleId);
  const result = { seededSkills: 0, seededAutomations: 0, errors: [] as string[] };

  // 1. Always seed reference data (from unified def or legacy bootstrap)
  const seedFn = unified?.seedData ?? bootstrap?.seedData;
  if (seedFn) {
    try {
      await bootstrap.seedData();
      logger.log(`[module-bootstrap] Seeded reference data for ${moduleId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error seeding data';
      result.errors.push(msg);
      logger.error(`[module-bootstrap] Failed to seed data for ${moduleId}:`, err);
    }
  }

  // 2. Skills + automations only if FlowPilot is enabled
  const flowpilotEnabled = allModules.flowpilot?.enabled ?? true;
  if (!flowpilotEnabled) {
    logger.log(`[module-bootstrap] FlowPilot disabled — skipping skills/automations for ${moduleId}`);
    return result;
  }

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
      try {
        const { data: existing } = await supabase
          .from('agent_skills')
          .select('id')
          .eq('name', skill.name)
          .maybeSingle();

        if (existing) {
          // Re-enable and update description/instructions
          await supabase
            .from('agent_skills')
            .update({ enabled: true, description: skill.description, instructions: skill.instructions || null })
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
              requires_approval: skill.requires_approval ?? false,
              enabled: true,
              origin: 'bundled' as const,
              trust_level: 'notify' as const,
            }]);
          if (error) throw error;
        }
        result.seededSkills++;
      } catch (err) {
        const msg = `Skill ${skill.name}: ${err instanceof Error ? err.message : 'Unknown'}`;
        result.errors.push(msg);
        logger.error(`[module-bootstrap] ${msg}`);
      }
    }
  }

  // 5. Seed automations (upsert by name) — unified or legacy
  const automations = unified?.automations ?? bootstrap?.automations ?? [];
  if (automations.length) {
    for (const auto of automations) {
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
        const msg = `Automation ${auto.name}: ${err instanceof Error ? err.message : 'Unknown'}`;
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

  if (skillNames.length > 0) {
    const { error } = await supabase
      .from('agent_skills')
      .update({ enabled: false })
      .in('name', skillNames);
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

  logger.log(`[module-bootstrap] Teardown complete for ${moduleId} (${skillNames.length} skills disabled)`);

  // Recompute expected_skill_hash after disabling skills
  if (skillNames.length > 0) {
    try {
      await supabase.functions.invoke('instance-health', { body: {} });
    } catch { /* non-fatal */ }
  }
}

export function getBootstrapRegistry() {
  return bootstrapRegistry;
}
