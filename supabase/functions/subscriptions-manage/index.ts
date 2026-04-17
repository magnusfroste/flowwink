/**
 * Subscriptions — Manage
 *
 * Server-side actions: cancel, resume, change_plan.
 * Admin/approver only.
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
    const { action, subscriptionId, newPriceId, atPeriodEnd = true, prorate = true } =
      await req.json();
    if (!action || !subscriptionId) throw new Error("action and subscriptionId required");

    const auth = req.headers.get("Authorization");
    if (!auth) throw new Error("No authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const supabaseAuthed = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userData } = await supabaseAuthed.auth.getUser(auth.replace("Bearer ", ""));
    const user = userData.user;
    if (!user) throw new Error("Not authenticated");

    // Role check
    const { data: roles } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id);
    const allowed = (roles ?? []).some((r: any) => ["admin", "approver"].includes(r.role));
    if (!allowed) throw new Error("Insufficient permissions");

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("provider, provider_subscription_id")
      .eq("id", subscriptionId)
      .maybeSingle();
    if (!sub?.provider_subscription_id) throw new Error("Subscription not found");

    const adapter = getProvider(sub.provider as SubscriptionProviderId);

    switch (action) {
      case "cancel":
        await adapter.cancelSubscription(sub.provider_subscription_id, atPeriodEnd);
        break;
      case "resume":
        await adapter.resumeSubscription(sub.provider_subscription_id);
        break;
      case "change_plan":
        if (!newPriceId) throw new Error("newPriceId required");
        await adapter.changePlan({
          providerSubscriptionId: sub.provider_subscription_id,
          newPriceId,
          prorate,
        });
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    await supabase.from("subscription_events").insert({
      subscription_id: subscriptionId,
      event_type: `manual.${action}`,
      provider: sub.provider,
      data: { user_id: user.id, atPeriodEnd, newPriceId, prorate },
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[subscriptions-manage]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
