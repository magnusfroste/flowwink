// Clawable — unified admin chat + model listing for OpenClaw peers
// Actions: chat, list-models
import { getAnonClient, getServiceClient, getUserClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Shared auth guard ───────────────────────────────────────────────────────
async function requireAdmin(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
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
  return null; // authenticated
}

// ─── Action: chat ────────────────────────────────────────────────────────────
async function handleChat(req: Request): Promise<Response> {
  const admin = getServiceClient();
  const body = await req.json() as { session_id: string; message: string };
  if (!body.session_id || !body.message) {
    return new Response(JSON.stringify({ error: 'session_id and message required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: session, error: sessErr } = await admin
    .from('clawable_sessions')
    .select('*, a2a_peers!inner(id, name, url, gateway_token)')
    .eq('id', body.session_id)
    .single();

  if (sessErr || !session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const peer = (session as any).a2a_peers;
  if (!peer.url || !peer.gateway_token) {
    return new Response(JSON.stringify({ error: 'Peer missing url or gateway_token' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  await admin.from('clawable_messages').insert({
    session_id: session.id,
    role: 'user',
    content: body.message,
  });

  const provider = session.model || 'openclaw';
  let model: string;
  if (session.agent_id) {
    model = session.agent_id.includes('/')
      ? session.agent_id
      : `${provider}/${session.agent_id}`;
  } else {
    model = provider;
  }

  const payload: Record<string, unknown> = { model, input: body.message, store: true };
  if (session.last_response_id) {
    payload.previous_response_id = session.last_response_id;
  }

  const endpoint = peer.url.replace(/\/$/, '') + '/v1/responses';
  const peerRes = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${peer.gateway_token}`,
    },
    body: JSON.stringify(payload),
  });

  const raw = await peerRes.text();
  if (!peerRes.ok) {
    await admin.from('clawable_messages').insert({
      session_id: session.id,
      role: 'system',
      content: `[Error ${peerRes.status}] ${raw.slice(0, 500)}`,
    });
    return new Response(JSON.stringify({ error: 'Peer error', status: peerRes.status, body: raw }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { parsed = { output_text: raw }; }

  let assistantText = '';
  if (typeof parsed.output_text === 'string') {
    assistantText = parsed.output_text;
  } else if (Array.isArray(parsed.output)) {
    for (const item of parsed.output) {
      if (item?.content && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (typeof c.text === 'string') assistantText += c.text;
          else if (c.text?.value) assistantText += c.text.value;
        }
      }
    }
  }
  if (!assistantText) assistantText = '(empty response)';

  const responseId = parsed.id || parsed.response_id || null;

  await admin.from('clawable_messages').insert({
    session_id: session.id,
    role: 'assistant',
    content: assistantText,
    response_id: responseId,
  });

  if (responseId) {
    await admin
      .from('clawable_sessions')
      .update({ last_response_id: responseId })
      .eq('id', session.id);
  }

  return new Response(JSON.stringify({ ok: true, content: assistantText, response_id: responseId }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─── Action: list-models ─────────────────────────────────────────────────────
async function handleListModels(req: Request): Promise<Response> {
  const admin = getServiceClient();
  const body = await req.json() as { peer_id: string };
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
    headers: { 'Authorization': `Bearer ${peer.gateway_token}`, 'Accept': 'application/json' },
  });

  const raw = await peerRes.text();
  if (!peerRes.ok) {
    return new Response(JSON.stringify({ error: 'Peer error', status: peerRes.status, body: raw.slice(0, 1000) }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let parsed: any;
  try { parsed = JSON.parse(raw); } catch {
    return new Response(JSON.stringify({ error: 'Peer returned non-JSON', body: raw.slice(0, 500) }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

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
}

// ─── Router ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || req.headers.get('X-Action');

    switch (action) {
      case 'chat': return await handleChat(req);
      case 'list-models': return await handleListModels(req);
      default:
        return new Response(JSON.stringify({ error: 'Unknown action. Use: chat, list-models' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (e) {
    console.error('[clawable]', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
