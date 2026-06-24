/**
 * Platform Seeds
 *
 * Skills and automations that are part of the FlowWink platform itself,
 * NOT owned by any opt-in module. They must exist on every instance
 * regardless of which modules are enabled.
 *
 * Examples: the daily briefing (deterministic metric aggregation + LLM summary
 * — a SaaS automation, not an agent action), platform health checks, etc.
 *
 * Design rule: only put things here that are required for the *platform* to
 * function. Anything that adds value to a specific business domain should live
 * in the corresponding module under `src/lib/modules/`.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { logger } from '@/lib/logger';
import type { SkillSeed, AutomationSeed } from '@/lib/module-bootstrap';

export const PLATFORM_SKILLS: SkillSeed[] = [
  {
    name: 'run_daily_briefing',
    description:
      "Generate the daily business briefing: health score, key metrics (visitors, leads, orders, revenue), AI summary and action items. Writes to flowpilot_briefings + admin FlowChat. Use when: scheduled daily run; admin requests today's briefing. NOT for: weekly review (weekly_business_digest); ad-hoc analytics (analyze_analytics).",
    category: 'analytics',
    handler: 'edge:flowpilot-briefing',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'run_daily_briefing',
        description:
          'Generate the daily business briefing as a platform SaaS automation. Deterministic metric aggregation + a single LLM summary. NOT a ReAct loop.',
        parameters: {
          type: 'object',
          properties: {
            source: { type: 'string', description: 'Trigger source label (cron, manual, automation).' },
          },
        },
      },
    },
    instructions: `## run_daily_briefing
### What
Platform SaaS automation. Deterministic metric aggregation + one LLM call for narrative summary. NOT a ReAct loop, NOT a FlowPilot skill.
### When
Scheduled daily 07:00 UTC via the "Daily Briefing" automation in /admin/automations. Also runnable on demand by an admin.
### Output
- Row in flowpilot_briefings (consumed by BusinessPulseWidget)
- System message in the admin FlowChat
- Email to the owner if Resend is configured`,
  },
];

export const PLATFORM_AUTOMATIONS: AutomationSeed[] = [
  {
    name: 'Daily Briefing',
    description:
      'Platform automation. Generates the daily business briefing every morning at 07:00 UTC and posts it to admin FlowChat. Runs deterministically (no ReAct).',
    trigger_type: 'cron',
    trigger_config: { cron: '0 7 * * *', timezone: 'UTC' },
    skill_name: 'run_daily_briefing',
    skill_arguments: { source: 'automation' },
    executor: 'platform',
  },
];

/**
 * Seed all platform-level skills and automations.
 * Idempotent — safe to run multiple times. Refreshes definition fields on
 * existing rows so deploys propagate without a manual DB poke.
 */
export async function bootstrapPlatform(): Promise<{
  seededSkills: number;
  seededAutomations: number;
  errors: string[];
}> {
  const result = { seededSkills: 0, seededAutomations: 0, errors: [] as string[] };

  for (const skill of PLATFORM_SKILLS) {
    try {
      const { data: existing } = await supabase
        .from('agent_skills')
        .select('id')
        .eq('name', skill.name)
        .maybeSingle();

      if (existing) {
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
        const { error } = await supabase.from('agent_skills').insert([
          {
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
          },
        ]);
        if (error) throw error;
      }
      result.seededSkills++;
    } catch (err) {
      const msg = `Platform skill ${skill.name}: ${err instanceof Error ? err.message : 'Unknown'}`;
      result.errors.push(msg);
      logger.error(`[platform-seeds] ${msg}`);
    }
  }

  for (const auto of PLATFORM_AUTOMATIONS) {
    try {
      const { data: existing } = await supabase
        .from('agent_automations')
        .select('id')
        .eq('name', auto.name)
        .maybeSingle();

      if (!existing) {
        const { error } = await supabase.from('agent_automations').insert([
          {
            name: auto.name,
            description: auto.description,
            trigger_type: auto.trigger_type,
            trigger_config: auto.trigger_config as Json,
            skill_name: auto.skill_name,
            skill_arguments: auto.skill_arguments as Json,
            executor: auto.executor ?? 'platform',
            enabled: true,
          },
        ]);
        if (error) throw error;
        result.seededAutomations++;
      }
    } catch (err) {
      const msg = `Platform automation ${auto.name}: ${err instanceof Error ? err.message : 'Unknown'}`;
      result.errors.push(msg);
      logger.error(`[platform-seeds] ${msg}`);
    }
  }

  logger.log(
    `[platform-seeds] Seeded ${result.seededSkills} platform skills, ${result.seededAutomations} platform automations`
  );
  return result;
}
