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
    handler: 'edge:field-service-skill',
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
            technician_id: { type: 'string', description: 'Technician for the visit (used with schedule)' },
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
      'Lifecycle: draft → scheduled (assign technician + slot) → in_progress (auto when visit starts) → completed (sets completed_at, emits service_order.completed) → invoiced (when invoice is generated). Use add_line to append labor/material before completion. After completion, the platform event triggers invoicing automation.',
  },
];

const FIELD_SERVICE_AUTOMATIONS: AutomationSeed[] = [
  {
    name: 'invoice_completed_service_orders',
    description:
      'When a service order is marked completed, draft an invoice from its line items so the customer can be billed quickly.',
    trigger_type: 'event',
    trigger_config: { event: 'service_order.completed' },
    skill_name: 'create_invoice_from_service_order',
    skill_arguments: {},
  },
];

const fieldServiceModule = defineModule<Input, Output>({
  id: 'fieldService',
  name: 'Field Service',
  version: '1.0.0',
  processes: ['order-to-delivery', 'support-to-resolution'],
  maturity: 'L2',
  description:
    'Dispatch on-site service orders: schedule technicians, track visits, capture signatures and auto-generate invoices on completion.',
  capabilities: ['data:write', 'data:read'],
  tier: 'extended',
  inputSchema,
  outputSchema,
  skills: ['manage_service_order'],
  data: {
    tables: ['service_order_lines', 'service_visits', 'service_orders'],
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
