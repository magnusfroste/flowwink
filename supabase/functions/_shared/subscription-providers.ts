/**
 * Edge-side subscription provider abstraction.
 *
 * Mirrors src/lib/subscription-providers/types.ts but runs in Deno
 * with provider SDKs. Each adapter handles its own auth & API shape.
 */

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

export type SubscriptionProviderId = "stripe" | "paddle";

export interface CreateCheckoutInput {
  priceId: string;
  customerEmail: string;
  customerId?: string;
  successUrl: string;
  cancelUrl: string;
  quantity?: number;
  trialDays?: number;
}
export interface CheckoutResult {
  url: string;
  providerSessionId?: string;
}
export interface ChangePlanInput {
  providerSubscriptionId: string;
  newPriceId: string;
  prorate?: boolean;
}
export interface CustomerPortalInput {
  providerCustomerId: string;
  returnUrl: string;
}

export interface SubscriptionProvider {
  id: SubscriptionProviderId;
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult>;
  cancelSubscription(providerSubscriptionId: string, atPeriodEnd?: boolean): Promise<void>;
  resumeSubscription(providerSubscriptionId: string): Promise<void>;
  changePlan(input: ChangePlanInput): Promise<void>;
  getCustomerPortalUrl(input: CustomerPortalInput): Promise<string>;
}

// =============================================================================
// Stripe adapter
// =============================================================================

export function createStripeProvider(): SubscriptionProvider {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  const stripe = new Stripe(key, { apiVersion: "2023-10-16" });

  return {
    id: "stripe",

    async createCheckout(input) {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer_email: input.customerEmail,
        line_items: [{ price: input.priceId, quantity: input.quantity ?? 1 }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        subscription_data: input.trialDays
          ? { trial_period_days: input.trialDays }
          : undefined,
        metadata: input.customerId ? { user_id: input.customerId } : undefined,
        allow_promotion_codes: true,
      });
      return { url: session.url ?? "", providerSessionId: session.id };
    },

    async cancelSubscription(id, atPeriodEnd = true) {
      if (atPeriodEnd) {
        await stripe.subscriptions.update(id, { cancel_at_period_end: true });
      } else {
        await stripe.subscriptions.cancel(id);
      }
    },

    async resumeSubscription(id) {
      await stripe.subscriptions.update(id, { cancel_at_period_end: false });
    },

    async changePlan({ providerSubscriptionId, newPriceId, prorate = true }) {
      const sub = await stripe.subscriptions.retrieve(providerSubscriptionId);
      const itemId = sub.items.data[0].id;
      await stripe.subscriptions.update(providerSubscriptionId, {
        items: [{ id: itemId, price: newPriceId }],
        proration_behavior: prorate ? "create_prorations" : "none",
      });
    },

    async getCustomerPortalUrl({ providerCustomerId, returnUrl }) {
      const session = await stripe.billingPortal.sessions.create({
        customer: providerCustomerId,
        return_url: returnUrl,
      });
      return session.url;
    },
  };
}

export function getProvider(id: SubscriptionProviderId = "stripe"): SubscriptionProvider {
  switch (id) {
    case "stripe":
      return createStripeProvider();
    case "paddle":
      throw new Error("Paddle adapter not yet implemented");
    default:
      throw new Error(`Unknown provider: ${id}`);
  }
}

// Map a Stripe subscription to our DB row shape
export function mapStripeSubscription(sub: Stripe.Subscription, customer: Stripe.Customer | null) {
  const item = sub.items.data[0];
  const price = item?.price;
  return {
    status: sub.status as
      | "trialing" | "active" | "past_due" | "canceled"
      | "paused" | "incomplete" | "incomplete_expired" | "unpaid",
    quantity: item?.quantity ?? 1,
    unit_amount_cents: price?.unit_amount ?? 0,
    currency: price?.currency ?? "usd",
    billing_interval: price?.recurring?.interval ?? null,
    current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    trial_start: sub.trial_start ? new Date(sub.trial_start * 1000).toISOString() : null,
    trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end,
    cancel_at: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null,
    canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
    ended_at: sub.ended_at ? new Date(sub.ended_at * 1000).toISOString() : null,
    provider: "stripe" as const,
    provider_subscription_id: sub.id,
    provider_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
    provider_price_id: price?.id ?? null,
    customer_email: customer?.email ?? null,
    customer_name: customer?.name ?? null,
    metadata: sub.metadata ?? {},
  };
}
