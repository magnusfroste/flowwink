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
  message?: string; // Raw text message (bypasses skill: prefix)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Auth: service role key, anon key (internal calls), or authenticated admin user
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '').trim();
    const apikeyHeader = req.headers.get('apikey')?.trim();
    const anonKey = (Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '').trim();
    // Service role key or apikey header match
    let isAuthorized = token === serviceKey || apikeyHeader === serviceKey;

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
    const { peer_name, peer_id, skill, arguments: args = {}, message: rawMessage } = body;

    // Allow raw message-only calls (no skill required for natural language delegation)
    const effectiveSkill = skill || 'message';

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
        skill_name: effectiveSkill,
        input: rawMessage ? { message: rawMessage, ...args } : args,
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
              { type: 'text', text: rawMessage || `skill:${effectiveSkill} ${JSON.stringify(args)}` },
            ],
          },
        },
      };
    } else if (protocol === 'native') {
      // FlowWink native format
      endpoint = (caps.endpoint as string) || '/functions/v1/a2a-ingest';
      requestBody = { skill: effectiveSkill, arguments: args, ...(rawMessage ? { message: rawMessage } : {}) };
    } else {
      // Legacy a2a-negotiate
      endpoint = (caps.endpoint as string) || '/functions/v1/a2a-negotiate';
      requestBody = { type: 'task', skill_id: effectiveSkill, input: args };
    }

    // Make the outbound call
    let result: unknown;
    let status: 'success' | 'error' | 'peer_unavailable' = 'success';
    let errorMessage: string | null = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000); // 15s timeout

      const response = await fetch(`${peerUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${peer.outbound_token}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      result = await response.json().catch(() => ({ raw: await response.text().catch(() => '') }));

      if (!response.ok) {
        status = 'error';
        const r = result as any;
        errorMessage = r?.error?.message || r?.error || `HTTP ${response.status}`;
      } else if (protocol === 'jsonrpc' || protocol === 'a2a') {
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
      // Network errors (DNS, timeout, connection refused) = peer is simply unavailable
      const isNetworkError = err.name === 'AbortError' ||
        err.message?.includes('error trying to connect') ||
        err.message?.includes('dns error') ||
        err.message?.includes('Connection refused') ||
        err.message?.includes('NetworkError');

      status = isNetworkError ? 'peer_unavailable' : 'error';
      errorMessage = isNetworkError
        ? `Peer '${peer.name}' is currently offline or unreachable. This is normal — peers may restart.`
        : (err.message || 'Unknown network error');
      result = { status, message: errorMessage };
    }

    const durationMs = Date.now() - startTime;

    // Update activity log — peer_unavailable is logged as status, not as a system error
    const activityStatus = status === 'peer_unavailable' ? 'peer_unavailable' : status;
    if (activityRow?.id) {
      await supabase.from('a2a_activity').update({
        output: result,
        status: activityStatus === 'peer_unavailable' ? 'error' : activityStatus,
        duration_ms: durationMs,
        error_message: errorMessage,
      }).eq('id', activityRow.id);
    }

    // Only update last_seen_at if peer actually responded
    if (status === 'success') {
      await supabase.from('a2a_peers').update({
        last_seen_at: new Date().toISOString(),
        request_count: (peer.request_count || 0) + 1,
      }).eq('id', peer.id);
    }

    const httpStatus = status === 'success' ? 200 : status === 'peer_unavailable' ? 503 : 502;
    return new Response(JSON.stringify(result), {
      status: httpStatus,
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
