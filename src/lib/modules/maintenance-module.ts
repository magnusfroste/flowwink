import { z } from 'zod';
import { defineModule } from '@/lib/module-def';
import type { SkillSeed, AutomationSeed } from '@/lib/module-bootstrap';

const inputSchema = z.object({
  action: z.enum(['get_config']),
});

const outputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

const MAINTENANCE_SKILLS: SkillSeed[] = [
  {
    name: 'manage_equipment',
    description: 'Register and manage equipment/machines: list, create, update (status: operational/under_maintenance/broken/retired). Use when: adding a machine or asset to track, changing its status or location. NOT for: maintenance work itself (manage_maintenance_request) or financial assets (register_fixed_asset).',
    category: 'commerce',
    handler: 'rpc:manage_equipment',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_equipment',
        description: 'Equipment registry CRUD. list filters by status.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['list', 'create', 'update'] },
            p_equipment_id: { type: 'string', format: 'uuid' },
            p_name: { type: 'string' },
            p_serial_number: { type: 'string' },
            p_category: { type: 'string' },
            p_location: { type: 'string' },
            p_status: { type: 'string', enum: ['operational', 'under_maintenance', 'broken', 'retired'] },
            p_notes: { type: 'string' },
          },
        },
      },
    },
  },
  {
    name: 'manage_maintenance_request',
    description: 'Create and track maintenance work on equipment: corrective (breakdowns) and preventive jobs with priority/status/due date. Use when: something breaks, scheduling service work, closing completed jobs. NOT for: equipment registry (manage_equipment) or field service at customer sites (manage_service_order).',
    category: 'commerce',
    handler: 'rpc:manage_maintenance_request',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_maintenance_request',
        description: 'Maintenance request CRUD. Critical correctives flip the equipment to under_maintenance; closing the last open request restores operational.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['list', 'create', 'update'] },
            p_request_id: { type: 'string', format: 'uuid' },
            p_equipment_id: { type: 'string', format: 'uuid' },
            p_title: { type: 'string' },
            p_description: { type: 'string' },
            p_kind: { type: 'string', enum: ['corrective', 'preventive'] },
            p_priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            p_status: { type: 'string', enum: ['new', 'in_progress', 'done', 'cancelled'] },
            p_due_date: { type: 'string', description: 'YYYY-MM-DD' },
            p_duration_minutes: { type: 'number' },
          },
        },
      },
    },
  },
  {
    name: 'run_preventive_maintenance',
    description: 'Sweep preventive maintenance schedules: creates requests for schedules whose next_due has passed and rolls next_due forward by the interval. Use when: nightly cron, or on demand after adding schedules. Idempotent — open preventive requests are not duplicated.',
    category: 'commerce',
    handler: 'rpc:run_preventive_maintenance',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'run_preventive_maintenance',
        description: 'Materialize due maintenance_schedules into preventive requests. Returns created count.',
        parameters: { type: 'object', properties: {} },
      },
    },
  },
];

const MAINTENANCE_AUTOMATIONS: AutomationSeed[] = [
  {
    name: 'Nightly preventive maintenance sweep',
    description: 'Materialize due preventive schedules into maintenance requests every night.',
    trigger_type: 'cron',
    trigger_config: { cron: '0 5 * * *' },
    skill_name: 'run_preventive_maintenance',
    skill_arguments: {},
  },
];

export const maintenanceModule = defineModule<Input, Output>({
  id: 'maintenance',
  name: 'Maintenance',
  category: 'operations',
  maturity: 'L3',
  description:
    'Equipment registry, corrective + preventive maintenance requests, and interval-based preventive schedules with a nightly sweep. Odoo Maintenance counterpart.',
  capabilities: ['data:read', 'data:write'],
  tier: 'standard',
  processes: ['order-to-delivery'],
  inputSchema,
  outputSchema,

  skills: ['manage_equipment', 'manage_maintenance_request', 'run_preventive_maintenance'],
  skillSeeds: MAINTENANCE_SKILLS,
  automations: MAINTENANCE_AUTOMATIONS,

  async publish(_input: Input): Promise<Output> {
    return { success: true };
  },
});
