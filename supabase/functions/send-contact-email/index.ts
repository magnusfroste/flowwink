// send-contact-email — thin wrapper that delegates to the central
// `email-send` router so provider choice (SMTP/Resend) lives in ONE place.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { to, toName, subject, body } = await req.json();

    if (!to || !subject || !body) {
      throw new Error('Missing required fields: to, subject, body');
    }

    const htmlBody = body
      .split('\n')
      .map((line: string) => line.trim() === '' ? '<br>' : `<p>${line}</p>`)
      .join('');

    const supabase = getServiceClient();

    const { data, error } = await supabase.functions.invoke('email-send', {
      body: {
        to: toName ? `${toName} <${to}>` : to,
        subject,
        html: htmlBody,
        tags: { source: 'send-contact-email' },
      },
    });

    if (error) throw new Error(`email-send failed: ${error.message ?? error}`);

    return new Response(JSON.stringify({ success: true, result: data }), {
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
