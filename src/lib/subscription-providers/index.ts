/**
 * Client-side subscription provider registry.
 *
 * The frontend never talks to providers directly — it dispatches to
 * dedicated edge functions (subscriptions-checkout, subscriptions-portal,
 * subscriptions-manage). This file only exports types + a small helper
 * that picks the active provider from site_settings.
 */

import { supabase } from '@/integrations/supabase/client';
import type { SubscriptionProviderId } from './types';

export * from './types';

export async function getActiveProvider(): Promise<SubscriptionProviderId> {
  const { data } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'subscriptions')
    .maybeSingle();
  const value = (data?.value as { provider?: SubscriptionProviderId } | null) ?? null;
  return value?.provider ?? 'stripe';
}

export async function invokeSubscriptionEdge<T = unknown>(
  fn: 'subscriptions-checkout' | 'subscriptions-portal' | 'subscriptions-manage' | 'subscriptions-sync',
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw error;
  return data as T;
}
