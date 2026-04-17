/**
 * Subscriptions — Checkout
 *
 * Creates a checkout session for a subscription via the active provider.
 * Authenticated endpoint. Returns the redirect URL.
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
    const { priceId, successUrl, cancelUrl, trialDays, quantity, provider = "stripe" } =
      await req.json();
    if (!priceId) throw new Error("priceId is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const { data: userData } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = userData.user;
    if (!user?.email) throw new Error("Not authenticated");

    const origin = req.headers.get("origin") ?? "http://localhost:8080";
    const adapter = getProvider(provider as SubscriptionProviderId);
    const result = await adapter.createCheckout({
      priceId,
      customerEmail: user.email,
      customerId: user.id,
      successUrl: successUrl ?? `${origin}/admin/subscriptions?status=success`,
      cancelUrl: cancelUrl ?? `${origin}/admin/subscriptions?status=canceled`,
      trialDays,
      quantity,
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[subscriptions-checkout]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
