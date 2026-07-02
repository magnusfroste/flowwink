import { defineModule } from '@/lib/module-def';
import { z } from 'zod';
import type { SkillSeed } from '@/lib/module-bootstrap';

/**
 * Flowtable — Airtable-style flexible tables.
 *
 * What this module owns:
 *   - `flowtable_bases` / `flowtable_tables` / `flowtable_fields` / `flowtable_records`
 *   - Admin UI under `/admin/flowtable`
 *
 * Use cases:
 *   - Lightweight lists/CRUD that don't deserve a full module (call lists,
 *     prospecting sheets, content backlogs, expense pre-imports).
 *   - Staging area: clean & enrich rows, then push to CRM as leads or
 *     companies via the "Push to CRM" action.
 *
 * Skills (handler routed via agent-execute generic CRUD on the JSONB tables).
 */

const inputSchema = z.object({
  action: z.enum(['get_config']).default('get_config'),
});
const outputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

const FLOWTABLE_SKILLS: SkillSeed[] = [
  {
    name: 'list_flowtable_bases',
    description:
      'List all Flowtable bases the current user can access. Use when: agent needs to discover existing ad-hoc tables (call lists, prospecting sheets, content backlogs). NOT for: structured CRM data (use list_leads/list_companies instead).',
    category: 'crm',
    handler: 'db:flowtable_bases',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_flowtable_bases',
        description: 'List Flowtable bases (Airtable-style workspaces).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list'] },
            limit: { type: 'number' },
          },
          required: ['action'],
          additionalProperties: false,
        },
      },
    },
  },
  {
    name: 'list_flowtable_records',
    description:
      'List records inside a Flowtable table. Use when: reading rows from a user-owned ad-hoc table (call lists, prospect sheets). Each record has a free-form `values` JSONB matching the table\'s field keys.',
    category: 'crm',
    handler: 'db:flowtable_records',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_flowtable_records',
        description: 'List Flowtable records, optionally filtered by table_id.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list'] },
            table_id: { type: 'string' },
            limit: { type: 'number' },
          },
          required: ['action'],
          additionalProperties: false,
        },
      },
    },
  },
];

export const flowtableModule = defineModule<Input, Output>({
  id: 'flowtable' as never,
  name: 'Flowtable',
  version: '0.1.0',
  processes: [],
  maturity: 'L1',
  description:
    'Airtable-style flexible tables for lists, prospect sheets, content backlogs. CSV import/export + push-to-CRM bridge.',
  capabilities: [],
  inputSchema,
  outputSchema,
  skillSeeds: FLOWTABLE_SKILLS,

  async publish(): Promise<Output> {
    return { success: true };
  },
});
