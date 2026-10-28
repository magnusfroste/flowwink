import { defineModule } from '@/lib/module-def';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import {
  hasCoreBusinessIdentity,
  IDENTITY_HOLD_REASON,
  REQUIRES_BUSINESS_IDENTITY,
} from '@/lib/business-identity-gate';
import { z } from 'zod';

const inputSchema = z.object({
  action: z.enum(['status', 'heartbeat']),
});

// =============================================================================
// FlowPilot's "soul" — personality, identity, operational rules.
// Lives here (in the module) instead of setup-flowpilot edge function so the
// FlowPilot module is fully self-contained: toggle the module on → soul seeded.
// =============================================================================

// The defaults live with the edge runtime so a server-side rebuild seeds the
// same soul the admin shell does (see soul-defaults.ts for the why).
import {
  FLOWPILOT_SOUL,
  FLOWPILOT_IDENTITY,
  FLOWPILOT_AGENTS_RULES,
  FLOWPILOT_TOOL_POLICY,
  FLOWPILOT_STARTER_OBJECTIVES,
  starterObjectiveRow,
} from '../../../supabase/functions/_shared/pilot/soul-defaults';
export { FLOWPILOT_STARTER_OBJECTIVES, starterObjectiveRow };

/**
 * Seed FlowPilot's soul, identity, operational rules, tool policy, and starter objectives.
 * Idempotent — safe to run multiple times. Only inserts what's missing.
 * Called by bootstrapModule() when the FlowPilot module is enabled.
 */
async function seedFlowPilotSoul(): Promise<void> {
  const memoryEntries: Array<{ key: string; value: unknown; category: 'preference' | 'context' }> = [
    { key: 'soul', value: FLOWPILOT_SOUL, category: 'preference' },
    { key: 'identity', value: FLOWPILOT_IDENTITY, category: 'preference' },
    { key: 'agents', value: FLOWPILOT_AGENTS_RULES, category: 'preference' },
    { key: 'tool_policy', value: FLOWPILOT_TOOL_POLICY, category: 'context' },
  ];

  for (const entry of memoryEntries) {
    const { data: existing } = await supabase
      .from('agent_memory')
      .select('id')
      .eq('key', entry.key)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from('agent_memory').insert({
        key: entry.key,
        value: entry.value as never,
        category: entry.category,
        created_by: 'flowpilot',
      });
      if (error) {
        logger.warn(`[flowpilot-module] Failed to seed memory key "${entry.key}":`, error);
      } else {
        logger.log(`[flowpilot-module] Seeded memory key: ${entry.key}`);
      }
    }
  }

  // Seed starter objectives (skip duplicates by goal text). Two concurrent
  // bootstraps both read an empty table; the unique partial index
  // agent_objectives_one_active_goal (#487) makes the second insert fail, and
  // the warning below is the right outcome for it.
  //
  // Identity-gated objectives (constraints.requires_business_identity) are born
  // 'paused' on an instance whose Business Identity is still empty — a fresh
  // install by definition — and the site_settings trigger wakes them when the
  // profile's core lands. The read below decides between the two birth states;
  // if it FAILS we seed paused rather than active: an objective that stays
  // asleep is correctable from the UI, ungrounded published content is not.
  //
  // NB: that index is PARTIAL (WHERE status = 'active'), so it does not stop a
  // race from seeding the same gated goal twice while both rows are 'paused'.
  // The wake trigger therefore activates at most one row per goal — see the
  // migration.
  const { data: existingObjectives } = await supabase
    .from('agent_objectives')
    .select('goal');
  const existingGoals = new Set((existingObjectives || []).map((o: { goal: string }) => o.goal));

  let identityReady = false;
  try {
    const { data: profileRow, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'company_profile')
      .maybeSingle();
    if (error) throw error;
    identityReady = hasCoreBusinessIdentity(profileRow?.value ?? null);
  } catch (err) {
    logger.warn('[flowpilot-module] Could not read company_profile — seeding identity-gated objectives paused:', err);
  }

  for (const obj of FLOWPILOT_STARTER_OBJECTIVES) {
    if (existingGoals.has(obj.goal)) continue;
    const { error } = await supabase.from('agent_objectives').insert(
      starterObjectiveRow(obj, identityReady) as never,
    );
    if (error) {
      logger.warn(`[flowpilot-module] Failed to seed objective "${obj.goal}":`, error);
    } else {
      logger.log(`[flowpilot-module] Seeded objective: ${obj.goal}`);
    }
  }
}

const outputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const FLOWPILOT_SKILLS: SkillSeed[] = [
  {
    name: 'create_objective',
    description: 'Create a new high-level objective for FlowPilot to work toward. Use when: defining a new strategic goal; initiating a new project; setting a long-term target for operations. NOT for: creating CRM tasks (crm_task_create); managing automations (manage_automations).',
    category: 'automation',
    handler: 'module:objectives',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'create_objective',
        description: 'Create a new high-level objective for FlowPilot to work toward. Use when: defining a new strategic goal; initiating a new project; setting a long-term target for operations. NOT for: creating CRM tasks (crm_task_create); managing automations (manage_automations).',
        parameters: {
          type: 'object',
          properties: {
            goal: {
              type: 'string',
              description: 'The objective goal text',
            },
            constraints: {
              type: 'object',
              description: 'Guardrails for the objective. If the goal recurs on a rhythm ("daily", "every day", "varje dag", "per week"), you MUST include a structured cadence or the objective runs on EVERY heartbeat and floods — e.g. constraints.cadence = { "counts": "write_blog_post", "max": 1, "per": "day" }. counts is the skill whose successful runs are counted; per is "day" or "week". Without it a "daily" goal produces ~8 items a day. If the goal produces OUTWARD-FACING content (blog posts, social, newsletters, public pages), you MUST set constraints.requires_business_identity = true — the objective then holds until the company profile carries company_name + services, because content written before the identity exists is generic by construction.',
            },
            success_criteria: {
              type: 'object',
              description: 'How to measure completion',
            },
          },
          required: [
            'goal',
          ],
        },
      },
    },
    instructions: `## create_objective
### What
Creates a new high-level objective for FlowPilot's autonomous operation.
### When to use
- Admin defines a new business goal
- Heartbeat identifies a gap that needs a structured plan
- System integrity issues require a tracked fix
### Parameters
- **goal**: Required. Clear, measurable goal text.
- **constraints**: Optional guardrails (e.g., no_destructive_actions, deadline, max budget). **Cadence is mandatory for recurring goals** — see below.
- **success_criteria**: Optional measurable criteria for completion.
### Cadence — REQUIRED for any recurring goal
If the goal delivers on a rhythm (a blog post "every day", a digest "each week", "varje dag", "per vecka"), the rhythm MUST live in structured data, not just the goal text. Set:
  constraints.cadence = { "counts": "<skill_name>", "max": <n>, "per": "day" | "week", "every": <k, optional> }
"every" stretches the period: { max: 1, per: "day", every: 3 } = one delivery per rolling three days; { max: 1, per: "week", every: 2 } = one per fortnight. A bare string like "biweekly" is NOT a cadence and binds nothing.
where **counts** is the skill whose successful runs are counted (e.g. write_blog_post) and **max** is how many per period. The heartbeat runs every few hours; a recurring goal WITHOUT cadence fires on every heartbeat and over-produces (a real incident: a "daily" blog objective published ~8 posts/day on a live customer instance). The goal text alone is invisible to the cadence guard.
### Identity gate — REQUIRED for outward-facing content goals
If the goal produces public-facing content (blog posts, social media, newsletters, pages), set:
  constraints.requires_business_identity = true
Outward-facing generation grounds in Business Identity; the objective is then held out of the working set until the company profile carries company_name + at least one service, and wakes automatically when they are written (a real incident: a fresh install ran "publish 3 blog posts" before any identity existed and published three generic English posts). Never work around the hold by inventing an identity.
### Edge cases
- Check existing objectives first to avoid duplicates (query agent_objectives table).
- Objectives drive heartbeat behavior — be specific in goal text.
- Keep active objectives to <5 to maintain focus.`,
  },
  {
    name: 'list_objectives',
    description: 'List FlowPilot\'s objectives — the goals the autonomous loop works toward — with status, cadence, progress and evidence counts. Use when: an operator asks what FlowPilot is working on, before create_objective (avoid duplicates), or to find the objective to pause/complete. NOT for: creating (create_objective) or changing one (manage_objective).',
    category: 'automation',
    handler: 'module:objectives',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_objectives',
        description: 'Objectives with status, cadence, progress notes and how many activities evidence them. Default: active and paused; pass status to see completed/failed.',
        parameters: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['active', 'paused', 'completed', 'failed', 'all'], description: 'Defaults to active + paused' },
            limit: { type: 'integer', description: 'Max rows (default 50)' },
          },
        },
      },
    },
  },
  {
    name: 'manage_objective',
    description: 'Pause, resume, complete or edit a FlowPilot objective. Pausing stops the loop from acting on it without losing it; resume restarts it; complete closes it ONLY on evidence (the same rule FlowPilot itself is held to — refused while plan steps are open); update changes goal, constraints (e.g. the cadence, or "draft" instead of "published") or success_criteria. Use when: an operator steers FlowPilot. NOT for: creating (create_objective), CRM tasks, automations (manage_automations).',
    category: 'automation',
    handler: 'module:objectives',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_objective',
        description: 'pause | resume | complete | update an objective by id',
        parameters: {
          type: 'object',
          required: ['action', 'objective_id'],
          properties: {
            action: { type: 'string', enum: ['pause', 'resume', 'complete', 'update'] },
            objective_id: { type: 'string', format: 'uuid' },
            goal: { type: 'string', description: 'update: new goal text' },
            constraints: { type: 'object', description: 'update: replaces constraints — keep the cadence when the goal recurs (see create_objective)' },
            success_criteria: { type: 'object', description: 'update: replaces success criteria' },
            note: { type: 'string', description: 'Why — recorded in progress' },
          },
        },
      },
    },
    instructions: 'complete goes through the evidence check: with a plan on the objective it is refused while steps are pending or failed, and the response says what is missing. Pause when a goal should rest (a duplicate, a season); resume to restart. update merges nothing — send the full constraints object.',
  },
  // NOTE: platform-level skills were moved to src/lib/platform-seeds.ts —
  // `run_daily_briefing`, `search_web`, `scrape_url`, `manage_site_settings`.
  // They are FlowWink platform capabilities (used across modules and by
  // external operators), not FlowPilot ReAct skills — they must exist on
  // every instance regardless of whether the FlowPilot module is enabled.
  {
    name: 'learn_from_data',
    description: 'Analyze page views, chat feedback, and lead conversions to distill learnings into persistent memory. Use when: heartbeat learning cycle; extracting insights from operational data; building institutional knowledge. NOT for: analyzing analytics directly (analyze_analytics); generating business digests (weekly_business_digest).',
    category: 'analytics',
    handler: 'edge:flowpilot-lifecycle',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'learn_from_data',
        description: 'Analyze page views, chat feedback, and lead conversions to distill learnings into persistent memory. Use when: heartbeat learning cycle; extracting insights from operational data; building institutional knowledge. NOT for: analyzing analytics directly (analyze_analytics); generating business digests (weekly_business_digest).',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
    instructions: `## learn_from_data
### What
Analyzes page views, chat feedback, and lead conversions to distill learnings into persistent memory.
### When to use
- Runs daily via cron (flowpilot-learn at 03:00)
- Heartbeat reflection phase
- Admin asks "what have you learned?"
### Parameters
- None required.
### Edge cases
- Saves insights to agent_memory with category='context'.
- Idempotent — repeated calls refine rather than duplicate learnings.
- Requires sufficient data to produce meaningful insights.`,
  },
  {
    name: 'manage_automations',
    description: 'Create and manage agent automations (cron jobs, event triggers, signal handlers). `list` answers each job with last_triggered_at, next_run_at, run_count, last_error and a `state` read against ITS schedule (on_schedule | overdue | never_ran | waiting | disabled) — judge a job by state, never by how old its last run looks: a weekday sweep looked at on a Sunday is on_schedule. Use when: setting up recurring tasks; defining automatic event responses; implementing signal processing logic; checking whether a scheduled job is actually firing. NOT for: creating objectives (create_objective); processing incoming signals (process_signal).',
    category: 'automation',
    handler: 'module:automations',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_automations',
        description: 'Create and manage agent automations (cron jobs, event triggers, signal handlers). `list` answers each job with last_triggered_at, next_run_at, run_count, last_error and a `state` read against ITS schedule (on_schedule | overdue | never_ran | waiting | disabled) — judge a job by state, never by how old its last run looks: a weekday sweep looked at on a Sunday is on_schedule. Use when: setting up recurring tasks; defining automatic event responses; implementing signal processing logic; checking whether a scheduled job is actually firing. NOT for: creating objectives (create_objective); processing incoming signals (process_signal).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['list', 'create', 'update', 'enable', 'disable', 'delete'],
              description: 'Operation to perform. Default: create (backwards-compatible).',
            },
            automation_id: { type: 'string', description: 'Required for update/enable/disable/delete' },
            name: { type: 'string', description: 'Required for create' },
            description: { type: 'string' },
            trigger_type: {
              type: 'string',
              enum: ['cron', 'event', 'signal', 'manual'],
              description: 'Required for create. NOT silently coerced to cron.',
            },
            trigger_config: { type: 'object' },
            skill_name: { type: 'string', description: 'Required for create. Must reference an enabled agent_skill.' },
            skill_arguments: { type: 'object' },
            enabled: { type: 'boolean' },
            executor: {
              type: 'string',
              enum: ['platform', 'flowpilot', 'openclaw', 'external'],
              description: 'Who runs this automation. Default platform.',
            },
            limit: { type: 'number', description: 'For action=list. Default 50.' },
          },
          allOf: [
            { if: { properties: { action: { const: 'create' } } }, then: { required: ['action', 'name', 'skill_name', 'trigger_type'] } },
            { if: { properties: { action: { const: 'update' } } }, then: { required: ['action', 'automation_id'] } },
            { if: { properties: { action: { const: 'enable' } } }, then: { required: ['action', 'automation_id'] } },
            { if: { properties: { action: { const: 'disable' } } }, then: { required: ['action', 'automation_id'] } },
            { if: { properties: { action: { const: 'delete' } } }, then: { required: ['action', 'automation_id'] } },
          ],
        },
      },
    },
    instructions: `## manage_automations
### What
Creates and manages agent automations (cron jobs, event triggers, signal handlers).
### When to use
- Admin asks to automate a recurring task
- Setting up event-driven workflows (e.g., "when a lead is created, qualify it")
- Managing existing automation schedules
### Parameters
- **name**: Required. Automation name.
- **skill_name**: Required. The database skill to execute.
- **trigger_type**: cron, event, signal, manual.
- **trigger_config**: Trigger-specific config (cron expression, event name, etc.).
- **enabled**: Boolean. New automations default to disabled per LAW 7.
### Generative skills are NOT automations
An automation fires its skill with STATIC arguments — there is no reasoning loop on any executor. So a skill that needs model-produced content each run (write_blog_post, generate_content_proposal — anything requiring a \`content\`/\`title\` you must reason out) CANNOT be an automation: a cron fire either errors (missing required args) or republishes frozen text. For recurring generative work create a recurring OBJECTIVE with \`constraints.cadence\` instead (create_objective) — that runs through FlowPilot's loop and produces fresh content. Automations are for deterministic skills (send reminders, sync data, dispatch a signal) whose required args are fully known up front. Incident 2026-07-23: a "daily blog" automation on a live instance errored at 07:00 every day, and another republished one frozen post weekly.
### Edge cases
- skill_name must reference a DATABASE skill, not a built-in tool.
- Cron/manual automations are rejected at create if skill_arguments omits a required parameter of the target skill.
- Cron expressions use standard format: minute hour day month weekday.
- New automations are disabled by default — admin must explicitly enable.`,
  },
  {
    name: 'users_list',
    description: 'List platform users with their roles. Shows email, role, and last sign-in. Use when: admin needs to review team members; checking user access levels; auditing platform users. NOT for: managing user roles (the Users page); inviting a new colleague (invite_colleague, approval required).',
    category: 'crm',
    handler: 'db:profiles',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'users_list',
        description: 'List platform users with their roles. Shows email, role, and last sign-in. Use when: admin needs to review team members; checking user access levels; auditing platform users. NOT for: managing user roles (the Users page); inviting a new colleague (invite_colleague, approval required).',
        parameters: {
          type: 'object',
          properties: {
            role: {
              type: 'string',
              enum: [
                'admin',
                'approver',
                'writer',
              ],
              description: 'Filter by role',
            },
            limit: {
              type: 'number',
              description: 'Max results (default 20)',
            },
          },
          required: [],
        },
      },
    },
    instructions: `## users_list
### What
Lists platform users with their roles.
### When to use
- Admin asks about team members or users
- Role management queries
- Audit: who has admin access
### Parameters
- **role**: Filter by role: admin, approver, writer.
- **limit**: Max results (default 20).
### Edge cases
- Shows email, role, and last sign-in.
- Does not include customers — only platform users.`,
  },

  {
    name: 'update_autonomy_cadence',
    description: "Re-register FlowPilot's pg_cron heartbeat jobs from the current autonomy_schedule setting. Use when: the admin changed the autonomy cadence and the cron schedule must be refreshed. Takes no arguments — reads site_settings.autonomy_schedule.",
    category: 'system',
    handler: 'internal:update_autonomy_cadence',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'update_autonomy_cadence',
        parameters: { type: 'object', properties: {} },
      },
    },
  },
];

