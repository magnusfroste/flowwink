import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Helper to trigger CMS webhooks
async function triggerOrderWebhook(
  supabase: any,
  event: "order.created" | "order.paid" | "order.cancelled" | "order.refunded",
  order: any
) {
  try {
    const { data: webhooks } = await supabase
      .from("webhooks")
      .select("*")
      .eq("is_active", true)
      .contains("events", [event]);

    if (!webhooks || webhooks.length === 0) return;

    for (const webhook of webhooks) {
      try {
        const payload = {
          event,
          timestamp: new Date().toISOString(),
          data: {
            id: order.id,
            customer_email: order.customer_email,
            customer_name: order.customer_name,
            total_cents: order.total_cents,
            currency: order.currency,
            status: order.status,
          },
        };

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...(webhook.headers || {}),
        };

        // Add signature if secret is configured
        if (webhook.secret) {
          const encoder = new TextEncoder();
          const key = await crypto.subtle.importKey(
            "raw",
            encoder.encode(webhook.secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"]
          );
          const signature = await crypto.subtle.sign(
            "HMAC",
            key,
            encoder.encode(JSON.stringify(payload))
          );
          headers["X-Webhook-Signature"] = Array.from(new Uint8Array(signature))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
        }

        const startTime = Date.now();
        const response = await fetch(webhook.url, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        const duration = Date.now() - startTime;

        // Log webhook call
        await supabase.from("webhook_logs").insert({
          webhook_id: webhook.id,
          event,
          payload,
          response_status: response.status,
          success: response.ok,
          duration_ms: duration,
          response_body: await response.text().catch(() => null),
        });

        // Update webhook stats
        await supabase
          .from("webhooks")
          .update({
            last_triggered_at: new Date().toISOString(),
            failure_count: response.ok ? 0 : (webhook.failure_count || 0) + 1,
          })
          .eq("id", webhook.id);

        console.log(`Webhook ${webhook.name} triggered for ${event}:`, response.status);
      } catch (err) {
        console.error(`Failed to trigger webhook ${webhook.name}:`, err);
      }
    }
  } catch (err) {
    console.error("Error triggering webhooks:", err);
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!stripeKey) {
      console.error("STRIPE_SECRET_KEY environment variable not configured");
      return new Response(JSON.stringify({ error: "Stripe secret key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2023-10-16",
    });

    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    // Always require signature verification for security
    if (!signature) {
      console.error("Webhook request missing stripe-signature header");
      return new Response(JSON.stringify({ error: "Missing signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Received Stripe event:", event.type);

    // Helper: upsert subscription from Stripe object
    async function upsertSubscription(sub: Stripe.Subscription) {
      let customer: Stripe.Customer | null = null;
      try {
        const c = await stripe.customers.retrieve(sub.customer as string);
        if (!(c as any).deleted) customer = c as Stripe.Customer;
      } catch { /* ignore */ }

      const item = sub.items.data[0];
      const price = item?.price;
      const userIdMeta = (sub.metadata as any)?.user_id ?? null;

      // Try to map provider price → local product
      let productId: string | null = null;
      let productName: string | null = null;
      if (price?.id) {
        const { data: prod } = await supabase
          .from("products").select("id, name")
          .eq("stripe_price_id", price.id).maybeSingle();
        if (prod) { productId = prod.id; productName = prod.name; }
      }

      const row = {
        user_id: userIdMeta,
        customer_email: customer?.email ?? null,
        customer_name: customer?.name ?? null,
        product_id: productId,
        product_name: productName,
        status: sub.status,
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
        provider: "stripe",
        provider_subscription_id: sub.id,
        provider_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
        provider_price_id: price?.id ?? null,
        metadata: sub.metadata ?? {},
      };

      const { data: existing } = await supabase
        .from("subscriptions").select("id")
        .eq("provider", "stripe").eq("provider_subscription_id", sub.id).maybeSingle();

      let subscriptionId: string | null = existing?.id ?? null;
      if (existing) {
        await supabase.from("subscriptions").update(row).eq("id", existing.id);
      } else {
        const { data: inserted } = await supabase
          .from("subscriptions").insert(row).select("id").single();
        subscriptionId = inserted?.id ?? null;
      }

      if (subscriptionId) {
        await supabase.from("subscription_events").insert({
          subscription_id: subscriptionId,
          event_type: event.type,
          provider: "stripe",
          provider_event_id: event.id,
          data: { status: sub.status },
        });
      }
    }

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
      case "customer.subscription.trial_will_end": {
        const sub = event.data.object as Stripe.Subscription;
        await upsertSubscription(sub);
        break;
      }

      case "invoice.payment_failed":
      case "invoice.payment_succeeded": {
        const inv = event.data.object as Stripe.Invoice;
        const subId = inv.subscription as string | null;
        if (subId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subId);
            await upsertSubscription(sub);
          } catch (e) {
            console.error("Failed to fetch subscription for invoice:", e);
          }
        }
        break;
      }

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.order_id;

        if (orderId) {
          console.log("Updating order to paid:", orderId);
          
          const { data: order, error } = await supabase
            .from("orders")
            .update({
              status: "paid",
              stripe_payment_intent: session.payment_intent as string,
            })
            .eq("id", orderId)
            .select()
            .single();

          if (error) {
            console.error("Error updating order:", error);
          } else {
            console.log("Order marked as paid:", orderId);
            // Trigger order.paid webhook
            await triggerOrderWebhook(supabase, "order.paid", order);
            
            // Send order confirmation email
            try {
              const emailResponse = await fetch(
                `${supabaseUrl}/functions/v1/send-order-confirmation`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${supabaseServiceKey}`,
                  },
                  body: JSON.stringify({ orderId }),
                }
              );
              console.log("Order confirmation email triggered:", emailResponse.status);
            } catch (emailError) {
              console.error("Failed to send order confirmation email:", emailError);
            }
          }
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntent = charge.payment_intent as string;
        
        console.log("Charge refunded:", charge.id);
        
        const { data: orders } = await supabase
          .from("orders")
          .select("*")
          .eq("stripe_payment_intent", paymentIntent)
          .limit(1);

        if (orders && orders.length > 0) {
          const { data: order } = await supabase
            .from("orders")
            .update({ status: "refunded" })
            .eq("id", orders[0].id)
            .select()
            .single();
          
          if (order) {
            await triggerOrderWebhook(supabase, "order.refunded", order);
          }
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log("Payment failed:", paymentIntent.id);
        
        const { data: orders } = await supabase
          .from("orders")
          .select("*")
          .eq("stripe_payment_intent", paymentIntent.id)
          .limit(1);

        if (orders && orders.length > 0) {
          const { data: order } = await supabase
            .from("orders")
            .update({ status: "failed" })
            .eq("id", orders[0].id)
            .select()
            .single();
          
          if (order) {
            await triggerOrderWebhook(supabase, "order.cancelled", order);
          }
        }
        break;
      }

      default:
        console.log("Unhandled event type:", event.type);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
