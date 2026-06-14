/**
 * SLA Module — Unified Definition
 *
 * Service Level Agreement monitoring across order fulfillment, ticket resolution,
 * lead response, chat handling, and booking confirmations.
 *
 * Architecture:
 *  - `sla_policies` defines thresholds per entity_type + metric
 *  - `sla_check` (edge:sla-check) sweeps current data and writes/auto-resolves
 *    `sla_violations` rows
 *  - Policies & violations are CRUD'd through generic agent-execute table CRUD
 */

import { logger } from '@/lib/logger';
import { defineModule } from '@/lib/module-def';
import { z } from 'zod';
import type { SkillSeed } from '@/lib/module-bootstrap';

const slaInputSchema = z.object({
  action: z.enum(['check', 'list_policies', 'list_violations']),
  entity_type: z.string().optional(),
  period_days: z.number().int().positive().optional(),
});

const slaOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

type SlaInput = z.infer<typeof slaInputSchema>;
type SlaOutput = z.infer<typeof slaOutputSchema>;

const SLA_SKILLS: SkillSeed[] = [
  {
    name: 'sla_check',
    description:
      'Check all SLA policies against current data — finds overdue tickets, orders, leads, chats, and bookings. Auto-creates violations and auto-resolves when entities are handled. Use when: monitoring service quality, during heartbeat, or when asked about SLA compliance. NOT for: creating or editing SLA policies (use manage_sla_policy).',
    category: 'system',
    handler: 'edge:sla-check',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'sla_check',
        description: 'Run a full SLA sweep across all enabled policies and return any new or open violations',
        parameters: {
          type: 'object',
          properties: {
            entity_type: {
              type: 'string',
              description: 'Optional filter — only check policies for this entity type (ticket, order, lead, chat, booking)',
            },
          },
        },
      },
    },
    instructions:
      'Run during heartbeat or on demand. The edge function returns counts per entity_type plus a list of fresh violations. Auto-resolves any prior violation whose entity is now handled. Cheap to call — safe to run every few minutes.',
  },
  {
    name: 'manage_sla_policy',
    description:
      'CRUD for SLA policies — define thresholds (in minutes) per entity_type + metric. Use when: setting up monitoring for a new entity, tightening/loosening response targets. NOT for: running checks (use sla_check) or reading violations (use list_sla_violations).',
    category: 'system',
    handler: 'db:sla_policies',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_sla_policy',
        description: 'Create, update, list, or delete SLA policies',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list', 'update', 'delete'] },
            id: { type: 'string', description: 'Policy UUID (required for update/delete)' },
            name: { type: 'string' },
            description: { type: 'string' },
            entity_type: {
              type: 'string',
              description: 'Entity to monitor — ticket, order, lead, chat, booking',
            },
            metric: {
              type: 'string',
              description: 'Metric to track — first_response, resolution, fulfillment, confirmation',
            },
            threshold_minutes: {
              type: 'number',
              description: 'Warn/violate when an entity sits in its current state longer than this',
            },
            priority: {
              type: 'string',
              description: "Optional — 'all' (default) or a specific priority like 'high'",
            },
            enabled: { type: 'boolean' },
          },
          required: ['action'],
          'x-action-required': { create: ['entity_type', 'metric', 'name', 'threshold_minutes'] },
        },
      },
    },
    instructions:
      'Default thresholds for SMB: ticket first_response 60, ticket resolution 1440, order fulfillment 2880, lead first_response 240, chat first_response 5. Always start with priority="all" and enabled=true.',
  },
  {
    name: 'list_sla_violations',
    description:
      'List SLA violations — open (unresolved) by default, with optional filters by entity_type and time window. Use when: building a dashboard, asked about overdue work, investigating SLA health.',
    category: 'system',
    handler: 'db:sla_violations',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_sla_violations',
        description: 'Read-only listing of SLA violations',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list'], default: 'list' },
            entity_type: { type: 'string' },
            include_resolved: { type: 'boolean', default: false },
            limit: { type: 'number', default: 50 },
          },
        },
      },
    },
    instructions:
      'Filter by entity_type when reporting on a specific area (e.g. ticket SLA health). Include resolved=true only when computing historical compliance metrics — default to open violations.',
  },
  {
    name: 'manage_business_hours',
    description: 'Configure the business-hours calendar (per-weekday open/close) and holidays used to measure SLA elapsed time on working hours instead of 24/7. Use when: setting office hours, adding a public holiday. NOT for: SLA thresholds (manage_sla_policy).',
    category: 'system',
    handler: 'rpc:manage_business_hours',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_business_hours',
        description: 'List/set weekday open-close windows and add/remove holidays. Feeds business_minutes_between() for working-hours SLA timers.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['list', 'set_hours', 'clear_day', 'add_holiday', 'remove_holiday'] },
            p_weekday: { type: 'number', description: '0=Sunday … 6=Saturday' },
            p_open_time: { type: 'string', description: 'HH:MM' },
            p_close_time: { type: 'string', description: 'HH:MM' },
            p_is_open: { type: 'boolean' },
            p_holiday: { type: 'string', description: 'YYYY-MM-DD' },
            p_holiday_name: { type: 'string' },
          },
        },
      },
    },
    instructions: 'Default calendar is Mon–Fri 09:00–17:00. set_hours upserts a weekday window; clear_day removes a weekday (closed); add_holiday/remove_holiday manage closed dates. business_minutes_between(start,end) uses this to compute working-hours elapsed for SLA. Admin/service-role only for mutations.',
  },
];

export const slaModule = defineModule<SlaInput, SlaOutput>({
  id: 'sla' as any, // SLA is operations-layer; not in user-facing ModulesSettings yet
  name: 'SLA Monitor',
  version: '1.1.0',
  processes: ['support-to-resolution', 'order-to-delivery'],
  maturity: 'L3',
  description:
    'Service level agreement monitoring for order fulfillment, ticket response, lead handling, chat reply times, and booking confirmations. Auto-detects violations, auto-resolves when entities are handled.',
  capabilities: ['data:read', 'data:write'],
  tier: 'standard',
  inputSchema: slaInputSchema,
  outputSchema: slaOutputSchema,

  skills: ['sla_check', 'manage_sla_policy', 'list_sla_violations', 'manage_business_hours'],
  skillSeeds: SLA_SKILLS,

  async publish(input: SlaInput): Promise<SlaOutput> {
    const validated = slaInputSchema.parse(input);
    logger.log('[sla] action:', validated.action);
    return { success: true, message: `SLA ${validated.action} completed` };
  },
});
