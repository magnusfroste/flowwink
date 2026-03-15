import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const { to, toName, subject, body } = await req.json();

    if (!to || !subject || !body) {
      throw new Error('Missing required fields: to, subject, body');
    }

    // Get site settings for sender info
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    let fromEmail = 'noreply@flowwink.com';
    let fromName = 'FlowWink';

    try {
      const settingsRes = await fetch(`${supabaseUrl}/rest/v1/site_settings?key=eq.general`, {
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
        },
      });
      const settings = await settingsRes.json();
      if (settings?.[0]?.value) {
        const val = settings[0].value;
        if (val.site_name) fromName = val.site_name;
      }
    } catch (_) {
      // Use defaults
    }

    // Convert plain text body to simple HTML
    const htmlBody = body
      .split('\n')
      .map((line: string) => line.trim() === '' ? '<br>' : `<p>${line}</p>`)
      .join('');

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: toName ? `${toName} <${to}>` : to,
        subject,
        html: htmlBody,
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      throw new Error(`Resend API error: ${JSON.stringify(resendData)}`);
    }

    return new Response(JSON.stringify({ success: true, id: resendData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('send-contact-email error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
