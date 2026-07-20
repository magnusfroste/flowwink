/**
 * Field Service Module — service orders, scheduled visits, completion → invoice.
 *
 * Glues together calendar (visits), projects (umbrella), invoicing (billing)
 * and contracts. FlowPilot can auto-schedule open orders to available slots.
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { defineModule } from '@/lib/module-def';
import type { SkillSeed, AutomationSeed } from '@/lib/module-bootstrap';

const inputSchema = z.object({
  action: z.enum([
    'create',
    'update',
    'list',
    'get',
    'schedule',
    'complete',
    'cancel',
    'add_line',
    'list_visits',
  ]),
  id: z.string().uuid().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  customer_name: z.string().optional(),
  customer_email: z.string().email().optional(),
  customer_phone: z.string().optional(),
  service_address: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status: z.string().optional(),
  scheduled_start: z.string().optional(),
  scheduled_end: z.string().optional(),
  assigned_to: z.string().uuid().optional(),
  technician_id: z.string().uuid().optional(),
  // line items
  kind: z.enum(['labor', 'material', 'expense', 'other']).optional(),
  quantity: z.number().optional(),
  unit_price: z.number().optional(),
  product_id: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const outputSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

const FIELD_SERVICE_SKILLS: SkillSeed[] = [
  {
    name: 'manage_service_order',
    description:
      'Create, update, schedule, complete and cancel field-service orders. Use when: a customer reports an on-site issue, technician needs to be dispatched, recurring maintenance is due. NOT for: digital subscriptions (manage_subscription), simple bookings (manage_booking), warranty tickets without on-site work (create_ticket).',
    category: 'system',
    handler: 'internal:manage_service_order',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_service_order',
        description: 'CRUD + lifecycle for service orders (draft → scheduled → in_progress → completed → invoiced).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['create', 'update', 'list', 'get', 'schedule', 'complete', 'cancel', 'add_line', 'list_visits'],
            },
            id: { type: 'string', description: 'Service order id (required for update/get/schedule/complete/cancel/add_line/list_visits)' },
            title: { type: 'string' },
            description: { type: 'string' },
            customer_name: { type: 'string' },
            customer_email: { type: 'string' },
            customer_phone: { type: 'string' },
            service_address: { type: 'string' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            status: { type: 'string', enum: ['draft', 'scheduled', 'in_progress', 'completed', 'invoiced', 'cancelled'] },
            scheduled_start: { type: 'string', description: 'ISO timestamp' },
            scheduled_end: { type: 'string', description: 'ISO timestamp' },
            assigned_to: { type: 'string', description: 'User id of dispatcher / lead technician' },
            technician_id: { type: 'string', description: 'Technician for the visit — must be an AUTH USER id (users_list), NOT an employee id. Only honored by action:schedule (which creates the service_visits row the availability check + calendar read).' },
            kind: { type: 'string', enum: ['labor', 'material', 'expense', 'other'] },
            quantity: { type: 'number' },
            unit_price: { type: 'number' },
            product_id: { type: 'string' },
            notes: { type: 'string' },
          },
          required: ['action'],
          'x-action-required': {
            create: ['title', 'customer_name'],
            schedule: ['id', 'scheduled_start', 'scheduled_end'],
            complete: ['id'],
            cancel: ['id'],
            add_line: ['id', 'description', 'quantity', 'unit_price'],
          },
        },
      },
    },
    instructions:
      'Lifecycle: draft → scheduled → in_progress (auto when visit starts) → completed (sets completed_at, emits service_order.completed) → invoiced (when invoice is generated). ASSIGN + DISPATCH via action:schedule (id + scheduled_start + scheduled_end + technician_id) — this creates the service_visits row that check_technician_availability and the calendar read. action:update only edits header fields and does NOT create/move a visit, so scheduling via update silently leaves the technician un-dispatched. technician_id MUST be an auth user id (users_list) — an employee id fails with a foreign-key error. Use add_line to append labor/material before completion. Before scheduling, call check_technician_availability to avoid double-booking. After completion, the platform event triggers invoicing automation.',
  },
  {
    name: 'check_technician_availability',
    description:
      'Check whether a technician is free in a time window before scheduling a service visit. Returns conflicts (overlapping non-cancelled visits). Use when: about to schedule/reschedule a service order visit. NOT for: booking appointments (manage_booking), calendar events (manage_calendar_event).',
    category: 'system',
    handler: 'rpc:check_technician_availability',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'check_technician_availability',
        description: 'Overlap check against service_visits. Returns { available, conflicts[] }.',
        parameters: {
          type: 'object',
          required: ['p_technician_id', 'p_start', 'p_end'],
          properties: {
            p_technician_id: { type: 'string', format: 'uuid' },
            p_start: { type: 'string', description: 'ISO timestamp — window start' },
            p_end: { type: 'string', description: 'ISO timestamp — window end' },
            p_exclude_visit_id: { type: 'string', format: 'uuid', description: 'Ignore this visit (when rescheduling it)' },
          },
        },
      },
    },
    instructions:
      'Call before manage_service_order(schedule). available=false comes with a conflicts array (visit_id, order_number, scheduled window). When rescheduling an existing visit, pass p_exclude_visit_id so it does not conflict with itself.',
  },
  {
    name: 'record_visit_time',
    description:
      'Clock a technician in/out of a service visit (writes actual_start/actual_end). Use when: technician arrives on site (start) or finishes the job (stop). NOT for: office time tracking (log_time), scheduling the visit (manage_service_order).',
    category: 'system',
    handler: 'rpc:record_visit_time',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'record_visit_time',
        description: 'start: sets actual_start + visit/order in_progress + order first_response_at. stop: sets actual_end + visit done, returns duration_minutes.',
        parameters: {
          type: 'object',
          required: ['p_visit_id', 'p_action'],
          properties: {
            p_visit_id: { type: 'string', format: 'uuid' },
            p_action: { type: 'string', enum: ['start', 'stop'] },
            p_at: { type: 'string', description: 'ISO timestamp (default now) — backfill an earlier clock-in/out' },
          },
        },
      },
    },
    instructions:
      'start before stop; each can only happen once per visit. start also bubbles the service order to in_progress and stamps first_response_at (feeds SLA response tracking). Get visit ids via manage_service_order(list_visits).',
  },
  {
    name: 'record_visit_proof',
    description:
      'Attach proof of service to a visit: customer signature, photos, signer name. Use when: job done and the customer signs off / technician photographs the work. NOT for: uploading unrelated documents (upload_document).',
    category: 'system',
    handler: 'rpc:record_visit_proof',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'record_visit_proof',
        description: 'Writes signature_url/signed_by (+signed_at) and appends photo URLs to proof_photos on a service visit.',
        parameters: {
          type: 'object',
          required: ['p_visit_id'],
          properties: {
            p_visit_id: { type: 'string', format: 'uuid' },
            p_signature_url: { type: 'string', description: 'URL of the captured signature image' },
            p_photo_urls: { type: 'array', items: { type: 'string' }, description: 'Photo URLs to append as proof' },
            p_signed_by: { type: 'string', description: 'Name of the person who signed' },
            p_notes: { type: 'string', description: 'Appended to technician_notes' },
          },
        },
      },
    },
    instructions:
      'At least one of p_signature_url / p_photo_urls / p_signed_by is required. signed_at is stamped automatically the first time a signature or signer is recorded. Upload images first (e.g. manage_media/upload_document) and pass the resulting URLs.',
  },
  {
    name: 'manage_service_sla',
    description:
      'Set and track SLA targets (response/resolution deadlines) on service orders. Use when: an order must be answered or resolved within N hours; reviewing SLA breaches. NOT for: support-ticket SLAs (sla module), scheduling (manage_service_order).',
    category: 'system',
    handler: 'rpc:manage_service_sla',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_service_sla',
        description: 'set: compute sla_response_due/sla_resolution_due from created_at + hours. status: SLA state for one order. list_breaches: open orders past a due date.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['set', 'status', 'list_breaches'] },
            p_order_id: { type: 'string', format: 'uuid', description: 'Required for set/status' },
            p_response_hours: { type: 'number', description: 'Hours from order creation to first response' },
            p_resolution_hours: { type: 'number', description: 'Hours from order creation to completion' },
          },
        },
      },
    },
    instructions:
      'Deadlines are computed from the order created_at. first_response_at is stamped by record_visit_time(start); resolution is met when completed_at <= sla_resolution_due. status returns response_met/resolution_met (null = pending).',
  },
  {
    name: 'manage_service_package',
    description:
      'Reusable service package templates (predefined labor/material line bundles) and applying them to orders. Use when: standard jobs like "AC install" or "annual boiler service" should prefill order lines. NOT for: product bundles in the shop (manage_product).',
    category: 'system',
    handler: 'rpc:manage_service_package',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_service_package',
        description: 'create/update/list/get/delete packages; apply copies package lines onto a service order (order total recomputes automatically).',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['create', 'update', 'list', 'get', 'delete', 'apply'] },
            p_package_id: { type: 'string', format: 'uuid' },
            p_order_id: { type: 'string', format: 'uuid', description: 'Target order for apply' },
            p_name: { type: 'string' },
            p_description: { type: 'string' },
            p_lines: {
              type: 'array',
              description: 'Package lines',
              items: {
                type: 'object',
                properties: {
                  kind: { type: 'string', enum: ['labor', 'material', 'expense', 'other'] },
                  description: { type: 'string' },
                  quantity: { type: 'number' },
                  unit_price: { type: 'number' },
                  product_id: { type: 'string', format: 'uuid' },
                },
              },
            },
            p_active: { type: 'boolean' },
          },
        },
      },
    },
    instructions:
      'apply requires p_package_id + p_order_id and appends the package lines to the order (idempotency is the caller\'s responsibility — applying twice duplicates lines). Material lines with product_id will draw stock on completion.',
  },
  {
    name: 'link_service_order',
    description:
      'Link a service order to a contract, project and/or deal (or unlink). Use when: on-site work is covered by a service contract, belongs to a project, or originates from a deal. NOT for: creating contracts (manage_contract).',
    category: 'system',
    handler: 'rpc:link_service_order',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'link_service_order',
        description: 'Sets contract_id/project_id/deal_id on a service order after validating the target exists. p_unlink clears one link.',
        parameters: {
          type: 'object',
          required: ['p_order_id'],
          properties: {
            p_order_id: { type: 'string', format: 'uuid' },
            p_contract_id: { type: 'string', format: 'uuid' },
            p_project_id: { type: 'string', format: 'uuid' },
            p_deal_id: { type: 'string', format: 'uuid' },
            p_unlink: { type: 'string', enum: ['contract', 'project', 'deal'], description: 'Clear this link instead of setting one' },
          },
        },
      },
    },
    instructions:
      'Find the contract via manage_contract(list)/search first, then link by uuid. Recurring orders inherit links onto generated child orders.',
  },
  {
    name: 'manage_recurring_service_order',
    description:
      'Recurring service orders: set a recurrence rule on an order and auto-generate the next occurrences (daily cron). Use when: maintenance repeats weekly/monthly/quarterly/yearly. NOT for: recurring invoices (subscriptions module), one-off scheduling (manage_service_order).',
    category: 'system',
    handler: 'rpc:manage_recurring_service_order',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_recurring_service_order',
        description: 'set: rule weekly|biweekly|monthly|quarterly|yearly (+ optional until date). clear: stop recurrence. list: all recurring orders. generate: spawn due occurrences now (also runs via daily cron).',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['set', 'clear', 'list', 'generate'] },
            p_order_id: { type: 'string', format: 'uuid', description: 'Required for set/clear' },
            p_rule: { type: 'string', enum: ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'] },
            p_until: { type: 'string', description: 'YYYY-MM-DD — stop generating after this date' },
          },
        },
      },
    },
    instructions:
      'Generated children are draft orders cloned from the source (lines, links, customer) with parent_order_id set; schedule them normally afterwards. The service-recurring-orders cron runs generate daily at 05:10.',
  },
  {
    name: 'service_order_to_invoice',
    description:
      'Draft an invoice from a completed service order\'s line items. Use when: a service order is finished and the customer should be billed; the invoice_completed_service_orders automation calls this on service_order.completed. NOT for: timesheet-based billing (invoice_from_timesheets); POS receipts (pos_sale_to_invoice). Idempotent — re-running returns the existing invoice.',
    category: 'commerce',
    handler: 'rpc:service_order_to_invoice',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'service_order_to_invoice',
        parameters: {
          type: 'object',
          required: ['p_order_id'],
          properties: {
            p_order_id: { type: 'string', format: 'uuid', description: 'Service order to bill' },
            p_due_in_days: { type: 'number', description: 'Payment terms in days (default 30)' },
          },
        },
      },
    },
    instructions:
      'Requires the order to have customer_email and at least one billable line (add them with manage_service_order action=add_line). Creates a DRAFT invoice and stores its id on service_orders.invoice_id, so a second call returns { already_linked: true } instead of double-billing. Send it afterwards with manage_invoice.',
  },
];

const FIELD_SERVICE_AUTOMATIONS: AutomationSeed[] = [
  {
    name: 'invoice_completed_service_orders',
    description:
      'When a service order is marked completed, draft an invoice from its line items so the customer can be billed quickly.',
    trigger_type: 'event',
    trigger_config: { event: 'service_order.completed' },
    skill_name: 'service_order_to_invoice',
    skill_arguments: {},
  },
];

const fieldServiceModule = defineModule<Input, Output>({
  id: 'fieldService',
  name: 'Field Service',
  version: '1.0.0',
  processes: ['order-to-delivery', 'support-to-resolution'],
  maturity: 'L3',
  description:
    'Dispatch on-site service orders: schedule technicians, track visits, capture signatures and auto-generate invoices on completion.',
  capabilities: ['data:write', 'data:read'],
  tier: 'extended',
  inputSchema,
  outputSchema,
  skills: [
    'manage_service_order',
    'check_technician_availability',
    'record_visit_time',
    'record_visit_proof',
    'manage_service_sla',
    'manage_service_package',
    'link_service_order',
    'manage_recurring_service_order',
  ],
  data: {
    tables: ['service_order_lines', 'service_visits', 'service_orders', 'service_packages'],
  },
  skillSeeds: FIELD_SERVICE_SKILLS,
  automations: FIELD_SERVICE_AUTOMATIONS,
  async publish(input: Input): Promise<Output> {
    return await execute(input);
  },
});

async function execute(input: Input): Promise<Output> {
    try {
      switch (input.action) {
        case 'create': {
          const { data, error } = await supabase
            .from('service_orders')
            .insert({
              title: input.title!,
              description: input.description,
              customer_name: input.customer_name!,
              customer_email: input.customer_email,
              customer_phone: input.customer_phone,
              service_address: input.service_address,
              priority: input.priority ?? 'medium',
              assigned_to: input.assigned_to,
              notes: input.notes,
            })
            .select()
            .single();
          if (error) throw error;
          return { success: true, data };
        }
        case 'list': {
          let q = supabase.from('service_orders').select('*').order('created_at', { ascending: false }).limit(100);
          if (input.status) q = q.eq('status', input.status);
          const { data, error } = await q;
          if (error) throw error;
          return { success: true, data };
        }
        case 'get': {
          if (!input.id) throw new Error('id required');
          const { data, error } = await supabase.from('service_orders').select('*').eq('id', input.id).single();
          if (error) throw error;
          return { success: true, data };
        }
        case 'update': {
          if (!input.id) throw new Error('id required');
          const patch: Record<string, unknown> = {};
          if (input.title) patch.title = input.title;
          if (input.description !== undefined) patch.description = input.description;
          if (input.priority) patch.priority = input.priority;
          if (input.status) patch.status = input.status;
          if (input.assigned_to) patch.assigned_to = input.assigned_to;
          if (input.notes !== undefined) patch.notes = input.notes;
          const { data, error } = await supabase.from('service_orders').update(patch).eq('id', input.id).select().single();
          if (error) throw error;
          return { success: true, data };
        }
        case 'schedule': {
          if (!input.id || !input.scheduled_start || !input.scheduled_end) throw new Error('id, scheduled_start, scheduled_end required');
          // Update order
          const { error: orderErr } = await supabase
            .from('service_orders')
            .update({
              status: 'scheduled',
              scheduled_start: input.scheduled_start,
              scheduled_end: input.scheduled_end,
              assigned_to: input.assigned_to,
            })
            .eq('id', input.id);
          if (orderErr) throw orderErr;
          // Create visit
          const { data: visit, error: visitErr } = await supabase
            .from('service_visits')
            .insert({
              service_order_id: input.id,
              technician_id: input.technician_id ?? input.assigned_to,
              scheduled_start: input.scheduled_start,
              scheduled_end: input.scheduled_end,
            })
            .select()
            .single();
          if (visitErr) throw visitErr;
          return { success: true, data: visit };
        }
        case 'complete': {
          if (!input.id) throw new Error('id required');
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data, error } = await (supabase as any).rpc('complete_service_order', {
            _order_id: input.id,
            _completion_notes: input.notes ?? null,
          });
          if (error) throw error;
          return { success: true, data };
        }
        case 'cancel': {
          if (!input.id) throw new Error('id required');
          const { data, error } = await supabase
            .from('service_orders')
            .update({ status: 'cancelled' })
            .eq('id', input.id)
            .select()
            .single();
          if (error) throw error;
          return { success: true, data };
        }
        case 'add_line': {
          if (!input.id || !input.description || input.quantity === undefined || input.unit_price === undefined)
            throw new Error('id, description, quantity, unit_price required');
          const { data, error } = await supabase
            .from('service_order_lines')
            .insert({
              service_order_id: input.id,
              kind: input.kind ?? 'labor',
              description: input.description,
              quantity: input.quantity,
              unit_price: input.unit_price,
              product_id: input.product_id,
            })
            .select()
            .single();
          if (error) throw error;
          return { success: true, data };
        }
        case 'list_visits': {
          if (!input.id) throw new Error('id required');
          const { data, error } = await supabase
            .from('service_visits')
            .select('*')
            .eq('service_order_id', input.id)
            .order('scheduled_start', { ascending: true });
          if (error) throw error;
          return { success: true, data };
        }
        default:
          throw new Error(`Unknown action ${(input as { action: string }).action}`);
      }
    } catch (e) {
      logger.error('[fieldService] error', e);
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
}

export { fieldServiceModule };
