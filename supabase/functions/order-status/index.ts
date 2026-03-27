import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const orderId = url.searchParams.get("id");
    const email = url.searchParams.get("email");

    if (!orderId) {
      return new Response(JSON.stringify({ error: "Missing 'id' parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status, total_cents, currency, customer_name, customer_email, created_at, updated_at, metadata")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If email provided, verify it matches (lightweight auth for guests)
    if (email && order.customer_email?.toLowerCase() !== email.toLowerCase()) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch order items
    const { data: items } = await supabase
      .from("order_items")
      .select("id, product_name, quantity, price_cents")
      .eq("order_id", orderId);

    const isSandbox = (order.metadata as any)?.sandbox === true;

    return new Response(JSON.stringify({
      order: {
        id: order.id,
        status: order.status,
        total_cents: order.total_cents,
        currency: order.currency,
        customer_name: order.customer_name,
        customer_email: order.customer_email,
        created_at: order.created_at,
        updated_at: order.updated_at,
        sandbox: isSandbox,
      },
      items: items || [],
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[order-status] Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
