import { defineModule } from '@/lib/module-def';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { z } from 'zod';

const inputSchema = z.object({
  action: z.enum(['get_360']),
  lead_id: z.string().uuid().optional(),
  email: z.string().email().optional(),
});

const outputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

const CUSTOMER360_SKILLS: SkillSeed[] = [
  {
    name: 'get_customer_360',
    description:
      'Fetch the unified Customer 360 view for a person — lead profile, all deals, orders, invoices, quotes, tickets, bookings, subscriptions, chats, webinars and tasks plus a merged timeline and lifetime-value KPIs. Lookup by lead_id (preferred) OR email. Use when: an agent needs full context about a customer before answering a question, building a follow-up, or routing a ticket. NOT for: editing data — this is read-only.',
    category: 'crm',
    handler: 'edge:customer-360',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'get_customer_360',
        description: 'Aggregated 360° customer profile with timeline and KPIs.',
        parameters: {
          type: 'object',
          properties: {
            lead_id: { type: 'string', description: 'UUID of the lead row (preferred)' },
            email: { type: 'string', description: 'Email fallback when no lead row exists yet' },
          },
        },
      },
    },
    instructions:
      'Always pass lead_id when known. Email fallback resolves e-commerce customers without a CRM row.',
  },
];

/**
 * Customer 360 — unified view of everything tied to a person/customer.
 * Read aggregation runs in `customer-360` edge function.
 */
export const customer360Module = defineModule<Input, Output>({
  id: 'customer360',
  name: 'Customer 360',
  version: '1.0.0',
  description:
    'One screen showing every signal, deal, order, invoice, ticket, booking, subscription, chat and webinar tied to a person or customer — with a unified timeline and lifetime-value KPIs.',
  capabilities: ['data:read'],
  inputSchema,
  outputSchema,

  skills: ['get_customer_360'],
  skillSeeds: CUSTOMER360_SKILLS,

  async publish(_input: Input): Promise<Output> {
    return { success: true };
  },
});
