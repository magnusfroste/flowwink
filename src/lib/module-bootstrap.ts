/**
 * Module Bootstrap System
 * 
 * When a module is enabled, its bootstrap function runs to seed:
 * 1. Reference data (e.g. chart of accounts, templates)
 * 2. Skills (only if FlowPilot module is enabled)
 * 3. Automations (only if FlowPilot module is enabled)
 * 
 * When disabled, skills and automations are deactivated (not deleted).
 * Reference data is preserved.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { logger } from '@/lib/logger';
import type { ModulesSettings } from '@/hooks/useModules';

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
  /** Skills to register — only if FlowPilot is enabled */
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
  const result = { seededSkills: 0, seededAutomations: 0, errors: [] as string[] };

  if (!bootstrap) {
    logger.log(`[module-bootstrap] No bootstrap registered for ${moduleId}`);
    return result;
  }

  // 1. Always seed reference data
  if (bootstrap.seedData) {
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

  // 3. Seed skills (check-then-insert/update by name)
  if (bootstrap.skills?.length) {
    for (const skill of bootstrap.skills) {
      try {
        const { data: existing } = await supabase
          .from('agent_skills')
          .select('id')
          .eq('name', skill.name)
          .maybeSingle();

        if (existing) {
          // Re-enable if it was disabled
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
              tool_definition: skill.tool_definition as unknown as Record<string, unknown>,
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

  // 4. Seed automations (upsert by name)
  if (bootstrap.automations?.length) {
    for (const auto of bootstrap.automations) {
      try {
        // Check if exists first
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
              trigger_config: auto.trigger_config as unknown as Record<string, unknown>,
              skill_name: auto.skill_name,
              skill_arguments: auto.skill_arguments as unknown as Record<string, unknown>,
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

  logger.log(`[module-bootstrap] ${moduleId}: ${result.seededSkills} skills, ${result.seededAutomations} automations seeded`);
  return result;
}

/**
 * Deactivate skills and automations for a disabled module.
 * Does NOT delete data — just sets enabled=false.
 */
export async function teardownModule(
  moduleId: keyof ModulesSettings
): Promise<void> {
  const bootstrap = bootstrapRegistry[moduleId];
  if (!bootstrap) return;

  // Disable skills by name
  if (bootstrap.skills?.length) {
    const skillNames = bootstrap.skills.map(s => s.name);
    const { error } = await supabase
      .from('agent_skills')
      .update({ enabled: false })
      .in('name', skillNames);
    if (error) logger.error(`[module-bootstrap] Failed to disable skills for ${moduleId}:`, error);
  }

  // Disable automations by name
  if (bootstrap.automations?.length) {
    const autoNames = bootstrap.automations.map(a => a.name);
    const { error } = await supabase
      .from('agent_automations')
      .update({ enabled: false })
      .in('name', autoNames);
    if (error) logger.error(`[module-bootstrap] Failed to disable automations for ${moduleId}:`, error);
  }

  logger.log(`[module-bootstrap] Teardown complete for ${moduleId}`);
}

export function getBootstrapRegistry() {
  return bootstrapRegistry;
}
