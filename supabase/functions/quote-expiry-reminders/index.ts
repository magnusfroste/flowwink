// Quote expiry reminder sweep — cron-invoked (see agent_automations "Quote
// Expiry Reminders", migration 20260703130500_quote-expiry-reminders.sql).
//
// Finds sent quotes whose valid_until is within the next 48h or up to 3 days
// past (grace window), and that have not been reminded yet, then emails each
// one via the existing send-quote-email -> email-send pipeline (the same
// pipeline the manual "Send Reminder" button uses). Stamps
// expiry_reminder_sent_at so a quote is never reminded twice.
import { getServiceClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const REMINDER_WINDOW_AHEAD_MS = 48 * 60 * 60 * 1000;
const REMINDER_GRACE_BEHIND_MS = 3 * 24 * 60 * 60 * 1000;

function dateOnly(d: Date): string {
  return d.toISOString().split('T')[0];
}

async function resolveSiteOrigin(supabase: ReturnType<typeof getServiceClient>): Promise<string> {
  let origin = Deno.env.get('PUBLIC_SITE_URL') || '';
  if (!origin) {
    const { data: setting } = await supabase.from('site_settings')
      .select('value').eq('key', 'general').maybeSingle();
    const v = (setting?.value as any) || {};
    origin = v.siteUrl || v.site_url || v.public_url || v.publicUrl || '';
  }
  return origin.replace(/\/$/, '');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const supabase = getServiceClient();
    const now = new Date();
    const windowEnd = dateOnly(new Date(now.getTime() + REMINDER_WINDOW_AHEAD_MS));
    const graceStart = dateOnly(new Date(now.getTime() - REMINDER_GRACE_BEHIND_MS));

    const { data: due, error } = await supabase
      .from('quotes')
      .select('id, quote_number, accept_token, valid_until, customer_email, leads(email)')
      .eq('status', 'sent')
      .is('expiry_reminder_sent_at', null)
      .not('valid_until', 'is', null)
      .gte('valid_until', graceStart)
      .lte('valid_until', windowEnd)
      .limit(100);

    if (error) throw new Error(`Query failed: ${error.message}`);

    const origin = await resolveSiteOrigin(supabase);

    let sent = 0;
    let skipped = 0;
    const errors: Array<{ quote_id: string; error: string }> = [];

    for (const q of due ?? []) {
      const email = q.customer_email || (q as any).leads?.email;
      const token = (q as any).accept_token;
      if (!email || !token || !origin) {
        skipped++;
        continue;
      }
      const url = `${origin}/quote/${token}`;
      try {
        const { data: sendData, error: sendErr } = await supabase.functions.invoke('send-quote-email', {
          body: { quote_id: q.id, public_url: url, reminder: true },
        });
        if (sendErr) throw new Error(sendErr.message);
        if (!sendData?.success) throw new Error(sendData?.error || 'send-quote-email returned failure');

        await supabase.from('quotes')
          .update({ expiry_reminder_sent_at: new Date().toISOString() })
          .eq('id', q.id);
        sent++;
      } catch (e) {
        errors.push({ quote_id: q.id, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return new Response(
      JSON.stringify({ success: true, checked: (due ?? []).length, sent, skipped, errors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[quote-expiry-reminders]', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
