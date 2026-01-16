import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OrderConfirmationRequest {
  orderId: string;
}

interface EmailConfig {
  fromEmail: string;
  fromName: string;
}

const formatPrice = (cents: number, currency: string) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
  }).format(cents / 100);
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { orderId }: OrderConfirmationRequest = await req.json();

    if (!orderId) {
      throw new Error("Order ID is required");
    }

    console.log("[send-order-confirmation] Processing order:", orderId);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch order details
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      throw new Error(`Order not found: ${orderError?.message}`);
    }

    console.log("[send-order-confirmation] Found order:", order.id);

    // Fetch order items
    const { data: items, error: itemsError } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderId);

    if (itemsError) {
      console.error("[send-order-confirmation] Error fetching items:", itemsError);
    }

    const orderItems = items || [];
    console.log("[send-order-confirmation] Found items:", orderItems.length);

    // Fetch site settings for branding
    const { data: siteSettings } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "general")
      .maybeSingle();

    const { data: integrationSettings } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "integrations")
      .maybeSingle();

    const siteName = (siteSettings?.value as { siteName?: string })?.siteName || "Our Store";
    
    // Get email configuration from integrations
    const resendSettings = (integrationSettings?.value as any)?.resend;
    const emailConfig: EmailConfig = resendSettings?.config?.emailConfig || {
      fromEmail: "onboarding@resend.dev",
      fromName: "Order",
    };

    console.log(`[send-order-confirmation] Using sender: ${emailConfig.fromName} <${emailConfig.fromEmail}>`);

    // Build items HTML
    const itemsHtml = orderItems
      .map(
        (item) => `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.product_name}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatPrice(item.price_cents * item.quantity, order.currency)}</td>
        </tr>
      `
      )
      .join("");

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9fafb; margin: 0; padding: 40px 20px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <div style="background-color: #18181b; padding: 32px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Order Confirmation</h1>
            </div>
            
            <div style="padding: 32px;">
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                Hello${order.customer_name ? ` ${order.customer_name}` : ""}!
              </p>
              
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                Thank you for your order! We have received your payment and your order is now being processed.
              </p>

              <div style="background-color: #f9fafb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <h2 style="color: #18181b; font-size: 18px; margin: 0 0 16px;">Order Details</h2>
                <table style="width: 100%; border-collapse: collapse;">
                  <thead>
                    <tr style="background-color: #e5e7eb;">
                      <th style="padding: 12px; text-align: left; font-size: 14px;">Product</th>
                      <th style="padding: 12px; text-align: center; font-size: 14px;">Quantity</th>
                      <th style="padding: 12px; text-align: right; font-size: 14px;">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${itemsHtml}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colspan="2" style="padding: 16px 12px; font-weight: bold; font-size: 16px;">Total</td>
                      <td style="padding: 16px 12px; font-weight: bold; font-size: 16px; text-align: right;">${formatPrice(order.total_cents, order.currency)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div style="background-color: #f9fafb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <h3 style="color: #18181b; font-size: 14px; margin: 0 0 12px;">Order Information</h3>
                <p style="color: #6b7280; font-size: 14px; margin: 0; line-height: 1.8;">
                  <strong>Order ID:</strong> ${order.id.slice(0, 8)}...<br>
                  <strong>Email:</strong> ${order.customer_email}<br>
                  <strong>Date:</strong> ${new Date(order.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>

              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0;">
                If you have any questions, please don't hesitate to contact us.
              </p>
            </div>

            <div style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                ${siteName} — This is an automated message. Please do not reply to this email.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const emailResponse = await resend.emails.send({
      from: `${emailConfig.fromName} <${emailConfig.fromEmail}>`,
      to: [order.customer_email],
      subject: `Order Confirmation - ${order.id.slice(0, 8)}`,
      html: emailHtml,
    });

    console.log("[send-order-confirmation] Email sent:", emailResponse);

    // Update order with confirmation timestamp
    const { error: updateError } = await supabase
      .from("orders")
      .update({ confirmation_sent_at: new Date().toISOString() })
      .eq("id", orderId);

    if (updateError) {
      console.error("[send-order-confirmation] Failed to update timestamp:", updateError);
    }

    return new Response(JSON.stringify({ success: true, emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("[send-order-confirmation] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});