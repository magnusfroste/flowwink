import { z } from 'zod';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { defineModule } from '@/lib/module-def';
import { supabase } from '@/integrations/supabase/client';

const inputSchema = z.object({
  action: z.enum(['list_sales', 'list_sessions', 'today_summary']).default('today_summary'),
  register_id: z.string().optional(),
  limit: z.number().optional(),
});
const outputSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
});
type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

const POS_SKILLS: SkillSeed[] = [
  {
    name: 'open_pos_session',
    description: 'Open a cashier shift on a register with opening cash. Use when: cashier starts a shift in the morning. NOT for: closing the shift (close_pos_session).',
    category: 'commerce',
    handler: 'rpc:open_pos_session',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'open_pos_session',
        description: 'Starts a new POS session on a register. Fails if register already has an open session.',
        parameters: {
          type: 'object',
          required: ['p_register_id'],
          properties: {
            p_register_id: { type: 'string', format: 'uuid' },
            p_opening_cash_cents: { type: 'number', description: 'Opening cash drawer (in cents/öre)' },
            p_cashier_name: { type: 'string' },
          },
        },
      },
    },
  },
  {
    name: 'close_pos_session',
    description: 'Close cashier shift, count cash and compute variance. Use when: end of day/shift. NOT for: refunding sales.',
    category: 'commerce',
    handler: 'rpc:close_pos_session',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'close_pos_session',
        description: 'Closes a POS session and returns expected vs actual cash variance.',
        parameters: {
          type: 'object',
          required: ['p_session_id', 'p_closing_cash_cents'],
          properties: {
            p_session_id: { type: 'string', format: 'uuid' },
            p_closing_cash_cents: { type: 'number' },
          },
        },
      },
    },
  },
  {
    name: 'record_pos_sale',
    description: 'Record a completed in-store sale with line items and payment. Use when: cashier rings up a sale. NOT for: e-commerce orders (use place_order).',
    category: 'commerce',
    handler: 'rpc:record_pos_sale',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'record_pos_sale',
        description: 'Atomically creates a sale + lines, computes totals + tax, returns receipt number.',
        parameters: {
          type: 'object',
          required: ['p_register_id', 'p_lines'],
          properties: {
            p_register_id: { type: 'string', format: 'uuid' },
            p_session_id: { type: 'string', format: 'uuid' },
            p_lines: {
              type: 'array',
              items: {
                type: 'object',
                required: ['product_name', 'quantity', 'unit_price_cents'],
                properties: {
                  product_id: { type: 'string', format: 'uuid' },
                  product_name: { type: 'string' },
                  sku: { type: 'string' },
                  quantity: { type: 'number' },
                  unit_price_cents: { type: 'number' },
                  discount_cents: { type: 'number' },
                  tax_rate: { type: 'number' },
                },
              },
            },
            p_payment_method: { type: 'string', enum: ['cash','card','swish','klarna','gift_card','split','other'] },
            p_customer_email: { type: 'string' },
            p_discount_cents: { type: 'number' },
          },
        },
      },
    },
  },
  {
    name: 'list_pos_sales',
    description: 'List recent POS sales with filters. Use when: reviewing daily takings, finding a receipt, audit. NOT for: aggregated revenue (today_summary).',
    category: 'commerce',
    handler: 'edge:agent-execute',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_pos_sales',
        description: 'Lists pos_sales rows newest first.',
        parameters: {
          type: 'object',
          properties: {
            register_id: { type: 'string', format: 'uuid' },
            limit: { type: 'number' },
          },
        },
      },
    },
  },
  {
    name: 'record_pos_sale_v2',
    description: 'Odoo-style POS sale: split payments, product validation, stock event. Use when: cashier finalizes a basket. NOT for: e-commerce orders (use place_order).',
    category: 'commerce',
    handler: 'rpc:record_pos_sale_v2',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'record_pos_sale_v2',
        description: 'Atomic sale with split tender. Validates products are available_in_pos, emits stock.movement event, supports N payments per sale.',
        parameters: {
          type: 'object',
          required: ['p_register_id', 'p_session_id', 'p_lines', 'p_payments'],
          properties: {
            p_register_id: { type: 'string', format: 'uuid' },
            p_session_id: { type: 'string', format: 'uuid' },
            p_lines: {
              type: 'array',
              items: {
                type: 'object',
                required: ['product_name', 'quantity', 'unit_price_cents'],
                properties: {
                  product_id: { type: 'string', format: 'uuid' },
                  product_name: { type: 'string' },
                  sku: { type: 'string' },
                  quantity: { type: 'number' },
                  unit_price_cents: { type: 'number' },
                  discount_cents: { type: 'number' },
                  tax_rate: { type: 'number' },
                },
              },
            },
            p_payments: {
              type: 'array',
              description: 'One or more payment rows; sum must >= total.',
              items: {
                type: 'object',
                required: ['method', 'amount_cents'],
                properties: {
                  method: { type: 'string', enum: ['cash','card','swish','klarna','gift_card','invoice','other'] },
                  amount_cents: { type: 'number' },
                  reference: { type: 'string' },
                },
              },
            },
            p_customer_id: { type: 'string', format: 'uuid' },
            p_customer_email: { type: 'string' },
            p_discount_cents: { type: 'number' },
          },
        },
      },
    },
  },
  {
    name: 'close_pos_session_v2',
    description: 'Close shift and generate Z-report with payments-by-method aggregation. Emits pos.session.closed event for batch journal posting.',
    category: 'commerce',
    handler: 'rpc:close_pos_session_v2',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'close_pos_session_v2',
        description: 'Closes session, returns Z-report with totals split by payment method, emits event for accounting.',
        parameters: {
          type: 'object',
          required: ['p_session_id', 'p_closing_cash_cents'],
          properties: {
            p_session_id: { type: 'string', format: 'uuid' },
            p_closing_cash_cents: { type: 'number' },
            p_notes: { type: 'string' },
          },
        },
      },
    },
  },
];

export const posModule = defineModule<Input, Output>({
  id: 'pos',
  name: 'Point of Sale',
  version: '2.0.0',
  description: 'In-store register — sessions, receipts, split payments, stock-aware product catalog',
  capabilities: ['data:read', 'data:write'],
  inputSchema,
  outputSchema,

  skills: ['open_pos_session', 'close_pos_session', 'record_pos_sale', 'list_pos_sales', 'record_pos_sale_v2', 'close_pos_session_v2'],
  skillSeeds: POS_SKILLS,


  async publish(input: Input): Promise<Output> {
    try {
      const v = inputSchema.parse(input);

      if (v.action === 'today_summary') {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const { data, error } = await supabase
          .from('pos_sales')
          .select('total_cents, currency, payment_method, status')
          .gte('created_at', start.toISOString())
          .eq('status', 'completed');
        if (error) throw error;
        const total = (data ?? []).reduce((s: number, r: any) => s + (r.total_cents ?? 0), 0);
        return { success: true, data: { total_cents: total, count: data?.length ?? 0 } };
      }

      if (v.action === 'list_sessions') {
        const q = supabase.from('pos_sessions').select('*').order('opened_at', { ascending: false }).limit(v.limit ?? 50);
        if (v.register_id) q.eq('register_id', v.register_id);
        const { data, error } = await q;
        if (error) throw error;
        return { success: true, data };
      }

      const q = supabase.from('pos_sales').select('*').order('created_at', { ascending: false }).limit(v.limit ?? 100);
      if (v.register_id) q.eq('register_id', v.register_id);
      const { data, error } = await q;
      if (error) throw error;
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },
});
