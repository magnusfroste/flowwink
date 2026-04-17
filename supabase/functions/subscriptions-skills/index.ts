// Subscriptions & Dunning skills router for FlowPilot.
// Single edge function exposing 5 skills via `agent-execute` (handler: 'edge:subscriptions-skills').
// FlowPilot dispatches by skill name in the request body.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Args = Record<string, any> & { skill_name?: string; _skill?: string };

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const body: Args = await req.json().catch(() => ({}));
    // agent-execute spreads skill args directly; the skill name is also passed as `_skill` for routing.
    const skill = body._skill || body.skill_name || body.skill || "";

    let result: any;
    switch (skill) {
      case "list_subscriptions":
        result = await listSubscriptions(supabase, body);
        break;
      case "subscription_mrr":
        result = await subscriptionMrr(supabase);
        break;
      case "list_dunning_sequences":
        result = await listDunning(supabase, body);
        break;
      case "pause_dunning":
        result = await pauseDunning(supabase, body);
        break;
      case "escalate_dunning":
        result = await escalateDunning(supabase, body);
        break;
      default:
        return json({ success: false, error: `Unknown skill: ${skill}` }, 400);
    }

    return json(result);
  } catch (e: any) {
    console.error("[subscriptions-skills] error:", e);
    return json({ success: false, error: e?.message ?? String(e) }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── list_subscriptions ─────────────────────────────────────────────
async function listSubscriptions(supabase: any, args: Args) {
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
  return {
    success: true,
    data: {
      count: data?.length ?? 0,
      subscriptions: data ?? [],
    },
  };
}

// ─── subscription_mrr ───────────────────────────────────────────────
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

  // Churn last 30 days
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

// ─── list_dunning_sequences ─────────────────────────────────────────
async function listDunning(supabase: any, args: Args) {
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

// ─── pause_dunning ──────────────────────────────────────────────────
async function pauseDunning(supabase: any, args: Args) {
  const subId = args.subscription_id as string | undefined;
  const seqId = args.sequence_id as string | undefined;
  const reason = (args.reason as string) || "Paused by FlowPilot";
  const days = Math.min(args.pause_days ?? 7, 30);

  if (!subId && !seqId) {
    return { success: false, error: "Provide either subscription_id or sequence_id" };
  }

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
  if (!data || data.length === 0) {
    return { success: false, error: "No active dunning sequence found to pause" };
  }

  // Audit
  await supabase.from("dunning_actions").insert(
    data.map((seq: any) => ({
      sequence_id: seq.id,
      step_number: seq.current_step,
      action_type: "paused",
      triggered_by: "flowpilot",
      metadata: { reason, paused_until: pausedUntil, pause_days: days },
    }))
  );

  return {
    success: true,
    data: { paused_count: data.length, paused_until: pausedUntil, sequences: data },
  };
}

// ─── escalate_dunning ───────────────────────────────────────────────
async function escalateDunning(supabase: any, args: Args) {
  const subId = args.subscription_id as string | undefined;
  const seqId = args.sequence_id as string | undefined;
  if (!subId && !seqId) {
    return { success: false, error: "Provide either subscription_id or sequence_id" };
  }

  // Jump to last step (index 4 = day-14 final cancel) and fire immediately.
  const q = supabase
    .from("dunning_sequences")
    .update({ current_step: 4, next_action_at: new Date().toISOString(), status: "active" });
  const { data, error } = seqId
    ? await q.eq("id", seqId).select()
    : await q.eq("subscription_id", subId).select();
  if (error) throw error;
  if (!data || data.length === 0) {
    return { success: false, error: "No dunning sequence found to escalate" };
  }

  await supabase.from("dunning_actions").insert(
    data.map((seq: any) => ({
      sequence_id: seq.id,
      step_number: seq.current_step,
      action_type: "escalated",
      triggered_by: "flowpilot",
      metadata: { reason: args.reason ?? "Escalated by FlowPilot" },
    }))
  );

  // Trigger the processor right away
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