export const flowpilotModule = defineModule<Input, Output>({
  id: 'flowpilot',
  name: 'FlowPilot',
  version: '1.0.0',
  processes: [],
  maturity: 'L4',
  description: 'Autonomous AI operator — skills, objectives, automations and workflows. When disabled, FlowWink runs as a traditional SaaS; when enabled, FlowPilot drives skills/automations autonomously.',
  capabilities: ['data:read', 'data:write'],
  inputSchema,
  outputSchema,

  skills: [
    'list_objectives',
    'manage_objective',
    // FlowPilot consumes skills from other modules — it doesn't own module-specific skills.
    // Its own core skills (create_objective, manage_automations, etc.) live in FLOWPILOT_SKILLS.
  ],
  skillSeeds: FLOWPILOT_SKILLS,

  // Self-contained init: soul + identity + agents-rules + tool_policy + starter objectives
  // are all seeded here when the module is enabled. No more separate setup-flowpilot trigger.
  seedData: seedFlowPilotSoul,

  automations: [
    {
      name: 'Weekly Business Digest',
      description: 'Every Friday afternoon, summarise traffic, leads, and top content, then log to activity.',
      trigger_type: 'cron',
      trigger_config: { cron: '0 16 * * 5' }, // the business's Friday afternoon
      skill_name: 'weekly_business_digest',
      skill_arguments: {},
    },
    // 'Daily Briefing' lives in src/lib/platform-seeds.ts — it's a platform
    // SaaS automation, not a FlowPilot-owned one.

  ],

  async publish(input: Input): Promise<Output> {
    return { success: true, message: `FlowPilot ${input.action} completed` };
  },
});
