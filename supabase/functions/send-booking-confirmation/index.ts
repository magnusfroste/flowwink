import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BookingConfirmationRequest {
  bookingId: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bookingId }: BookingConfirmationRequest = await req.json();

    if (!bookingId) {
      console.error("Missing bookingId");
      return new Response(
        JSON.stringify({ error: "Missing bookingId" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Processing booking confirmation for booking: ${bookingId}`);

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch booking with service details
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        *,
        service:booking_services(name, duration_minutes, price_cents, currency)
      `)
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      console.error("Booking not found:", bookingError);
      return new Response(
        JSON.stringify({ error: "Booking not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch site settings for branding
    const { data: siteSettings } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "general")
      .maybeSingle();

    const siteName = (siteSettings?.value as { siteName?: string })?.siteName || "Vår webbplats";

    // Format date and time
    const startDate = new Date(booking.start_time);
    const endDate = new Date(booking.end_time);
    const dateOptions: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    const timeOptions: Intl.DateTimeFormatOptions = { 
      hour: '2-digit', 
      minute: '2-digit' 
    };

    const formattedDate = startDate.toLocaleDateString('sv-SE', dateOptions);
    const formattedStartTime = startDate.toLocaleTimeString('sv-SE', timeOptions);
    const formattedEndTime = endDate.toLocaleTimeString('sv-SE', timeOptions);

    // Format price if service has one
    let priceText = '';
    if (booking.service?.price_cents && booking.service.price_cents > 0) {
      const formatter = new Intl.NumberFormat('sv-SE', {
        style: 'currency',
        currency: booking.service.currency || 'SEK',
        minimumFractionDigits: 0,
      });
      priceText = `<p><strong>Pris:</strong> ${formatter.format(booking.service.price_cents / 100)}</p>`;
    }

    // Build email HTML
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Bokningsbekräftelse</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Bokningsbekräftelse</h1>
        </div>
        
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="font-size: 16px;">Hej ${booking.customer_name}!</p>
          
          <p>Tack för din bokning. Här är dina bokningsdetaljer:</p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">
            ${booking.service ? `<p><strong>Tjänst:</strong> ${booking.service.name}</p>` : ''}
            <p><strong>Datum:</strong> ${formattedDate}</p>
            <p><strong>Tid:</strong> ${formattedStartTime} - ${formattedEndTime}</p>
            ${booking.service?.duration_minutes ? `<p><strong>Längd:</strong> ${booking.service.duration_minutes} minuter</p>` : ''}
            ${priceText}
          </div>
          
          ${booking.notes ? `
          <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Din anteckning:</strong></p>
            <p style="margin: 5px 0 0 0;">${booking.notes}</p>
          </div>
          ` : ''}
          
          <p style="color: #6b7280; font-size: 14px;">
            Om du behöver ändra eller avboka din tid, vänligen kontakta oss så snart som möjligt.
          </p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
            ${siteName}
          </p>
        </div>
      </body>
      </html>
    `;

    // Send email
    const emailResponse = await resend.emails.send({
      from: `${siteName} <onboarding@resend.dev>`,
      to: [booking.customer_email],
      subject: `Bokningsbekräftelse - ${formattedDate}`,
      html: emailHtml,
    });

    console.log("Email sent successfully:", emailResponse);

    // Update booking with confirmation timestamp
    await supabase
      .from("bookings")
      .update({ confirmation_sent_at: new Date().toISOString() })
      .eq("id", bookingId);

    return new Response(
      JSON.stringify({ success: true, emailId: emailResponse.data?.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error in send-booking-confirmation function:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
