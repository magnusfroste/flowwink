/**
 * SLA Module — Unified Definition
 *
 * Service Level Agreement monitoring across order fulfillment, ticket resolution,
 * lead response, chat handling, and booking confirmations.
 *
 * Architecture:
 *  - `sla_policies` defines thresholds per entity_type + metric
 *  - `sla_check` (rpc:run_sla_sweep) sweeps current data and writes/auto-resolves
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
    handler: 'rpc:run_sla_sweep',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'sla_check',
        description: 'Run a full SLA sweep across all enabled policies and return any new or open violations',
        parameters: {
          type: 'object',
          properties: {
            p_entity_type: {
              type: 'string',
              description: 'Optional filter — only check policies for this entity type (ticket, order, lead, chat, booking)',
            },
          },
        },
      },
    },
    instructions:
      'Run during heartbeat or on demand. Returns counts per entity_type plus fresh violations; auto-resolves violations whose entity is now handled. The sweep measures on business minutes when a schedule exists, subtracts clock pauses (manage_sla_clock), applies per-customer tier multipliers (manage_sla_tier) and — for tickets/chats — treats policy priority as an entity filter. Breaches fire the policy escalation_actions (manage_sla_escalation). Cheap and idempotent.',
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
  {
    name: 'manage_sla_tier',
    description: 'Per-customer SLA tiers: define tiers with a threshold multiplier (0.5 = twice as fast for premium customers) and assign them to companies or customer emails. Use when: a customer has contractual SLAs different from the default. NOT for: policy thresholds themselves (manage_sla_policy).',
    category: 'system',
    handler: 'rpc:manage_sla_tier',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_sla_tier',
        description: 'create/update/delete tiers; assign/unassign to a company_id or customer_email; list/list_assignments. The sweep multiplies policy thresholds by the customer\'s tier multiplier.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['create', 'update', 'delete', 'assign', 'unassign', 'list', 'list_assignments'] },
            p_tier_id: { type: 'string', format: 'uuid' },
            p_name: { type: 'string', description: 'e.g. gold, silver, bronze' },
            p_description: { type: 'string' },
            p_threshold_multiplier: { type: 'number', description: '< 1 tightens (gold 0.5 = half the time allowed), > 1 loosens' },
            p_company_id: { type: 'string', format: 'uuid' },
            p_customer_email: { type: 'string' },
            p_assignment_id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    instructions: 'assign replaces any existing assignment for that customer (one tier per customer; company match beats email in the sweep). Tickets resolve the customer via company_id/contact_email, orders via company_id/customer_email, chats via customer_email.',
  },
  {
    name: 'manage_sla_clock',
    description: 'Pause/resume the SLA clock for an entity (clock-stop while waiting on the customer). Paused minutes never count toward a breach. Use when: work is blocked on the customer\'s reply. NOT for: business hours (manage_business_hours). Tickets auto-pause on status=waiting.',
    category: 'system',
    handler: 'rpc:manage_sla_clock',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_sla_clock',
        description: 'pause/resume/list clock pauses per (entity_type, entity_id). One open pause per entity at a time.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['pause', 'resume', 'list'] },
            p_entity_type: { type: 'string', description: 'ticket | order | lead | chat | booking' },
            p_entity_id: { type: 'string', description: 'Entity UUID as text' },
            p_reason: { type: 'string' },
          },
        },
      },
    },
    instructions: 'Tickets moving to status waiting pause automatically (and resume on leaving waiting) — manual pause/resume is for the other entity types or special cases. Pause minutes are measured on the same clock as the sweep (business hours when configured).',
  },
  {
    name: 'manage_sla_escalation',
    description: 'Configure what happens automatically when an SLA breach opens: bump ticket priority, emit a platform notify event, create a follow-up task, accrue a service credit. Use when: breaches must trigger action, not just a log row. NOT for: manual remediation (manage_sla_remediation).',
    category: 'system',
    handler: 'rpc:manage_sla_escalation',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_sla_escalation',
        description: 'set/get/clear the escalation_actions array on a policy. Applied by a DB trigger on every new violation; results land in the violation\'s escalation_log.',
        parameters: {
          type: 'object',
          required: ['p_action', 'p_policy_id'],
          properties: {
            p_action: { type: 'string', enum: ['set', 'get', 'clear'] },
            p_policy_id: { type: 'string', format: 'uuid' },
            p_actions: { type: 'array', items: { type: 'object' }, description: '[{"action":"bump_priority","to":"urgent"?}, {"action":"notify","message":"…"?}, {"action":"create_task","title":"…"?,"assigned_to":"uuid"?}, {"action":"accrue_credit","amount_cents":5000,"currency":"SEK"?}]' },
          },
        },
      },
    },
    instructions: 'Actions run in order, each isolated (one failing action logs an error and the rest still run). bump_priority only applies to tickets (one step up, or to a given level). notify emits agent_events sla.violation.escalated for the automation pipeline. accrue_credit resolves the customer from the entity.',
  },
  {
    name: 'manage_service_credit',
    description: 'Service-credit accounting for SLA breaches: accrue a credit (manually or via escalation), then apply it to the customer or waive it. Use when: contract promises compensation for missed SLAs. NOT for: refunds on returns (refund_return) or invoice credit notes.',
    category: 'system',
    handler: 'rpc:manage_service_credit',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_service_credit',
        description: 'accrue/apply/waive/list service_credits. Status flow: accrued → applied | waived. list returns total_accrued_cents.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['accrue', 'apply', 'waive', 'list'] },
            p_credit_id: { type: 'string', format: 'uuid' },
            p_violation_id: { type: 'string', format: 'uuid' },
            p_company_id: { type: 'string', format: 'uuid' },
            p_customer_email: { type: 'string' },
            p_amount_cents: { type: 'number' },
            p_currency: { type: 'string', description: 'Default SEK' },
            p_reason: { type: 'string' },
            p_notes: { type: 'string' },
          },
        },
      },
    },
    instructions: 'accrue needs p_amount_cents plus at least one of violation/company/email. apply marks the credit consumed (deliver it via an invoice discount or refund out of band and note it). Escalation action accrue_credit creates these automatically.',
  },
  {
    name: 'manage_sla_remediation',
    description: 'Remediation workflow for SLA breaches: open a tracked remediation (creates a high-priority CRM task), complete it with a note, list all remediations. Use when: a breach needs an owner and follow-through. NOT for: automatic actions on breach (manage_sla_escalation).',
    category: 'system',
    handler: 'rpc:manage_sla_remediation',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_sla_remediation',
        description: 'open/complete/list. open links a crm_tasks row to the violation (remediation_task_id); complete closes both sides.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['open', 'complete', 'list'] },
            p_violation_id: { type: 'string', format: 'uuid' },
            p_assigned_to: { type: 'string', format: 'uuid', description: 'Owner of the remediation task' },
            p_note: { type: 'string' },
          },
        },
      },
    },
    instructions: 'Get violation ids from list_sla_violations or the sweep result. open is idempotent-guarded (errors if already open). complete stamps the CRM task completed_at and sets remediation_status=completed with your note.',
  },
  {
    name: 'sla_compliance_report',
    description: 'SLA compliance dashboard data for a period: violations opened/resolved/open, average overage, escalations fired, credits accrued, per-entity compliance % (entities created vs breached) and severity breakdown. Use when: reporting on SLA health, weekly reviews. NOT for: live open violations (list_sla_violations).',
    category: 'system',
    handler: 'rpc:sla_compliance_report',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'sla_compliance_report',
        description: 'Read-only aggregate: {violations_opened, violations_resolved, violations_open_now, avg_overage_ratio, escalations_fired, service_credits_accrued_cents, by_entity_type, by_severity, compliance_by_entity}.',
        parameters: {
          type: 'object',
          properties: {
            p_days: { type: 'number', description: 'Period length (default 30)' },
            p_entity_type: { type: 'string', description: 'ticket | order | lead | chat | booking (omit for all)' },
          },
        },
      },
    },
    instructions: 'compliance_pct per entity type = 1 − (violations / entities created in the period). avg_overage_ratio > 1 shows how far past threshold breaches typically run. Feed this into the weekly business digest or dashboards.',
  },
];

export const slaModule = defineModule<SlaInput, SlaOutput>({
  id: 'sla' as any, // SLA is operations-layer; not in user-facing ModulesSettings yet
  name: 'SLA Monitor',
  version: '1.1.0',
  processes: ['support-to-resolution', 'order-to-delivery'],
  maturity: 'L4',
  description:
    'Service level agreement monitoring for order fulfillment, ticket response, lead handling, chat reply times, and booking confirmations. Auto-detects violations, auto-resolves when entities are handled.',
  capabilities: ['data:read', 'data:write'],
  tier: 'standard',
  inputSchema: slaInputSchema,
  outputSchema: slaOutputSchema,

  skills: [
    'sla_check', 'manage_sla_policy', 'list_sla_violations', 'manage_business_hours',
    'manage_sla_tier', 'manage_sla_clock', 'manage_sla_escalation',
    'manage_service_credit', 'manage_sla_remediation', 'sla_compliance_report',
  ],
  data: {
    tables: ['service_credits', 'sla_tier_assignments', 'sla_tiers', 'sla_clock_pauses', 'sla_violations', 'sla_policies'],
  },
  skillSeeds: SLA_SKILLS,

  async publish(input: SlaInput): Promise<SlaOutput> {
    const validated = slaInputSchema.parse(input);
    logger.log('[sla] action:', validated.action);
    return { success: true, message: `SLA ${validated.action} completed` };
  },
});
