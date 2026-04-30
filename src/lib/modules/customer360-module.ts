import { defineModule } from '@/lib/module-def';
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

/**
 * Customer 360 — unified view of everything tied to a person/customer.
 *
 * Aggregates leads + activities + deals + orders + invoices + quotes + tickets +
 * bookings + subscriptions + chats + webinars + tasks into one timeline + KPI
 * dashboard. Lookup by lead_id or email — the latter handles e-commerce
 * customers without a CRM lead row.
 *
 * Read-only. No mutations. No skills exposed (the value is the UI).
 * The aggregation runs in `customer-360` edge function (admin-auth required).
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

  skills: [],

  async publish(_input: Input): Promise<Output> {
    return { success: true };
  },
});
