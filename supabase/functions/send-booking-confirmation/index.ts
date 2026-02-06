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

interface EmailConfig {
  fromEmail: string;
  fromName: string;
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

    // === LEAD GENERATION: Create or update lead from booking ===
    try {
      const bookingDate = new Date(booking.start_time).toISOString();
      const serviceName = booking.service?.name || 'Unknown Service';
      
      // Check if lead exists
      const { data: existingLead } = await supabase
        .from("leads")
        .select("id, phone")
        .eq("email", booking.customer_email)
        .maybeSingle();

      if (existingLead) {
        // Add booking activity to existing lead
        await supabase.from("lead_activities").insert({
          lead_id: existingLead.id,
          type: "booking",
          points: 10,
          metadata: {
            booking_id: bookingId,
            service_name: serviceName,
            booking_date: bookingDate,
          },
        });

        // Update score
        const { data: activities } = await supabase
          .from("lead_activities")
          .select("points")
          .eq("lead_id", existingLead.id);

        if (activities) {
          const totalScore = activities.reduce((sum: number, a: { points: number | null }) => sum + (a.points || 0), 0);
          await supabase.from("leads").update({ score: totalScore }).eq("id", existingLead.id);
        }

        // Update phone if not set
        if (booking.customer_phone && !existingLead.phone) {
          await supabase
            .from("leads")
            .update({ phone: booking.customer_phone })
            .eq("id", existingLead.id);
        }

        console.log(`[send-booking-confirmation] Updated existing lead: ${existingLead.id}`);

        // Trigger AI qualification (fire-and-forget)
        supabase.functions.invoke("qualify-lead", { body: { leadId: existingLead.id } })
          .catch((err: unknown) => console.warn("[send-booking-confirmation] Lead qualification error:", err));
      } else {
        // Auto-match or create company by email domain
        let companyId: string | null = null;
        let isNewCompany = false;
        const emailParts = booking.customer_email.toLowerCase().split("@");
        
        if (emailParts.length === 2) {
          const domain = emailParts[1];
          const personalDomains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "live.com", "msn.com", "aol.com"];
          
          if (!personalDomains.includes(domain)) {
            // Try to find existing company by domain
            const { data: existingCompany } = await supabase
              .from("companies")
              .select("id")
              .eq("domain", domain)
              .maybeSingle();

            if (existingCompany) {
              companyId = existingCompany.id;
            } else {
              // Create new company from domain
              const companyName = domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1);
              const { data: newCompany } = await supabase
                .from("companies")
                .insert({ name: companyName, domain })
                .select("id")
                .single();

              if (newCompany) {
                companyId = newCompany.id;
                isNewCompany = true;
              }
            }
          }
        }

        // Create new lead
        const { data: newLead } = await supabase
          .from("leads")
          .insert({
            email: booking.customer_email,
            name: booking.customer_name,
            company_id: companyId,
            phone: booking.customer_phone || null,
            source: "booking",
            source_id: bookingId,
            status: "lead",
            score: 10,
            needs_review: false,
          })
          .select()
          .single();

        if (newLead) {
          // Add initial booking activity
          await supabase.from("lead_activities").insert({
            lead_id: newLead.id,
            type: "booking",
            points: 10,
            metadata: {
              booking_id: bookingId,
              service_name: serviceName,
              booking_date: bookingDate,
              is_initial: true,
              auto_matched_company: !!companyId,
            },
          });

          console.log(`[send-booking-confirmation] Created new lead: ${newLead.id}`);

          // Trigger AI qualification (fire-and-forget)
          supabase.functions.invoke("qualify-lead", { body: { leadId: newLead.id } })
            .catch((err: unknown) => console.warn("[send-booking-confirmation] Lead qualification error:", err));

          // Trigger company enrichment for new companies (fire-and-forget)
          if (companyId && isNewCompany) {
            supabase.functions.invoke("enrich-company", { body: { companyId } })
              .catch((err: unknown) => console.warn("[send-booking-confirmation] Company enrichment error:", err));
          }
        }
      }
    } catch (leadError) {
      console.warn("[send-booking-confirmation] Lead creation error:", leadError);
      // Continue with email sending - don't fail the booking confirmation
    }

    // Fetch site settings for branding and email config
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

    const siteName = (siteSettings?.value as { siteName?: string })?.siteName || "Our Website";
    
    // Get email configuration from integrations
    const resendSettings = (integrationSettings?.value as any)?.resend;
    const emailConfig: EmailConfig = resendSettings?.config?.emailConfig || {
      fromEmail: "onboarding@resend.dev",
      fromName: siteName,
    };

    console.log(`[send-booking-confirmation] Using sender: ${emailConfig.fromName} <${emailConfig.fromEmail}>`);

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

    const formattedDate = startDate.toLocaleDateString('en-US', dateOptions);
    const formattedStartTime = startDate.toLocaleTimeString('en-US', timeOptions);
    const formattedEndTime = endDate.toLocaleTimeString('en-US', timeOptions);

    // Format price if service has one
    let priceText = '';
    if (booking.service?.price_cents && booking.service.price_cents > 0) {
      const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: booking.service.currency || 'USD',
        minimumFractionDigits: 0,
      });
      priceText = `<p><strong>Price:</strong> ${formatter.format(booking.service.price_cents / 100)}</p>`;
    }

    // Build email HTML
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Booking Confirmation</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Booking Confirmation</h1>
        </div>
        
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="font-size: 16px;">Hello ${booking.customer_name}!</p>
          
          <p>Thank you for your booking. Here are your booking details:</p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">
            ${booking.service ? `<p><strong>Service:</strong> ${booking.service.name}</p>` : ''}
            <p><strong>Date:</strong> ${formattedDate}</p>
            <p><strong>Time:</strong> ${formattedStartTime} - ${formattedEndTime}</p>
            ${booking.service?.duration_minutes ? `<p><strong>Duration:</strong> ${booking.service.duration_minutes} minutes</p>` : ''}
            ${priceText}
          </div>
          
          ${booking.notes ? `
          <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Your note:</strong></p>
            <p style="margin: 5px 0 0 0;">${booking.notes}</p>
          </div>
          ` : ''}
          
          <p style="color: #6b7280; font-size: 14px;">
            If you need to change or cancel your booking, please contact us as soon as possible.
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
      from: `${emailConfig.fromName} <${emailConfig.fromEmail}>`,
      to: [booking.customer_email],
      subject: `Booking Confirmation - ${formattedDate}`,
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