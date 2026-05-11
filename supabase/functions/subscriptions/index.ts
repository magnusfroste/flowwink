/**
 * Subscriptions — Unified Router
 *
 * Single edge function consolidating:
 *   - subscriptions-checkout  → action: "checkout"
 *   - subscriptions-portal    → action: "portal"
 *   - subscriptions-manage    → action: "manage"
 *   - subscriptions-skills    → action: "skill"  (or _skill / skill_name in body, used by agent-execute)
 *
 * Dispatch precedence:
 *   1. explicit body.action
 *   2. body._skill / body.skill_name / body.skill  (FlowPilot/agent-execute path)
 *
 * Auth/role checks are preserved per-action exactly as before.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { getProvider, type SubscriptionProviderId } from "../_shared/subscription-providers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let body: Record<string, any> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Skill dispatch wins if a skill name is present (agent-execute path).
  const skillName = body._skill || body.skill_name || (body.action === "skill" ? body.skill : null);
  let action: string = body.action ?? "";
  if (skillName && action !== "checkout" && action !== "portal" && action !== "manage") {
    action = "skill";
  }

  try {
    switch (action) {
      case "checkout":
        return json(await handleCheckout(req, body));
      case "portal":
        return json(await handlePortal(req, body));
      case "manage":
        return json(await handleManage(req, body));
      case "skill":
        return json(await handleSkill(skillName as string, body));
      default:
        return json(
          { error: `Unknown action: '${action}'. Expected one of: checkout | portal | manage | skill (or pass _skill).` },
          400,
        );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[subscriptions:${action}]`, msg);
    return json({ error: msg, success: false }, 400);
  }
});

// ─────────────────────────── checkout ────────────────────────────
async function handleCheckout(req: Request, body: Record<string, any>) {
  const { priceId, successUrl, cancelUrl, trialDays, quantity, provider = "stripe" } = body;
  if (!priceId) throw new Error("priceId is required");

  const supabase = getAnonClient();
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("No authorization header");
  const { data: userData } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  const user = userData.user;
  if (!user?.email) throw new Error("Not authenticated");

  const origin = req.headers.get("origin") ?? "http://localhost:8080";
  const adapter = getProvider(provider as SubscriptionProviderId);
  return await adapter.createCheckout({
    priceId,
    customerEmail: user.email,
    customerId: user.id,
    successUrl: successUrl ?? `${origin}/admin/subscriptions?status=success`,
    cancelUrl: cancelUrl ?? `${origin}/admin/subscriptions?status=canceled`,
    trialDays,
    quantity,
  });
}

// ─────────────────────────── portal ──────────────────────────────
async function handlePortal(req: Request, body: Record<string, any>) {
  const { subscriptionId, providerCustomerId, returnUrl, provider = "stripe" } = body;

  const supabase = getServiceClient();

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
  return { url };
}

// ─────────────────────────── manage ──────────────────────────────
async function handleManage(req: Request, body: Record<string, any>) {
  const { subAction, action: legacyAction, subscriptionId, newPriceId, atPeriodEnd = true, prorate = true } = body;
  // Inside the unified router `action="manage"`. The actual cancel/resume/change_plan
  // is read from `subAction` (preferred) or `action` (legacy, for the proxy stub).
  const op = subAction ?? legacyAction;
  if (!op || !subscriptionId) throw new Error("subAction (cancel|resume|change_plan) and subscriptionId required");

  const auth = req.headers.get("Authorization");
  if (!auth) throw new Error("No authorization header");

  const supabase = getServiceClient();
  const supabaseAuthed = getUserClient(auth)!;
  const { data: userData } = await supabaseAuthed.auth.getUser(auth.replace("Bearer ", ""));
  const user = userData.user;
  if (!user) throw new Error("Not authenticated");

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

  switch (op) {
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
      throw new Error(`Unknown manage operation: ${op}`);
  }

  await supabase.from("subscription_events").insert({
    subscription_id: subscriptionId,
    event_type: `manual.${op}`,
    provider: sub.provider,
    data: { user_id: user.id, atPeriodEnd, newPriceId, prorate },
  });

  return { success: true };
}

// ─────────────────────────── skills ──────────────────────────────
async function handleSkill(skill: string, args: Record<string, any>) {
  if (!skill) return { success: false, error: "Skill name required" };

  const supabase = getServiceClient();

  switch (skill) {
    case "list_subscriptions":   return await listSubscriptions(supabase, args);
    case "subscription_mrr":     return await subscriptionMrr(supabase);
    case "list_dunning_sequences": return await listDunning(supabase, args);
    case "pause_dunning":        return await pauseDunning(supabase, args);
    case "escalate_dunning":     return await escalateDunning(supabase, args);
    default:
      return { success: false, error: `Unknown skill: ${skill}` };
  }
}

async function listSubscriptions(supabase: any, args: Record<string, any>) {
  const limit = Math.min(args.limit ?? 50, 200);
  const status = args.status as string | undefined;
  const q = supabase
    .from("subscriptions")
    .select("id, customer_email, customer_name, product_name, status, billing_interval, unit_amount_cents, currency, current_period_end, canceled_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status) q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return { success: true, data: { count: data?.length ?? 0, subscriptions: data ?? [] } };
}

async function subscriptionMrr(supabase: any) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("unit_amount_cents, quantity, billing_interval, currency, status");
  if (error) throw error;
  const active = (data ?? []).filter((s: any) => s.status === "active" || s.status === "trialing");
  const mrr = active.reduce((sum: number, s: any) => {
    const qty = s.quantity ?? 1;
    const amt = s.unit_amount_cents ?? 0;
    const monthly =
      s.billing_interval === "year" ? (amt * qty) / 12 :
      s.billing_interval === "week" ? amt * qty * 4.33 :
      s.billing_interval === "day"  ? amt * qty * 30 :
      amt * qty;
    return sum + monthly;
  }, 0);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { count: churned } = await supabase
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("status", "canceled")
    .gte("canceled_at", since);
  return {
    success: true,
    data: {
      mrr_cents: Math.round(mrr),
      arr_cents: Math.round(mrr * 12),
      active_count: active.length,
      total_count: data?.length ?? 0,
      churned_30d: churned ?? 0,
      currency: active[0]?.currency ?? "usd",
    },
  };
}

async function listDunning(supabase: any, args: Record<string, any>) {
  const status = (args.status as string) || "active";
  const limit = Math.min(args.limit ?? 50, 200);
  const { data, error } = await supabase
    .from("dunning_sequences")
    .select(`
      id, status, current_step, attempt_count, mrr_at_risk_cents, currency,
      failure_reason, failure_code, next_action_at, created_at, recovered_at,
      paused_until, paused_reason,
      subscriptions:subscription_id ( id, customer_email, customer_name, product_name, status )
    `)
    .eq("status", status)
    .order("mrr_at_risk_cents", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const totalAtRisk = (data ?? []).reduce((s: number, d: any) => s + (d.mrr_at_risk_cents || 0), 0);
  return {
    success: true,
    data: {
      count: data?.length ?? 0,
      total_mrr_at_risk_cents: totalAtRisk,
      sequences: data ?? [],
    },
  };
}

async function pauseDunning(supabase: any, args: Record<string, any>) {
  const subId = args.subscription_id as string | undefined;
  const seqId = args.sequence_id as string | undefined;
  const reason = (args.reason as string) || "Paused by FlowPilot";
  const days = Math.min(args.pause_days ?? 7, 30);
  if (!subId && !seqId) return { success: false, error: "Provide either subscription_id or sequence_id" };

  const pausedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const q = supabase.from("dunning_sequences").update({
    status: "paused",
    paused_reason: reason,
    paused_until: pausedUntil,
    next_action_at: pausedUntil,
  });
  const { data, error } = seqId
    ? await q.eq("id", seqId).eq("status", "active").select()
    : await q.eq("subscription_id", subId).eq("status", "active").select();
  if (error) throw error;
  if (!data || data.length === 0) return { success: false, error: "No active dunning sequence found to pause" };

  await supabase.from("dunning_actions").insert(
    data.map((seq: any) => ({
      sequence_id: seq.id,
      step_number: seq.current_step,
      action_type: "paused",
      triggered_by: "flowpilot",
      metadata: { reason, paused_until: pausedUntil, pause_days: days },
    }))
  );
  return { success: true, data: { paused_count: data.length, paused_until: pausedUntil, sequences: data } };
}

async function escalateDunning(supabase: any, args: Record<string, any>) {
  const subId = args.subscription_id as string | undefined;
  const seqId = args.sequence_id as string | undefined;
  if (!subId && !seqId) return { success: false, error: "Provide either subscription_id or sequence_id" };

  const q = supabase
    .from("dunning_sequences")
    .update({ current_step: 4, next_action_at: new Date().toISOString(), status: "active" });
  const { data, error } = seqId
    ? await q.eq("id", seqId).select()
    : await q.eq("subscription_id", subId).select();
  if (error) throw error;
  if (!data || data.length === 0) return { success: false, error: "No dunning sequence found to escalate" };

  await supabase.from("dunning_actions").insert(
    data.map((seq: any) => ({
      sequence_id: seq.id,
      step_number: seq.current_step,
      action_type: "escalated",
      triggered_by: "flowpilot",
      metadata: { reason: args.reason ?? "Escalated by FlowPilot" },
    }))
  );

  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/dunning-processor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
    });
  } catch (e) {
    console.warn("[escalate_dunning] could not trigger processor immediately:", e);
  }
  return { success: true, data: { escalated_count: data.length, sequences: data } };
}
