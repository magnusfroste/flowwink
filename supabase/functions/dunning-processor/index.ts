// Dunning processor — runs on cron, advances active dunning sequences
// through their email/escalation timeline.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Timeline (in days from initial failure): step → { delayDays, action, template }
type StepConfig = {
  delayDays: number;
  template?: string;
  finalize?: boolean; // step 5 = cancel subscription
  manualTask?: boolean;
};
const STEPS: StepConfig[] = [
  { delayDays: 0,  template: "dunning-step-1" },   // Day 0: gentle notice
  { delayDays: 3,  template: "dunning-step-2" },   // Day 3: reminder
  { delayDays: 7,  template: "dunning-step-3" },   // Day 7: urgent
  { delayDays: 10, template: "dunning-step-4", manualTask: true }, // Day 10: final + admin task
  { delayDays: 14, template: "dunning-step-5", finalize: true },   // Day 14: cancel
];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: "2023-10-16" }) : null;

    // Pick up to 50 sequences ready to fire
    const { data: due, error } = await supabase
      .from("dunning_sequences")
      .select("id, subscription_id, current_step, attempt_count, mrr_at_risk_cents, currency, failure_reason, provider_invoice_id, subscriptions!inner(id, customer_email, customer_name, product_name, provider_subscription_id, status)")
      .eq("status", "active")
      .lte("next_action_at", new Date().toISOString())
      .limit(50);

    if (error) throw error;

    let processed = 0;
    let recovered = 0;
    let cancelled = 0;
    let emailsSent = 0;

    for (const seq of due ?? []) {
      const sub: any = seq.subscriptions;

      // Safety: if Stripe says subscription is now active/paid, recover and skip
      if (sub?.status === "active" || sub?.status === "trialing") {
        await supabase
          .from("dunning_sequences")
          .update({ status: "recovered", recovered_at: new Date().toISOString(), next_action_at: null })
          .eq("id", seq.id);
        await supabase.from("dunning_actions").insert({
          sequence_id: seq.id,
          step_number: seq.current_step,
          action_type: "recovered",
          triggered_by: "dunning-processor",
          metadata: { reason: "subscription_active_on_check" },
        });
        recovered++;
        continue;
      }

      const stepIdx = seq.current_step;
      const step = STEPS[stepIdx];
      if (!step) {
        // Past last step → mark failed
        await supabase
          .from("dunning_sequences")
          .update({ status: "failed", next_action_at: null })
          .eq("id", seq.id);
        continue;
      }

      // Send the email for this step
      if (step.template && sub?.customer_email) {
        try {
          const messageId = `dunning-${seq.id}-step${stepIdx}`;
          const { error: emailErr } = await supabase.functions.invoke("send-transactional-email", {
            body: {
              templateName: step.template,
              recipientEmail: sub.customer_email,
              idempotencyKey: messageId,
              templateData: {
                name: sub.customer_name ?? "there",
                productName: sub.product_name ?? "your subscription",
                amountCents: seq.mrr_at_risk_cents,
                currency: seq.currency,
                failureReason: seq.failure_reason,
                attemptCount: seq.attempt_count,
              },
            },
          });

          if (emailErr) throw emailErr;

          await supabase.from("dunning_actions").insert({
            sequence_id: seq.id,
            step_number: stepIdx,
            action_type: "email_sent",
            email_template: step.template,
            email_message_id: messageId,
            recipient_email: sub.customer_email,
            triggered_by: "dunning-processor",
          });
          emailsSent++;
        } catch (e: any) {
          console.error(`[dunning] email failed for seq ${seq.id}:`, e);
          await supabase.from("dunning_actions").insert({
            sequence_id: seq.id,
            step_number: stepIdx,
            action_type: "email_failed",
            email_template: step.template,
            recipient_email: sub.customer_email,
            error_message: e?.message ?? String(e),
            triggered_by: "dunning-processor",
          });
        }
      }

      // Create a manual admin task for high-touch step
      if (step.manualTask && seq.mrr_at_risk_cents >= 50000) {
        try {
          await supabase.from("crm_tasks").insert({
            title: `High-value dunning: contact ${sub.customer_name ?? sub.customer_email}`,
            description: `Subscription is past due (${(seq.mrr_at_risk_cents / 100).toFixed(0)} ${seq.currency.toUpperCase()}/mo at risk). Reason: ${seq.failure_reason ?? "unknown"}`,
            priority: "high",
            due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          });
          await supabase.from("dunning_actions").insert({
            sequence_id: seq.id,
            step_number: stepIdx,
            action_type: "manual_task_created",
            triggered_by: "dunning-processor",
          });
        } catch (e) {
          console.error("[dunning] failed to create task:", e);
        }
      }

      // Final step → cancel subscription in Stripe
      if (step.finalize && stripe && sub?.provider_subscription_id) {
        try {
          await stripe.subscriptions.cancel(sub.provider_subscription_id);
          await supabase.from("dunning_actions").insert({
            sequence_id: seq.id,
            step_number: stepIdx,
            action_type: "subscription_cancelled",
            triggered_by: "dunning-processor",
            metadata: { provider_subscription_id: sub.provider_subscription_id },
          });
          await supabase
            .from("dunning_sequences")
            .update({
              status: "failed",
              cancelled_at: new Date().toISOString(),
              next_action_at: null,
            })
            .eq("id", seq.id);
          cancelled++;
          processed++;
          continue;
        } catch (e: any) {
          console.error("[dunning] Stripe cancel failed:", e);
        }
      }

      // Schedule next step
      const nextStepIdx = stepIdx + 1;
      const nextStep = STEPS[nextStepIdx];
      if (nextStep) {
        const nextAt = new Date();
        nextAt.setDate(nextAt.getDate() + (nextStep.delayDays - step.delayDays));
        await supabase
          .from("dunning_sequences")
          .update({
            current_step: nextStepIdx,
            next_action_at: nextAt.toISOString(),
          })
          .eq("id", seq.id);
      } else {
        await supabase
          .from("dunning_sequences")
          .update({ next_action_at: null })
          .eq("id", seq.id);
      }
      processed++;
    }

    return new Response(
      JSON.stringify({ processed, recovered, cancelled, emailsSent, considered: due?.length ?? 0 }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[dunning-processor] error:", e);
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
