import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * openclaw-responses — Call OpenClaw's POST /v1/responses endpoint.
 *
 * Uses the same peer credentials (url + outbound_token) from a2a_peers,
 * but routes through OpenClaw's OpenResponses API instead of A2A JSON-RPC.
 *
 * This is the "boss → worker" channel:
 * - FlowPilot defines the task and expected response format
 * - OpenClaw's full agent (workspace, tools, identity) processes it
 * - No intermediate serialization — the prompt goes directly to the LLM
 *
 * Shared infrastructure with A2A:
 * - Same peer record in a2a_peers (url, outbound_token)
 * - Same activity logging in a2a_activity
 * - Same auth model (gateway token = outbound_token)
 *
 * Key difference from A2A:
 * - Endpoint: /v1/responses (not /a2a/ingest)
 * - Auth header: x-openclaw-token (not Bearer)
 * - Format: OpenAI Responses API (not JSON-RPC)
 * - Synchronous request/response (not async task lifecycle)
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ResponsesRequest {
  peer_name?: string;
  peer_id?: string;
  /** The instruction/prompt for OpenClaw */
  prompt: string;
  /** Optional system instructions to prepend */
  system?: string;
  /** Optional response format hint — OpenClaw may or may not honor it */
  response_format?: 'text' | 'json';
  /** Model override (default: let OpenClaw use its configured model) */
  model?: string;
  /** Timeout in ms (default: 60000) */
  timeout_ms?: number;
  /** Fire-and-forget: send POST but don't wait for response (avoids 60s edge fn timeout) */
  fire_and_forget?: boolean;
  /** Inject MCP credentials into the prompt so the peer can call back */
  inject_mcp_credentials?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Auth: service role or admin user
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
    let isAuthorized = token === serviceKey.trim();

    if (!isAuthorized && token?.startsWith('eyJ')) {
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          if (payload.role === 'service_role') isAuthorized = true;
        }
      } catch { /* not valid JWT */ }
    }

    if (!isAuthorized && token) {
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
      const authClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user } } = await authClient.auth.getUser();
      if (user) {
        const { data: roles } = await createClient(supabaseUrl, serviceKey)
          .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin');
        isAuthorized = !!(roles && roles.length > 0);
      }
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const body: ResponsesRequest = await req.json();
    const { peer_name, peer_id, prompt, system, response_format, model, timeout_ms = 60000, fire_and_forget = false, inject_mcp_credentials = false } = body;

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'prompt is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Look up peer from same a2a_peers table
    let peerQuery = supabase.from('a2a_peers').select('*').eq('status', 'active');
    if (peer_id) peerQuery = peerQuery.eq('id', peer_id);
    else if (peer_name) peerQuery = peerQuery.ilike('name', peer_name);
    else {
      return new Response(JSON.stringify({ error: 'peer_name or peer_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: peer, error: peerError } = await peerQuery.single();
    if (peerError || !peer) {
      return new Response(JSON.stringify({ error: 'Peer not found or not active' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // OpenResponses uses gateway_token (port 18789), NOT outbound_token (A2A port 18800)
    const gatewayToken = peer.gateway_token || peer.outbound_token;
    if (!peer.url || !gatewayToken) {
      return new Response(JSON.stringify({ error: `Peer '${peer.name}' missing URL or gateway token` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Inject MCP credentials into the prompt if requested and available
    let effectivePrompt = prompt;
    if (inject_mcp_credentials && peer.mcp_api_key) {
      const mcpBlock = `\n\n## MCP CALLBACK CREDENTIALS\nUse these to report results back to FlowWink:\n- Endpoint: ${supabaseUrl}/functions/v1/mcp-server/rest\n- Authorization: Bearer ${peer.mcp_api_key}\n- Resources: GET /resources/health, GET /resources/skills, GET /resources/templates, GET /resources/templates/{id}\n- Execute: POST /execute with body {"tool":"<tool_name>","arguments":{...}}\n- Report findings: tool "openclaw_report_finding" with type (bug|suggestion|positive|ux_issue|performance|missing_feature), severity, title, description, context`;
      effectivePrompt = prompt + mcpBlock;
    }

    // Log activity as pending
    const { data: activityRow } = await supabase
      .from('a2a_activity')
      .insert({
        peer_id: peer.id,
        direction: 'outbound',
        skill_name: fire_and_forget ? 'mission_dispatch' : 'responses_api',
        input: { prompt: effectivePrompt, system, response_format, model, fire_and_forget },
        status: fire_and_forget ? 'dispatched' : 'pending',
      })
      .select('id')
      .single();

    // Build OpenResponses request body
    const peerUrl = peer.url.replace(/\/$/, '');
    const responsesUrl = `${peerUrl}/v1/responses`;

    const openResponsesBody: Record<string, unknown> = {
      model: model || 'openclaw',
      input: effectivePrompt,
    };

    if (system) {
      openResponsesBody.instructions = system;
    }

    if (response_format === 'json') {
      const jsonSuffix = '\n\nIMPORTANT: Respond with valid JSON only, no markdown or extra text.';
      openResponsesBody.input = prompt + jsonSuffix;
    }

    console.log(`[openclaw-responses] Calling peer '${peer.name}' at ${responsesUrl}`);

    // Make the call
    let result: unknown;
    let status: 'success' | 'error' = 'success';
    let errorMessage: string | null = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeout_ms);

      const response = await fetch(responsesUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // OpenResponses uses gateway_token (separate from A2A outbound_token)
          'Authorization': `Bearer ${gatewayToken}`,
        },
        body: JSON.stringify(openResponsesBody),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      console.log(`[openclaw-responses] Response: status=${response.status}`);

      try {
        result = await response.json();
      } catch {
        const text = await response.text().catch(() => '');
        result = { raw: text };
      }

      if (!response.ok) {
        status = 'error';
        const r = result as any;
        errorMessage = r?.error?.message || r?.error || `HTTP ${response.status}`;
      } else {
        // Extract the actual response text from OpenResponses format
        const r = result as any;
        if (r?.output) {
          // OpenResponses wraps output in an array of response items
          const textParts = Array.isArray(r.output)
            ? r.output
                .filter((item: any) => item.type === 'message' && item.role === 'assistant')
                .flatMap((item: any) => item.content || [])
                .filter((c: any) => c.type === 'output_text')
                .map((c: any) => c.text)
            : [];
          if (textParts.length > 0) {
            result = {
              status: 'completed',
              response: textParts.join('\n'),
              raw: r,
            };
          }
        }
      }
    } catch (err: any) {
      console.error(`[openclaw-responses] Fetch error:`, err.message);
      status = 'error';
      errorMessage = err.name === 'AbortError'
        ? `Timeout after ${timeout_ms}ms`
        : `Network error: ${err.message}`;
      result = { status: 'error', message: errorMessage };
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

    // Update peer last_seen if successful
    if (status === 'success') {
      await supabase.from('a2a_peers').update({
        last_seen_at: new Date().toISOString(),
        request_count: (peer.request_count || 0) + 1,
      }).eq('id', peer.id);
    }

    return new Response(JSON.stringify(result), {
      status: status === 'success' ? 200 : 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[openclaw-responses] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
