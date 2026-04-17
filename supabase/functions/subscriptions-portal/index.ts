/**
 * Subscriptions — Customer Portal
 *
 * Returns a provider-hosted portal URL where the customer manages their
 * subscription (update payment method, cancel, etc.).
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getProvider, type SubscriptionProviderId } from "../_shared/subscription-providers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { subscriptionId, providerCustomerId, returnUrl, provider = "stripe" } =
      await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    let customerId = providerCustomerId as string | undefined;
    if (!customerId && subscriptionId) {
      const { data } = await supabase
        .from("subscriptions")
        .select("provider_customer_id")
        .eq("id", subscriptionId)
        .maybeSingle();
      customerId = data?.provider_customer_id ?? undefined;
    }
    if (!customerId) throw new Error("No provider_customer_id found");

    const origin = req.headers.get("origin") ?? "http://localhost:8080";
    const adapter = getProvider(provider as SubscriptionProviderId);
    const url = await adapter.getCustomerPortalUrl({
      providerCustomerId: customerId,
      returnUrl: returnUrl ?? `${origin}/admin/subscriptions`,
    });

    return new Response(JSON.stringify({ url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[subscriptions-portal]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
