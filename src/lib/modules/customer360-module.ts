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
      'Fetch the unified Customer 360 view for a customer — who they are (party master data: legal entity, addresses, terms, tax treatment, receivable balance) plus everything that has happened: deals, orders, invoices, quotes, tickets, bookings, subscriptions, chats, webinars, tasks, a merged timeline and lifetime-value KPIs. Look up by partner (preferred — it spans documents a lead never touched, such as a card payment from a guest), or by lead_id or email. Use when: an agent needs full context about a customer before answering a question, building a follow-up, or routing a ticket. NOT for: editing data — this is read-only.',
    category: 'crm',
    handler: 'internal:get_customer_360',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'get_customer_360',
        description: 'Aggregated 360° customer profile with timeline and KPIs.',
        parameters: {
          type: 'object',
          properties: {
            partner: { type: 'string', description: 'Party id, email or exact name (PREFERRED — spans documents no lead ever touched)' },
            lead_id: { type: 'string', description: 'UUID of the lead row' },
            email: { type: 'string', description: 'Email fallback when neither a party nor a lead exists' },
          },
        },
      },
    },
    instructions: `## get_customer_360
### Prefer the party
\`partner\` is the strongest key. A guest who paid by card has no lead row, and
before the party register existed 360 could not see her at all — the orders and
subscriptions born from a card payment carry only a party. Pass \`partner\` when
you have it; \`lead_id\` and \`email\` still work and are merged in.

### Two questions, one answer
\`party\` is the master-data card: legal entity, addresses, payment terms, tax
treatment, receivable balance, and a \`gaps\` list of what would block invoicing.
Everything else is what has HAPPENED. When someone asks "can we invoice them",
read \`party.gaps\`; when they ask "what is going on with them", read the timeline.

### The balance is the company's
\`party.billed_to\` is the legal entity the ledger books on. A contact person
never owes money in their own name — report the balance as the company's.`,
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
  processes: ['lead-to-customer', 'support-to-resolution'],
  maturity: 'L3',
  description:
    'One screen showing every signal, deal, order, invoice, ticket, booking, subscription, chat and webinar tied to a person or customer — with a unified timeline and lifetime-value KPIs.',
  capabilities: ['data:read'],
  tier: 'standard',
  inputSchema,
  outputSchema,

  skills: ['get_customer_360'],
  skillSeeds: CUSTOMER360_SKILLS,

  async publish(_input: Input): Promise<Output> {
    return { success: true };
  },
});
