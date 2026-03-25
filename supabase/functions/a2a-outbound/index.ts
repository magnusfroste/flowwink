import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * a2a-outbound — Send skill requests to external A2A peers.
 *
 * Supports three protocols (auto-detected from peer capabilities):
 *   1. JSON-RPC 2.0 (A2A v0.3.0) — preferred
 *   2. Native FlowWink format
 *   3. Legacy a2a-negotiate
 *
 * Called internally by agent-execute for a2a: handlers,
 * or directly for manual/admin-triggered outbound calls.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OutboundRequest {
  peer_name?: string;
  peer_id?: string;
  skill: string;
  arguments?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Auth: service role key OR authenticated admin user
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    let isAuthorized = token === serviceKey;

    // Also allow admin users via JWT
    if (!isAuthorized && token) {
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
      const authClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user } } = await authClient.auth.getUser();
      if (user) {
        const { data: roles } = await createClient(supabaseUrl, serviceKey)
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin');
        isAuthorized = !!(roles && roles.length > 0);
      }
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized — admin or service role only' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const body: OutboundRequest = await req.json();
    const { peer_name, peer_id, skill, arguments: args = {} } = body;

    if (!skill) {
      return new Response(JSON.stringify({ error: 'Missing "skill" field' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Look up peer
    let peerQuery = supabase.from('a2a_peers').select('*').eq('status', 'active');
    if (peer_id) {
      peerQuery = peerQuery.eq('id', peer_id);
    } else if (peer_name) {
      peerQuery = peerQuery.ilike('name', peer_name);
    } else {
      return new Response(JSON.stringify({ error: 'peer_name or peer_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: peer, error: peerError } = await peerQuery.single();
    if (peerError || !peer) {
      return new Response(JSON.stringify({ error: `Peer not found or not active` }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!peer.url) {
      return new Response(JSON.stringify({ error: `Peer '${peer.name}' has no URL configured — cannot make outbound calls` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Log outbound activity as pending
    const { data: activityRow } = await supabase
      .from('a2a_activity')
      .insert({
        peer_id: peer.id,
        direction: 'outbound',
        skill_name: skill,
        input: args,
        status: 'pending',
      })
      .select('id')
      .single();

    // Determine protocol from peer capabilities
    const caps = (peer.capabilities as Record<string, unknown>) || {};
    const protocol = (caps.protocol as string) || 'jsonrpc';
    const peerUrl = peer.url.replace(/\/$/, '');

    let endpoint: string;
    let requestBody: Record<string, unknown>;

    if (protocol === 'jsonrpc' || protocol === 'a2a') {
      // A2A v0.3.0 JSON-RPC — preferred
      endpoint = (caps.endpoint as string) || '/a2a/ingest';
      const messageId = activityRow?.id || crypto.randomUUID();
      requestBody = {
        jsonrpc: '2.0',
        id: messageId,
        method: 'message/send',
        params: {
          message: {
            messageId,
            role: 'user',
            parts: [
              { type: 'text', text: `skill:${skill} ${JSON.stringify(args)}` },
            ],
          },
        },
      };
    } else if (protocol === 'native') {
      // FlowWink native format
      endpoint = (caps.endpoint as string) || '/functions/v1/a2a-ingest';
      requestBody = { skill, arguments: args };
    } else {
      // Legacy a2a-negotiate
      endpoint = (caps.endpoint as string) || '/functions/v1/a2a-negotiate';
      requestBody = { type: 'task', skill_id: skill, input: args };
    }

    // Make the outbound call
    let result: unknown;
    let status: 'success' | 'error' = 'success';
    let errorMessage: string | null = null;

    try {
      const response = await fetch(`${peerUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${peer.outbound_token}`,
        },
        body: JSON.stringify(requestBody),
      });

      result = await response.json();

      if (!response.ok) {
        status = 'error';
        // Extract error from JSON-RPC or plain format
        const r = result as any;
        errorMessage = r?.error?.message || r?.error || `HTTP ${response.status}`;
      } else if (protocol === 'jsonrpc' || protocol === 'a2a') {
        // JSON-RPC: check for error in result
        const r = result as any;
        if (r?.error) {
          status = 'error';
          errorMessage = r.error.message || JSON.stringify(r.error);
        } else if (r?.result?.status?.state === 'failed') {
          status = 'error';
          const failParts = r.result.status.message?.parts || [];
          errorMessage = failParts.map((p: any) => p.text).join(' ') || 'Task failed';
        }
      }
    } catch (err: any) {
      status = 'error';
      errorMessage = err.message || 'Network error';
      result = { error: errorMessage };
    }

    const durationMs = Date.now() - startTime;

    // Update activity log
    if (activityRow?.id) {
      await supabase.from('a2a_activity').update({
        output: result,
        status,
        duration_ms: durationMs,
        error_message: errorMessage,
      }).eq('id', activityRow.id);
    }

    // Update peer stats
    await supabase.from('a2a_peers').update({
      last_seen_at: new Date().toISOString(),
      request_count: (peer.request_count || 0) + 1,
    }).eq('id', peer.id);

    return new Response(JSON.stringify(result), {
      status: status === 'success' ? 200 : 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('a2a-outbound error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
