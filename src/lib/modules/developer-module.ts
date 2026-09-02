import { defineModule } from '@/lib/module-def';
import { z } from 'zod';
import type { SkillSeed } from '@/lib/module-bootstrap';

const inputSchema = z.object({
  action: z.enum(['test_api', 'test_webhook', 'generate_mock']),
  payload: z.record(z.unknown()).optional(),
});

const outputSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

// =============================================================================
// PLATFORM SKILLS — these belong to the platform itself, not a feature module.
// Seeded here so they survive module-reset since the developer module is always on.
// =============================================================================
const PLATFORM_SKILLS: SkillSeed[] = [
  {
    name: 'lint_skill',
    description: 'Run the Agent Contract Integrity pre-release checklist on one or all agent skills (arg-mapping, NOT NULL coverage, description quality, MCP exposure). Use when: user asks to lint, verify, audit, or pre-release-check skills. Returns structured findings with severity and suggested fixes. NOT for: actually fixing the issues — only reports them.',
    category: 'system',
    handler: 'internal:lint_skill',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {"type":"function","function":{"name":"lint_skill","parameters":{"type":"object","required":[],"properties":{"skill_name":{"type":"string","description":"Optional: lint only this skill. Omit to lint all enabled skills."},"include_passing":{"type":"boolean","default":false,"description":"If true, include skills with zero findings. Default false."},"auto_filled_columns":{"type":"object","description":"Per-skill NOT NULL exemptions: {\"skill_name\":[\"col_a\"]}","additionalProperties":{"type":"array","items":{"type":"string"}}}}},"description":"Run the Agent Contract Integrity pre-release checklist on one or all enabled skills."}} as SkillSeed['tool_definition'],
  },
  {
    name: 'reset_module_data',
    description: 'Removes demo/simulation data previously created by seed_module_demo (only rows registered in demo_run_items). Use when: clearing demo data before going live; resetting a module to a clean state. NOT for: deleting real customer data, templates, or KB articles — it never touches those.',
    category: 'system',
    handler: 'rpc:reset_module_data',
    scope: 'internal',
    trust_level: 'approve',
    tool_definition: {"type":"function","function":{"name":"reset_module_data","parameters":{"type":"object","required":["module"],"properties":{"module":{"type":"string","description":"Module name, or \"all\" to reset every module"},"run_id":{"type":"string","format":"uuid","description":"Optional: restrict to a specific demo run"},"dry_run":{"type":"boolean","default":true,"description":"If true, returns counts without deleting. Default true."}}},"description":"Removes demo/simulation data previously created by seed_module_demo. Only deletes rows explicitly registered in demo_run_items. Defaults to dry_run=true."}} as SkillSeed['tool_definition'],
  },
  {
    name: 'seed_module_demo',
    description: 'Seeds realistic demo/simulation data into a specific module, tagging every row with a demo run ID for clean removal later. Use when: a game-master agent wants to set up a scenario for testing or showcasing a workflow. NOT for: real customer data, or removing demo data (use reset_module_data).',
    category: 'system',
    handler: 'rpc:seed_module_demo',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {"type":"function","function":{"name":"seed_module_demo","parameters":{"type":"object","required":["module"],"properties":{"module":{"type":"string","description":"Module to seed — any module with a demo seeder: crm, quotes, invoices, expenses, ecommerce, consultants, blog, kb, projects, hr, tickets, bookings, contracts, recruitment, pricelists, surveys, documents, inventory, webinars, timesheets, subscriptions, accounting, reconciliation, pos, sla, newsletter, purchasing, vendors, approvals, operations. The dispatcher (seed_module_demo in SQL) rejects an unknown module and names the valid ones; it is the source of truth, not this list."},"scenario":{"type":"string","default":"default","description":"Scenario name (e.g. quiet, busy, lead_storm). Default: default"}}},"description":"Seeds realistic demo/simulation data into a specific module, tagged with a demo run ID for clean removal."}} as SkillSeed['tool_definition'],
  },
  {
    name: 'global_search',
    description:
      'Unified search across all major business entities: companies, leads, deals, orders, invoices, quotes, tickets, contracts, documents, kb_articles, products, pages, blog_posts, employees, vendors, projects. Use when: looking up a record by name/email/number/keyword without knowing which table it lives in. NOT for: listing all records of one type (use the dedicated list/manage_* skill instead).',
    category: 'search',
    handler: 'rpc:mcp_global_search',
    scope: 'internal',
    trust_level: 'auto',

    tool_definition: {
      type: 'function',
      function: {
        name: 'global_search',
        description:
          'Full-text search across 16 entity types. Returns ranked matches with entity_type, entity_id, title, subtitle, and a deep-link URL. Admin-only via underlying RPC.',
        parameters: {
          type: 'object',
          properties: {
            search_query: {
              type: 'string',
              description:
                'Free-text query, minimum 2 characters. Supports websearch syntax (quoted phrases, OR).',
            },
            result_limit: {
              type: 'integer',
              description: 'Max results per entity type. Default 8.',
              default: 8,
            },
          },
          required: ['search_query'],
        },
      },
    },
  },
];

export const developerModule = defineModule<Input, Output>({
  id: 'developer',
  name: 'Developer',
  version: '1.1.0',
  processes: [],
  maturity: 'L3',
  description:
    'API explorer, webhooks, and developer tools for integrating with external systems. Also hosts platform-level skills (e.g. global_search).',
  capabilities: ['webhook:trigger', 'data:read'],
  tier: 'core',
  inputSchema,
  outputSchema,

  skills: ['global_search', 'lint_skill', 'seed_module_demo', 'reset_module_data'],
  skillSeeds: PLATFORM_SKILLS,

  async publish(input: Input): Promise<Output> {
    return { success: true, data: { action: input.action } };
  },
});
