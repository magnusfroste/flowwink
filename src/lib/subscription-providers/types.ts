/**
 * Subscription Provider Abstraction
 *
 * Provider-agnostic interface for subscription lifecycle operations.
 * Concrete adapters: Stripe (today), Paddle (future).
 *
 * Why abstract:
 *  - The DB schema (subscriptions table) is provider-neutral.
 *  - UI / module / FlowPilot skills should never reference a specific provider.
 *  - Switching/adding a provider = new adapter, no UI rewrite.
 */

export type SubscriptionProviderId = 'stripe' | 'paddle';

export interface CreateCheckoutInput {
  priceId: string;          // provider price ID (e.g. price_xxx)
  customerEmail: string;
  customerId?: string;      // FlowWink user_id (passed as metadata)
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
