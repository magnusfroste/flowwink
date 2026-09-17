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
            p_opening_cash_cents: { type: 'number', description: 'Opening cash drawer (in minor currency units, e.g. cents)' },
            p_cashier_name: { type: 'string' },
          },
        },
      },
    },
  },
  {
    name: 'close_pos_session',
    description: 'Close cashier shift: counts the drawer from every payment row of the shift (sales, refunds, tips, change) and computes the variance. Same as close_pos_session_v2, smaller return. Use when: end of day/shift. NOT for: refunding sales.',
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
    description: 'Record a completed in-store sale with line items and ONE tender, on an open session. Same effect as record_pos_sale_v2 (stock moves, payment row, sale discount spread over the lines before tax). Use when: cashier rings up a sale paid one way. NOT for: split tenders or change on overpayment (record_pos_sale_v2), e-commerce orders (place_order).',
    category: 'commerce',
    handler: 'rpc:record_pos_sale',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'record_pos_sale',
        description: 'Creates a sale + lines on an open session, computes totals with the sale discount on the lines before tax, moves stock, records the tender as a payment row, returns the receipt number.',
        parameters: {
          type: 'object',
          required: ['p_register_id', 'p_session_id', 'p_lines'],
          properties: {
            p_register_id: { type: 'string', format: 'uuid' },
            p_session_id: { type: 'string', format: 'uuid', description: 'An OPEN session on the register (open_pos_session) — the sale is counted at close' },
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
            p_payment_method: { type: 'string', enum: ['cash','card','swish','klarna','gift_card','invoice','other'], description: 'The single tender, for the exact total. For split tenders use record_pos_sale_v2.' },
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
    handler: 'db:pos_sales',
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
    description: 'POS sale with split tenders: validates products, spreads a sale-level discount over the lines BEFORE tax, moves stock, records every tender and books change as cash leaving the drawer. Use when: cashier finalizes a basket. NOT for: e-commerce orders (place_order), refunds (refund_pos_sale).',
    category: 'commerce',
    handler: 'rpc:record_pos_sale_v2',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'record_pos_sale_v2',
        description: 'Atomic sale with N tenders. Validates products are available_in_pos, emits stock.movement, records each tender; overpayment becomes change (cash only). Returns subtotal, tax, total and change_cents.',
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
                required: ['product_name', 'quantity'],
                properties: {
                  product_id: { type: 'string', format: 'uuid' },
                  variant_id: { type: 'string', format: 'uuid', description: 'Variant being sold (validated against product_id); SKU + price auto-resolve from it' },
                  product_name: { type: 'string' },
                  sku: { type: 'string' },
                  quantity: { type: 'number' },
                  unit_price_cents: { type: 'number', description: 'Optional when product_id/variant_id is given — resolves to product price + variant delta' },
                  discount_cents: { type: 'number' },
                  tax_rate: { type: 'number' },
                },
              },
            },
            p_payments: {
              type: 'array',
              description: 'One or more tenders; their sum must cover the total. Omit amount_cents on a single tender to pay the exact total. Change on overpayment is only possible with a cash tender.',
              items: {
                type: 'object',
                required: ['method'],
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
    description: 'Close shift and generate the Z-report: expected cash = opening float + every cash payment row of the shift (sales, refunds, tips, change given), totals by method, net sales after refunds — and books the day-end journal entry (tenders by method, revenue and VAT per rate, tips, cash difference). Use when: cashier ends shift / day-end POS closing / "close pos session" / "stäng kassan". NOT for: voiding sales or opening a new session.',
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
  {
    name: 'book_pos_session',
    description: 'Book the day-end journal entry for a CLOSED POS session that was not booked at close (no chart of accounts or roles at the time). Idempotent — a booked session is skipped. Use when: close_pos_session_v2 reported journal.success=false, or accounting was set up after the till had been running. NOT for: closing a session (close_pos_session_v2).',
    category: 'commerce',
    handler: 'rpc:pos_session_journal',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'book_pos_session',
        description: 'Posts one entry for a closed session: tenders by method in debit (cash register, bank, gift-card liability), revenue and output VAT per rate in credit, tips as a liability, the counted cash difference. Returns the journal entry id.',
        parameters: {
          type: 'object',
          required: ['p_session_id'],
          properties: { p_session_id: { type: 'string', format: 'uuid' } },
        },
      },
    },
  },
  {
    name: 'add_tip',
    description: 'Add a tip to a completed POS sale (records tip_cents + a tip payment row). Use when: the customer leaves a tip after tendering. NOT for: the sale itself (record_pos_sale_v2).',
    category: 'commerce',
    handler: 'rpc:add_tip',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'add_tip',
        description: 'Attach a tip to a sale. Adds to pos_sales.tip_cents and inserts a tip payment. Returns the new tip + grand total (goods + tip).',
        parameters: {
          type: 'object',
          required: ['p_sale_id', 'p_tip_cents'],
          properties: {
            p_sale_id: { type: 'string', format: 'uuid' },
            p_tip_cents: { type: 'number' },
            p_method: { type: 'string', enum: ['cash', 'card', 'swish', 'klarna', 'other'], description: 'Tender used for the tip (default card)' },
          },
        },
      },
    },
    instructions: 'Tips are tracked separately from the taxable goods total. grand_total_cents = total_cents + tip_cents. Admin/writer/service-role only.',
  },
  {
    name: 'manage_gift_card',
    description: 'Issue and manage gift cards (balance ledger). Use when: selling/issuing a gift card, checking a balance, deactivating a lost card. NOT for: spending a card at checkout (redeem_gift_card).',
    category: 'commerce',
    handler: 'rpc:manage_gift_card',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_gift_card',
        description: 'issue (code + amount), get (by code), list, deactivate gift cards.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['issue', 'get', 'list', 'deactivate'] },
            p_code: { type: 'string' },
            p_amount_cents: { type: 'number', description: 'Initial balance on issue' },
            p_currency: { type: 'string' },
          },
        },
      },
    },
    instructions: 'issue sets initial_balance = balance = amount. Codes are unique. Admin/service-role only for issue/deactivate.',
  },
  {
    name: 'redeem_gift_card',
    description: 'Spend against a gift card balance (e.g. as a POS gift_card payment). Use when: applying a gift card at checkout. Guards inactive cards and insufficient balance. NOT for: issuing cards (manage_gift_card).',
    category: 'commerce',
    handler: 'rpc:redeem_gift_card',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'redeem_gift_card',
        description: 'Decrement a gift card balance by amount_cents (row-locked). Returns redeemed + remaining balance; errors on inactive / insufficient.',
        parameters: {
          type: 'object',
          required: ['p_code', 'p_amount_cents'],
          properties: {
            p_code: { type: 'string' },
            p_amount_cents: { type: 'number' },
          },
        },
      },
    },
    instructions: 'Redeems against an active card; raises on insufficient balance. Pair with a pos payment of method gift_card for the same amount. Admin/writer/service-role only.',
  },
  {
    name: 'manage_loyalty',
    description: 'Loyalty/points program: enroll customers, check balances, earn/redeem/adjust points. Enrolled customers auto-earn 1 point per 10 currency units on completed sales. Use when: signing a customer up for the loyalty program, checking points, redeeming a reward. NOT for: gift cards (manage_gift_card).',
    category: 'commerce',
    handler: 'rpc:manage_loyalty',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_loyalty',
        description: 'enroll (by email), get (account + recent transactions), list, earn, redeem, adjust. Tiers bronze/silver/gold from lifetime points (5000/15000).',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['enroll', 'get', 'list', 'earn', 'redeem', 'adjust'] },
            p_customer_email: { type: 'string', description: 'Account key (required except for list)' },
            p_customer_name: { type: 'string' },
            p_points: { type: 'number', description: 'Points to earn/redeem (positive) or adjust (signed)' },
            p_sale_id: { type: 'string', format: 'uuid', description: 'Related pos sale' },
            p_note: { type: 'string' },
          },
        },
      },
    },
    instructions: 'Auto-earn happens via DB trigger on completed pos_sales with a customer_email matching an enrolled account — earn manually only for out-of-band promotions. redeem raises on insufficient balance. Refunds via refund_pos_sale automatically claw back the proportional points.',
  },
  {
    name: 'refund_pos_sale',
    description: 'Refund a POS sale, fully or per line (creates a negative sale linked via refund_of, restocks returned products, reverses loyalty points). Use when: customer returns in-store goods / receipt correction. NOT for: e-commerce RMAs (create_return/refund_return), invoice credit notes.',
    category: 'commerce',
    handler: 'rpc:refund_pos_sale',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'refund_pos_sale',
        description: 'Creates a refund sale (negative totals, RF- receipt) referencing the original. Omit p_lines for a full refund of everything remaining; over-refunds are rejected. Original status becomes refunded/partially_refunded.',
        parameters: {
          type: 'object',
          required: ['p_sale_id'],
          properties: {
            p_sale_id: { type: 'string', format: 'uuid', description: 'The ORIGINAL sale id' },
            p_lines: {
              type: 'array',
              description: 'Partial refund: which lines and quantities. Omit for full refund.',
              items: {
                type: 'object',
                required: ['sale_line_id', 'quantity'],
                properties: {
                  sale_line_id: { type: 'string', format: 'uuid' },
                  quantity: { type: 'number', description: 'Units to refund (positive)' },
                },
              },
            },
            p_reason: { type: 'string' },
            p_method: { type: 'string', enum: ['cash', 'card', 'swish', 'klarna', 'gift_card', 'other'], description: 'Refund tender (default: original payment method)' },
            p_session_id: { type: 'string', format: 'uuid', description: 'Open session to book the refund against' },
          },
        },
      },
    },
    instructions: 'Get sale_line_ids from list_pos_sales / render_pos_receipt first. Products with product_id are restocked via stock.movement events. Per-line remaining quantities are tracked — refunding the same line twice beyond the sold quantity errors.',
  },
  {
    name: 'pos_sale_to_invoice',
    description: 'Convert a POS receipt into a draft invoice linked back to the sale (B2B customers who pay on invoice or need a formal invoice for a store purchase). Use when: "can I get an invoice for this receipt?". NOT for: refunds (refund_pos_sale), subscriptions.',
    category: 'commerce',
    handler: 'rpc:pos_sale_to_invoice',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'pos_sale_to_invoice',
        description: 'Creates a draft invoice (POS-YYYYMMDD-#####) from the sale lines and stores invoice_id on the sale. Idempotent: returns the existing link if already invoiced.',
        parameters: {
          type: 'object',
          required: ['p_sale_id'],
          properties: {
            p_sale_id: { type: 'string', format: 'uuid' },
            p_customer_name: { type: 'string' },
            p_customer_email: { type: 'string', description: 'Required if the sale has no customer_email on record' },
            p_due_in_days: { type: 'number', description: 'Payment terms (default 30)' },
          },
        },
      },
    },
    instructions: 'The invoice is created as draft — review and send via the invoicing skills/UI. Refund sales cannot be invoiced.',
  },
  {
    name: 'render_pos_receipt',
    description: 'Render a branded receipt for a POS sale: lines, payments, tax, tip, plus register receipt header/footer and site branding. Use when: printing/emailing a receipt, showing receipt details. NOT for: invoices (generate_invoice_pdf).',
    category: 'commerce',
    handler: 'rpc:render_pos_receipt',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'render_pos_receipt',
        description: 'Returns { receipt: {lines, payments, totals, tip, refund info, invoice link}, template: {header, footer, register, site_branding} } for rendering.',
        parameters: {
          type: 'object',
          required: ['p_sale_id'],
          properties: {
            p_sale_id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    instructions: 'Set per-register branding by updating pos_registers.receipt_header / receipt_footer. The template block carries site branding (logo, colors) from site_settings so any renderer can produce a branded receipt.',
  },
  {
    name: 'manage_pos_table',
    description: 'Table/seat management for food & beverage POS: create tables, seat guests (link a sale/tab), release. Use when: restaurant/café floor management, open tabs per table. NOT for: booking appointments (manage_booking).',
    category: 'commerce',
    handler: 'rpc:manage_pos_table',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_pos_table',
        description: 'create/update/list/delete tables; seat marks occupied (optionally linking a sale), release frees the table.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['create', 'update', 'list', 'delete', 'seat', 'release'] },
            p_table_id: { type: 'string', format: 'uuid' },
            p_name: { type: 'string', description: 'e.g. "Table 4"' },
            p_area: { type: 'string', description: 'e.g. "Terrace"' },
            p_seats: { type: 'number' },
            p_register_id: { type: 'string', format: 'uuid' },
            p_sale_id: { type: 'string', format: 'uuid', description: 'Sale/tab to link when seating' },
            p_status: { type: 'string', enum: ['free', 'occupied', 'reserved'] },
          },
        },
      },
    },
    instructions: 'Seating an occupied table errors — release it first. delete is a soft-deactivate. list includes the current sale receipt per table.',
  },
  {
    name: 'manage_pos_register',
    description: 'Create, update or list POS registers (pos_registers): the tills sessions open on, with currency, default tax rate and receipt header/footer. Use when: setting up a shop or a new till, changing the receipt text. NOT for: opening a shift (open_pos_session).',
    category: 'commerce',
    handler: 'db:pos_registers',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_pos_register',
        description: 'CRUD on pos_registers',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'update', 'list', 'get'] },
            pos_register_id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            location: { type: 'string' },
            currency: { type: 'string', description: 'Defaults to the platform currency' },
            default_tax_rate: { type: 'number', description: 'Percent, e.g. 25' },
            active: { type: 'boolean' },
            receipt_header: { type: 'string' },
            receipt_footer: { type: 'string' },
          },
          required: ['action'],
          'x-action-required': { create: ['name'] },
        },
      },
    },
  },
];

export const posModule = defineModule<Input, Output>({
  id: 'pos',
  name: 'Point of Sale',
  version: '2.0.0',
  processes: ['order-to-delivery', 'record-to-report'],
  maturity: 'L4',
  description: 'In-store register — sessions, receipts, split payments, stock-aware product catalog',
  capabilities: ['data:read', 'data:write'],
  tier: 'extended',
  inputSchema,
  outputSchema,

  skills: ['manage_pos_register', 'book_pos_session', 'open_pos_session', 'close_pos_session', 'record_pos_sale', 'list_pos_sales', 'record_pos_sale_v2', 'close_pos_session_v2', 'add_tip', 'manage_gift_card', 'redeem_gift_card', 'manage_loyalty', 'refund_pos_sale', 'pos_sale_to_invoice', 'render_pos_receipt', 'manage_pos_table'],
  data: {
    tables: ['pos_payments', 'pos_sale_lines', 'pos_sales', 'pos_sessions', 'pos_registers', 'pos_tables', 'loyalty_accounts', 'loyalty_transactions'],
  },
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
