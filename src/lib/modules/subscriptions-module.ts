import { z } from 'zod';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { defineModule } from '@/lib/module-def';
import { supabase } from '@/integrations/supabase/client';

const inputSchema = z.object({
  action: z.enum(['list', 'mrr', 'churn']).default('list'),
  status: z.string().optional(),
  limit: z.number().optional(),
});
const outputSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
});
type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

/**
 * Subscriptions — recurring billing lifecycle.
 *
 * Provider-agnostic (Stripe today, Paddle next). Mirrors provider state
 * via webhooks into the `subscriptions` table so FlowWink owns visibility,
 * MRR, churn and self-service customer flows.
 */
// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const SUBSCRIPTIONS_SKILLS: SkillSeed[] = [
  {
    name: 'list_subscriptions',
    description: 'List recurring subscriptions with filters. Use when: admin asks "who is subscribed?", reviewing billing, auditing customer base. NOT for: one-off orders (lookup_order); MRR/ARR aggregates (subscription_mrr).',
    category: 'commerce',
    handler: 'edge:subscriptions',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_subscriptions',
        description: 'List subscriptions, optionally filtered by status (active, trialing, past_due, canceled).',
        parameters: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              description: 'Filter by status: active | trialing | past_due | canceled | unpaid',
            },
            limit: {
              type: 'number',
              description: 'Max rows (default 50, max 200)',
            },
          },
        },
      },
    },
  },
  {
    name: 'subscription_mrr',
    description: 'Compute current MRR, ARR, active subscriber count, and 30-day churn. Use when: reviewing recurring revenue, weekly briefings, business health checks. NOT for: listing individual subs (list_subscriptions).',
    category: 'commerce',
    handler: 'edge:subscriptions',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'subscription_mrr',
        description: 'Returns aggregated recurring revenue metrics: MRR, ARR, active subscriber count, churn 30d.',
        parameters: { type: 'object', properties: {} },
      },
    },
  },
  {
    name: 'upcoming_renewals',
    description: 'List subscriptions renewing within N days. Use when: planning outreach, weekly briefing on renewals, identifying win-back candidates with cancel_at_period_end. NOT for: aggregate MRR (subscription_mrr) or risk flagging (flag_at_risk_subscriptions).',
    category: 'commerce',
    handler: 'rpc:upcoming_renewals',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'upcoming_renewals',
        description: 'Subscriptions renewing within p_days_ahead days (default 7).',
        parameters: {
          type: 'object',
          properties: { p_days_ahead: { type: 'number', description: 'Window in days (default 7, max 90)' } },
        },
      },
    },
  },
  {
    name: 'flag_at_risk_subscriptions',
    description: 'Sweep subscriptions and flag at-risk ones (past_due, scheduled cancel, low health). Use when: daily health check, before sending win-back. NOT for: reading current at-risk list (use list_subscriptions with status=past_due).',
    category: 'commerce',
    handler: 'rpc:flag_at_risk_subscriptions',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'flag_at_risk_subscriptions',
        description: 'Marks subscriptions with at_risk=true based on payment status, cancellation, and health score.',
        parameters: { type: 'object', properties: {} },
      },
    },
  },
  {
    name: 'record_churn_reason',
    description: 'Record why a customer churned (reason category + free-text feedback + NPS). Use when: customer cancels via portal, exit survey returned. NOT for: technical cancellation (use Stripe customer-portal flow).',
    category: 'commerce',
    handler: 'rpc:record_churn_reason',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'record_churn_reason',
        description: 'Stores a structured churn reason for a subscription.',
        parameters: {
          type: 'object',
          required: ['p_subscription_id', 'p_reason'],
          properties: {
            p_subscription_id: { type: 'string', format: 'uuid' },
            p_reason: { type: 'string', enum: ['too_expensive','missing_feature','switched_competitor','no_longer_needed','poor_support','technical_issues','temporary_pause','other'] },
            p_feedback: { type: 'string' },
            p_nps_score: { type: 'number', minimum: 0, maximum: 10 },
            p_would_return: { type: 'boolean' },
          },
        },
      },
    },
  },
  {
    name: 'list_winback_campaigns',
    description: 'List configured win-back campaigns (active or all). Use when: choosing which offer to send, auditing win-back program. NOT for: sending the campaign (send_winback) or campaign creation (create via /admin/subscriptions UI).',
    category: 'commerce',
    handler: 'edge:agent-execute',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_winback_campaigns',
        description: 'Lists subscription_winback_campaigns rows.',
        parameters: {
          type: 'object',
          properties: {
            active_only: { type: 'boolean', description: 'Only return active=true campaigns' },
            limit: { type: 'number' },
          },
        },
      },
    },
  },
  // ── Manual / invoice-driven subscriptions (B2B) ──
  {
    name: 'create_manual_subscription',
    description: 'Create a recurring subscription billed by invoice (not via Stripe card). Use when: B2B customer signs a service plan paid by invoice (telecom plans, retainers, hosted services). NOT for: online card checkout (use Stripe checkout flow instead).',
    category: 'commerce',
    handler: 'rpc:create_manual_subscription',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'create_manual_subscription',
        description: 'Register a recurring subscription billed by invoice. Generates first invoice on start_date via daily cron.',
        parameters: {
          type: 'object',
          properties: {
            customer_email: { type: 'string', description: 'Billing email (required)' },
            customer_name: { type: 'string' },
            product_name: { type: 'string', description: 'Plan label, e.g. "Business Mobile 100GB"' },
            unit_amount_cents: { type: 'integer', description: 'Price per period in minor units (e.g. 19900 = 199.00)' },
            currency: { type: 'string', description: 'ISO 4217, default EUR' },
            billing_interval: { type: 'string', enum: ['day','week','month','year'], description: 'Default month' },
            billing_interval_count: { type: 'integer', description: 'Default 1; e.g. 3 for quarterly when interval=month' },
            quantity: { type: 'integer', description: 'Default 1' },
            payment_terms: { type: 'string', enum: ['invoice_30','invoice_14','invoice_7','direct_debit','manual','prepaid_card'], description: 'Default invoice_30' },
            start_date: { type: 'string', description: 'YYYY-MM-DD, default today' },
            billing_contact_email: { type: 'string', description: 'B2B AP/AR contact, optional' },
            po_number: { type: 'string', description: 'Customer PO reference, optional' },
            product_id: { type: 'string', description: 'Existing products.id, optional' },
            auto_finalize: { type: 'boolean', description: 'When true, generated invoices are issued as `sent` immediately by the daily billing cron. Default false (drafts for manual review).' },
          },
          required: ['customer_email','product_name','unit_amount_cents'],
        },
      },
    },
  },
  {
    name: 'generate_subscription_invoice',
    description: 'Force-generate the next invoice for a manual subscription. Use when: ad-hoc billing run, customer requested immediate invoice, testing. NOT for: stripe-billed subscriptions (Stripe handles those). Normally the daily cron handles this automatically.',
    category: 'commerce',
    handler: 'rpc:generate_subscription_invoice',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'generate_subscription_invoice',
        description: 'Create a draft invoice from a manual subscription and advance next_invoice_date.',
        parameters: {
          type: 'object',
          properties: {
            subscription_id: { type: 'string', description: 'UUID of the subscription' },
            tax_rate: { type: 'number', description: 'Override default tax rate (e.g. 0.25 = 25%)' },
            due_in_days: { type: 'integer', description: 'Override payment terms (days until due)' },
          },
          required: ['subscription_id'],
        },
      },
    },
  },
  {
    name: 'cancel_manual_subscription',
    description: 'Cancel a manual (invoice-billed) subscription. Use when: customer terminates B2B plan, account closed. NOT for: Stripe subscriptions (use Stripe customer portal or cancel_subscription).',
    category: 'commerce',
    handler: 'rpc:cancel_manual_subscription',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'cancel_manual_subscription',
        description: 'Cancel an invoice-driven subscription. Stops further invoicing.',
        parameters: {
          type: 'object',
          properties: {
            subscription_id: { type: 'string' },
            reason: { type: 'string', description: 'Free-text cancel reason for records' },
            effective_date: { type: 'string', description: 'YYYY-MM-DD, default today' },
          },
          required: ['subscription_id'],
        },
      },
    },
  },
];

