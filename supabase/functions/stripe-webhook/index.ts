import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
      throw new Error("Stripe secret key not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2023-10-16",
    });

    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    let event: Stripe.Event;

    // Verify webhook signature if secret is configured
    if (webhookSecret && signature) {
      try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      } catch (err: any) {
        console.error("Webhook signature verification failed:", err.message);
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // Parse without verification (development mode)
      event = JSON.parse(body);
      console.log("Warning: Webhook signature not verified");
    }

    console.log("Received Stripe event:", event.type);

    switch (event.type) {
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
