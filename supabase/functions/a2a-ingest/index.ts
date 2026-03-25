import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Extract bearer token
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');

    // Create admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Hash the token and look up peer
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(token));
    const tokenHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const { data: peer, error: peerError } = await supabase
      .from('a2a_peers')
      .select('*')
      .eq('inbound_token_hash', tokenHash)
      .eq('status', 'active')
      .single();

    if (peerError || !peer) {
      return new Response(JSON.stringify({ error: 'Invalid or inactive peer token' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body — support both native format and A2A v0.3.0 JSON-RPC
    const body = await req.json();
    let skill: string | undefined;
    let args: Record<string, unknown> | undefined;
    let isJsonRpc = false;
    let jsonRpcId: string | number | null = null;

    if (body.jsonrpc === '2.0' && body.method) {
      // A2A v0.3.0 JSON-RPC format: { jsonrpc, method, id, params: { message: { parts } } }
      isJsonRpc = true;
      jsonRpcId = body.id ?? null;

      if (body.method === 'message/send' || body.method === 'message/stream') {
        const message = body.params?.message;
        const textPart = message?.parts?.find((p: any) => p.type === 'text' || typeof p.text === 'string');
        const text = textPart?.text || '';

        // Extract skill from text: "skill:skill_name arg1=val1" or just treat as chat
        const skillMatch = text.match(/^skill:(\S+)\s*(.*)/s);
        if (skillMatch) {
          skill = skillMatch[1];
          // Try to parse remaining as JSON args, else pass as text
          try {
            args = JSON.parse(skillMatch[2]);
          } catch {
            args = { text: skillMatch[2].trim() };
          }
        } else {
          // Default: route to chat/operate skill
          skill = 'a2a_chat';
          args = { text, parts: message?.parts };
        }
      } else {
        // Unknown JSON-RPC method
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          id: jsonRpcId,
          error: { code: -32601, message: `Method not found: ${body.method}` },
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      // Native format: { skill, arguments }
      skill = body.skill;
      args = body.arguments;
    }

    if (!skill) {
      const errorPayload = isJsonRpc
        ? { jsonrpc: '2.0', id: jsonRpcId, error: { code: -32602, message: 'Could not determine skill from message' } }
        : { error: 'Missing "skill" field' };
      return new Response(JSON.stringify(errorPayload), {
        status: isJsonRpc ? 200 : 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Log activity as pending
    const { data: activityRow } = await supabase
      .from('a2a_activity')
      .insert({
        peer_id: peer.id,
        direction: 'inbound',
        skill_name: skill,
        input: args || {},
        status: 'pending',
      })
      .select('id')
      .single();

    // Auto-inject peer context into skill arguments so skills like
    // openclaw_start_session get peer_name without the caller needing to specify it
    const enrichedArgs: Record<string, unknown> = {
      ...(args || {}),
      // Inject peer identity and site context
      ...(!args?.peer_name ? { peer_name: peer.name } : {}),
      ...(!args?.peer_id ? { _a2a_peer_id: peer.id } : {}),
      _site_url: 'https://demo.flowwink.com',
    };

    // Execute skill via agent-execute
    let result: any;
    let status: 'success' | 'error' = 'success';
    let errorMessage: string | null = null;

    try {
      const execResponse = await fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          skill_name: skill,
          arguments: enrichedArgs,
          context: {
            source: 'a2a',
            peer_id: peer.id,
            peer_name: peer.name,
          },
        }),
      });

      result = await execResponse.json();

      if (!execResponse.ok) {
        status = 'error';
        errorMessage = result?.error || `Skill execution failed with status ${execResponse.status}`;
      }
    } catch (err: any) {
      status = 'error';
      errorMessage = err.message || 'Skill execution failed';
      result = { error: errorMessage };
    }

    const durationMs = Date.now() - startTime;

    // Update activity log
    if (activityRow?.id) {
      await supabase
        .from('a2a_activity')
        .update({
          output: result,
          status,
          duration_ms: durationMs,
          error_message: errorMessage,
        })
        .eq('id', activityRow.id);
    }

    // Update peer stats
    await supabase
      .from('a2a_peers')
      .update({
        last_seen_at: new Date().toISOString(),
        request_count: (peer.request_count || 0) + 1,
      })
      .eq('id', peer.id);

    return new Response(JSON.stringify(result), {
      status: status === 'success' ? 200 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('A2A ingest error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