export const subscriptionsModule = defineModule<Input, Output>({
  id: 'subscriptions',
  name: 'Subscriptions',
  version: '2.0.0',
  description: 'Recurring revenue lifecycle — active customers, MRR, churn, dunning, renewals, win-back',
  requires: ['invoicing'],
  capabilities: ['data:read', 'data:write'],
  inputSchema,
  outputSchema,

  skills: [
    'list_subscriptions',
    'subscription_mrr',
    'upcoming_renewals',
    'flag_at_risk_subscriptions',
    'record_churn_reason',
    'list_winback_campaigns',
    'create_manual_subscription',
    'generate_subscription_invoice',
    'cancel_manual_subscription',
    // Dunning skills (list_dunning_sequences, pause_dunning, escalate_dunning)
    // exist as edge function `subscriptions` but are not yet seeded as skills.
    // Re-add here once SkillSeed entries are written.
  ],
  skillSeeds: SUBSCRIPTIONS_SKILLS,

  async publish(input: Input): Promise<Output> {
    try {
      const v = inputSchema.parse(input);
      if (v.action === 'mrr') {
        const { data, error } = await supabase
          .from('subscriptions')
          .select('unit_amount_cents, quantity, billing_interval, currency, status')
          .in('status', ['active', 'trialing']);
        if (error) throw error;
        const mrr = (data ?? []).reduce((sum, s: any) => {
          const monthly =
            s.billing_interval === 'year' ? (s.unit_amount_cents * s.quantity) / 12 :
            s.billing_interval === 'week' ? s.unit_amount_cents * s.quantity * 4.33 :
            s.billing_interval === 'day'  ? s.unit_amount_cents * s.quantity * 30 :
            s.unit_amount_cents * s.quantity;
          return sum + monthly;
        }, 0);
        return { success: true, data: { mrr_cents: Math.round(mrr), count: data?.length ?? 0 } };
      }

      if (v.action === 'churn') {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { count, error } = await supabase
          .from('subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'canceled')
          .gte('canceled_at', since);
        if (error) throw error;
        return { success: true, data: { canceled_30d: count ?? 0 } };
      }

      const query = supabase
        .from('subscriptions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(v.limit ?? 100);
      if (v.status) query.eq('status', v.status as any);
      const { data, error } = await query;
      if (error) throw error;
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },
});
