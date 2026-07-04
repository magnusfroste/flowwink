// Cron-invoked (see register_flowpilot_cron, job 'booking-reminders', every 15 min):
// sweeps confirmed bookings starting within ~24h with reminder_sent_at still
// NULL, emails a reminder, and stamps reminder_sent_at so it is never re-sent.
// Mirrors send-booking-confirmation's settings lookup + email-send dispatch —
// this is the same class of transactional email, just a different template.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getServiceClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface EmailConfig {
  fromEmail: string;
  fromName: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getServiceClient();

    const [siteSettingsRes, integrationSettingsRes, moduleSettingsRes] = await Promise.all([
      supabase.from("site_settings").select("value").eq("key", "general").maybeSingle(),
      supabase.from("site_settings").select("value").eq("key", "integrations").maybeSingle(),
      supabase.from("site_settings").select("value").eq("key", "modules").maybeSingle(),
    ]);

    const siteSettings = siteSettingsRes.data;
    const integrationSettings = integrationSettingsRes.data;
    const moduleSettings = moduleSettingsRes.data;

    const bookingsConfig = (moduleSettings?.value as any)?.bookings;
    if (bookingsConfig && bookingsConfig.reminderEmailEnabled === false) {
      console.log("[send-booking-reminders] Reminder email disabled in module settings");
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "reminder_email_disabled" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const siteName = (siteSettings?.value as { siteName?: string })?.siteName || "Our Website";
    const resendSettings = (integrationSettings?.value as any)?.resend;
    const emailConfig: EmailConfig = resendSettings?.config?.emailConfig || {
      fromEmail: "onboarding@resend.dev",
      fromName: siteName,
    };

    // Window: confirmed bookings starting between now and now+24h, never reminded.
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select(`
        id, customer_name, customer_email, start_time, end_time, notes,
        service:booking_services(name, duration_minutes)
      `)
      .eq("status", "confirmed")
      .is("reminder_sent_at", null)
      .gte("start_time", now.toISOString())
      .lte("start_time", windowEnd.toISOString())
      .limit(100);

    if (bookingsError) throw new Error(`Fetch bookings failed: ${bookingsError.message}`);

    let sent = 0;
    let failed = 0;

    for (const booking of bookings ?? []) {
      try {
        const startDate = new Date(booking.start_time);
        const endDate = new Date(booking.end_time);
        const dateOptions: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const timeOptions: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
        const formattedDate = startDate.toLocaleDateString('en-US', dateOptions);
        const formattedStartTime = startDate.toLocaleTimeString('en-US', timeOptions);
        const formattedEndTime = endDate.toLocaleTimeString('en-US', timeOptions);
        const service = booking.service as unknown as { name?: string; duration_minutes?: number } | null;

        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Booking Reminder</title>
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">Upcoming Appointment Reminder</h1>
            </div>
            <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
              <p style="font-size: 16px;">Hello ${booking.customer_name}!</p>
              <p>This is a friendly reminder about your upcoming appointment:</p>
              <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">
                ${service?.name ? `<p><strong>Service:</strong> ${service.name}</p>` : ''}
                <p><strong>Date:</strong> ${formattedDate}</p>
                <p><strong>Time:</strong> ${formattedStartTime} - ${formattedEndTime}</p>
                ${service?.duration_minutes ? `<p><strong>Duration:</strong> ${service.duration_minutes} minutes</p>` : ''}
              </div>
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

        const { error: emailError } = await supabase.functions.invoke('email-send', {
          body: {
            to: booking.customer_email,
            subject: `Reminder: Your appointment on ${formattedDate}`,
            html: emailHtml,
            fromOverride: `${emailConfig.fromName} <${emailConfig.fromEmail}>`,
            tags: { source: 'send-booking-reminders', booking_id: booking.id },
          },
        });
        if (emailError) throw new Error(`email-send failed: ${emailError.message ?? emailError}`);

        await supabase
          .from("bookings")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", booking.id);

        sent++;
      } catch (perBookingError: unknown) {
        failed++;
        console.error(`[send-booking-reminders] Failed for booking ${booking.id}:`, perBookingError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, checked: (bookings ?? []).length, sent, failed }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error in send-booking-reminders function:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
