// Proxies 46elks (and future provider) voicemail recordings so the browser
// doesn't get a Basic Auth popup. The recording URL is looked up from
// `voice_calls.recording_url` by call id; provider credentials stay server-side.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range, x-chat-session',
  'Access-Control-Expose-Headers': 'content-length, content-range, accept-ranges',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const callId = url.searchParams.get('id');
    if (!callId) {
      return new Response(JSON.stringify({ error: 'missing id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: call, error } = await supabase
      .from('voice_calls')
      .select('recording_url, provider')
      .eq('id', callId)
      .maybeSingle();

    if (error || !call?.recording_url) {
      return new Response(JSON.stringify({ error: 'recording not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const headers: Record<string, string> = {};
    // 46elks recordings require Basic Auth with API username/password
    if ((call.provider ?? 'elks46') === 'elks46') {
      const u = Deno.env.get('ELKS46_API_USERNAME');
      const p = Deno.env.get('ELKS46_API_PASSWORD');
      if (u && p) headers['Authorization'] = `Basic ${btoa(`${u}:${p}`)}`;
    }
    const range = req.headers.get('range');
    if (range) headers['Range'] = range;

    const upstream = await fetch(call.recording_url, { headers });
    const respHeaders = new Headers(corsHeaders);
    respHeaders.set('Content-Type', upstream.headers.get('content-type') ?? 'audio/mpeg');
    const cl = upstream.headers.get('content-length');
    if (cl) respHeaders.set('Content-Length', cl);
    const cr = upstream.headers.get('content-range');
    if (cr) respHeaders.set('Content-Range', cr);
    const ar = upstream.headers.get('accept-ranges');
    if (ar) respHeaders.set('Accept-Ranges', ar);
    respHeaders.set('Cache-Control', 'private, max-age=300');

    return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
