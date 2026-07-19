// Moved VERBATIM from supabase/functions/send-calendar-reminders/index.ts (edge-surface B2).
// Cron-invoked (see register_flowpilot_cron, job 'calendar-reminders', every 15 min):
// sweeps calendar_events with reminder_minutes set that are due within the
// reminder window and never reminded, emails every attendee, and stamps
// reminder_sent_at so it is never re-sent. Mirrors send-booking-reminders.
import { getServiceClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface EmailConfig {
  fromEmail: string;
  fromName: string;
}

interface Attendee { email?: string; name?: string }

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getServiceClient();

    const [siteSettingsRes, integrationSettingsRes] = await Promise.all([
      supabase.from("site_settings").select("value").eq("key", "general").maybeSingle(),
      supabase.from("site_settings").select("value").eq("key", "integrations").maybeSingle(),
    ]);

    const siteSettings = siteSettingsRes.data;
    const integrationSettings = integrationSettingsRes.data;

    const siteName = (siteSettings?.value as { siteName?: string })?.siteName || "Our Website";
    const resendSettings = (integrationSettings?.value as any)?.resend;
    const emailConfig: EmailConfig = resendSettings?.config?.emailConfig || {
      fromEmail: "onboarding@resend.dev",
      fromName: siteName,
    };

    // Fetch upcoming events with reminder_minutes set, not yet sent, still in future.
    // Filter server-side to reminder-due window (starts_at - reminder_minutes*interval).
    const now = new Date();
    // Look at events starting within the next 48 h — safely covers reminder windows up to 24 h.
    const windowEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const { data: events, error: eventsError } = await supabase
      .from("calendar_events")
      .select("id, title, starts_at, ends_at, location, attendees, reminder_minutes")
      .not("reminder_minutes", "is", null)
      .is("reminder_sent_at", null)
      .gte("starts_at", now.toISOString())
      .lte("starts_at", windowEnd.toISOString())
      .limit(200);

    if (eventsError) throw new Error(`Fetch events failed: ${eventsError.message}`);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const evt of events ?? []) {
      try {
        const startsAt = new Date(evt.starts_at as string);
        const reminderMin = Number(evt.reminder_minutes ?? 0);
        const dueAt = new Date(startsAt.getTime() - reminderMin * 60 * 1000);
        if (dueAt > now) {
          // Reminder window has not yet opened.
          skipped++;
          continue;
        }

        const attendees = (Array.isArray(evt.attendees) ? evt.attendees : []) as Attendee[];
        const recipients = attendees
          .map((a) => (typeof a === 'object' && a?.email ? { email: a.email, name: a.name } : null))
          .filter((x): x is { email: string; name?: string } => !!x);

        if (recipients.length > 0) {
          const dateOptions: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
          const timeOptions: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
          const formattedDate = startsAt.toLocaleDateString('en-US', dateOptions);
          const formattedTime = startsAt.toLocaleTimeString('en-US', timeOptions);
          const endsAt = evt.ends_at ? new Date(evt.ends_at as string) : null;
          const formattedEnd = endsAt ? endsAt.toLocaleTimeString('en-US', timeOptions) : '';

          for (const r of recipients) {
            const greeting = r.name ? `Hello ${r.name}!` : 'Hello!';
            const emailHtml = `
              <!DOCTYPE html>
              <html>
              <head><meta charset="utf-8"><title>Event Reminder</title></head>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 24px;">Upcoming Event Reminder</h1>
                </div>
                <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
                  <p style="font-size: 16px;">${greeting}</p>
                  <p>This is a friendly reminder about your upcoming event:</p>
                  <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">
                    <p><strong>${evt.title}</strong></p>
                    <p><strong>Date:</strong> ${formattedDate}</p>
                    <p><strong>Time:</strong> ${formattedTime}${formattedEnd ? ` – ${formattedEnd}` : ''}</p>
                    ${evt.location ? `<p><strong>Location:</strong> ${evt.location}</p>` : ''}
                  </div>
                  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
                  <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">${siteName}</p>
                </div>
              </body>
              </html>
            `;

            const { error: emailError } = await supabase.functions.invoke('email-send', {
              body: {
                to: r.email,
                subject: `Reminder: ${evt.title}`,
                html: emailHtml,
                fromOverride: `${emailConfig.fromName} <${emailConfig.fromEmail}>`,
                tags: { source: 'send-calendar-reminders', event_id: evt.id },
              },
            });
            if (emailError) throw new Error(`email-send failed: ${emailError.message ?? emailError}`);
            sent++;
          }
        }

        // Stamp reminder_sent_at even when there are no attendees so events
        // are not re-processed on every sweep.
        await supabase
          .from("calendar_events")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", evt.id);
      } catch (perEventError: unknown) {
        failed++;
        console.error(`[send-calendar-reminders] Failed for event ${evt.id}:`, perEventError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, checked: (events ?? []).length, sent, failed, skipped }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error in send-calendar-reminders function:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

