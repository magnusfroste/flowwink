// Clawable: list available models from a peer's /v1/models endpoint
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getAnonClient, getServiceClient, getUserClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  peer_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const userClient = getUserClient(authHeader)!;
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = getServiceClient();
    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('role', 'admin')
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: RequestBody = await req.json();
    if (!body.peer_id) {
      return new Response(JSON.stringify({ error: 'peer_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: peer, error: peerErr } = await admin
      .from('a2a_peers')
      .select('id, name, url, gateway_token')
      .eq('id', body.peer_id)
      .single();

    if (peerErr || !peer) {
      return new Response(JSON.stringify({ error: 'Peer not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!peer.url || !peer.gateway_token) {
      return new Response(JSON.stringify({ error: 'Peer missing url or gateway_token' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const endpoint = peer.url.replace(/\/$/, '') + '/v1/models';
    const peerRes = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${peer.gateway_token}`,
        'Accept': 'application/json',
      },
    });

    const raw = await peerRes.text();
    if (!peerRes.ok) {
      return new Response(JSON.stringify({
        error: 'Peer error', status: peerRes.status, body: raw.slice(0, 1000),
      }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let parsed: any;
    try { parsed = JSON.parse(raw); } catch {
      return new Response(JSON.stringify({ error: 'Peer returned non-JSON', body: raw.slice(0, 500) }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // OpenAI-compatible: { object: 'list', data: [{ id, ... }, ...] }
    const items: any[] = Array.isArray(parsed) ? parsed
      : Array.isArray(parsed?.data) ? parsed.data
      : Array.isArray(parsed?.models) ? parsed.models
      : [];

    const models = items
      .map((m) => ({
        id: typeof m === 'string' ? m : (m.id ?? m.name ?? m.slug ?? null),
        owned_by: m?.owned_by ?? m?.provider ?? null,
      }))
      .filter((m) => !!m.id);

    return new Response(JSON.stringify({ ok: true, models, raw: parsed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[clawable-list-models]', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
