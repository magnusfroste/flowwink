import { getServiceClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Body {
  event_type: 'sign_in' | 'sign_out' | 'sign_up' | 'failed_login' | 'password_reset' | 'token_refreshed';
  user_id?: string | null;
  email?: string | null;
  user_agent?: string | null;
  device_type?: string | null;
  browser?: string | null;
  metadata?: Record<string, unknown>;
}

function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip')?.trim()
    || req.headers.get('cf-connecting-ip')?.trim()
    || '';
}

async function getGeo(ip: string): Promise<{ country?: string; city?: string }> {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return {};
  }
  try {
    const r = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city`);
    if (!r.ok) return {};
    const d = await r.json();
    if (d.status === 'success') return { country: d.country, city: d.city };
  } catch (_) { /* ignore */ }
  return {};
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body: Body = await req.json();
    if (!body.event_type) {
      return new Response(JSON.stringify({ error: 'event_type required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ip = getClientIp(req);
    const geo = await getGeo(ip);
    const supabase = getServiceClient();

    const { error } = await supabase.from('auth_events').insert({
      event_type: body.event_type,
      user_id: body.user_id ?? null,
      email: body.email ?? null,
      ip_address: ip || null,
      user_agent: body.user_agent ?? null,
      device_type: body.device_type ?? null,
      browser: body.browser ?? null,
      country: geo.country ?? null,
      city: geo.city ?? null,
      metadata: body.metadata ?? {},
    });

    if (error) {
      console.error('[track-auth-event] insert failed:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[track-auth-event] error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
