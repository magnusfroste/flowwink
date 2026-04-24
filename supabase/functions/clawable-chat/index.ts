// Clawable POC chat proxy — calls peer's /v1/responses with previous_response_id chaining
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  session_id: string;
  message: string;
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
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
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
    if (!body.session_id || !body.message) {
      return new Response(JSON.stringify({ error: 'session_id and message required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load session + peer
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

    // Save user message
    await admin.from('clawable_messages').insert({
      session_id: session.id,
      role: 'user',
      content: body.message,
    });

    // Build /v1/responses request — chain via previous_response_id when available
    const model = session.agent_id
      ? `${session.model || 'openclaw'}/${session.agent_id}`
      : (session.model || 'openclaw');

    const payload: Record<string, unknown> = {
      model,
      input: body.message,
      store: true,
    };
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

    // Extract assistant text — OpenAI /v1/responses returns { output: [{content:[{text}]}] } or output_text
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

    // Save assistant message
    await admin.from('clawable_messages').insert({
      session_id: session.id,
      role: 'assistant',
      content: assistantText,
      response_id: responseId,
    });

    // Update session chain
    if (responseId) {
      await admin
        .from('clawable_sessions')
        .update({ last_response_id: responseId })
        .eq('id', session.id);
    }

    return new Response(JSON.stringify({
      ok: true,
      content: assistantText,
      response_id: responseId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[clawable-chat]', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
