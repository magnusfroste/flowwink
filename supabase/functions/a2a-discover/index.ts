import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * a2a-discover — Fetch Agent Card from a peer and store discovered skills.
 * Also supports running audit/test skills and converting results to objectives.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface DiscoverRequest {
  peer_id?: string;
  peer_url?: string; // For pre-creation discovery (no peer_id yet)
  action: 'discover' | 'audit' | 'test' | 'probe';
  site_url?: string;
  test_scenario?: string;
}

/** Try multiple well-known paths to find an agent card */
async function fetchAgentCard(baseUrl: string): Promise<{ card: any; path: string } | null> {
  const paths = [
    '/.well-known/agent-card.json',
    '/.well-known/agent.json',
    '/agent-card',
    '/agent-card.json',
    '/a2a/agent-card',
    '/functions/v1/agent-card',
  ];

  for (const path of paths) {
    const url = `${baseUrl}${path}`;
    try {
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        // Validate it looks like an agent card
        if (data && (data.name || data.skills || data.protocolVersion)) {
          console.log(`[a2a-discover] Found agent card at ${url}`);
          return { card: data, path };
        }
      }
    } catch {
      // Try next path
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Auth check — admin only
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify admin role
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin');
    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: DiscoverRequest = await req.json();
    const { peer_id, peer_url, action = 'discover' } = body;

    // === ACTION: PROBE — pre-creation discovery by URL only ===
    if (action === 'probe') {
      if (!peer_url) {
        return new Response(JSON.stringify({ error: 'peer_url required for probe' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Strip known agent card paths in case user pasted the full URL
      const knownPaths = [
        '/.well-known/agent-card.json', '/.well-known/agent.json',
        '/agent-card.json', '/agent-card',
        '/a2a/agent-card', '/functions/v1/agent-card',
      ];
      let baseUrl = peer_url.replace(/\/$/, '');
      for (const p of knownPaths) {
        if (baseUrl.endsWith(p)) {
          baseUrl = baseUrl.slice(0, -p.length);
          break;
        }
      }
      const result = await fetchAgentCard(baseUrl);

      if (!result) {
        return new Response(JSON.stringify({
          success: false,
          error: 'No agent card found at any standard path',
          tried_paths: ['/.well-known/agent-card.json', '/.well-known/agent.json', '/agent-card', '/a2a/agent-card', '/functions/v1/agent-card'],
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        found_at: result.path,
        agent_card: {
          name: result.card.name,
          description: result.card.description,
          skills: (result.card.skills || []).map((s: any) => ({
            id: s.id,
            name: s.name || s.id,
            description: s.description || '',
          })),
          protocol_version: result.card.protocolVersion || 'unknown',
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!peer_id) {
      return new Response(JSON.stringify({ error: 'peer_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch peer
    const { data: peer, error: peerError } = await supabase
      .from('a2a_peers')
      .select('*')
      .eq('id', peer_id)
      .single();

    if (peerError || !peer) {
      return new Response(JSON.stringify({ error: 'Peer not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!peer.url) {
      return new Response(JSON.stringify({ error: 'Peer has no URL configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const peerUrl = peer.url.replace(/\/$/, '');

    // === ACTION: DISCOVER — with fallback path discovery ===
    if (action === 'discover') {
      const result = await fetchAgentCard(peerUrl);

      if (!result) {
        return new Response(JSON.stringify({
          error: `No agent card found at ${peerUrl} — tried /.well-known/agent-card.json and 5 other standard paths`,
        }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const agentCard = result.card;

      // Merge discovered info into capabilities
      const existingCaps = (peer.capabilities && typeof peer.capabilities === 'object' && !Array.isArray(peer.capabilities))
        ? peer.capabilities as Record<string, unknown>
        : {};

      const updatedCaps = {
        ...existingCaps,
        protocol: existingCaps.protocol || 'jsonrpc',
        endpoint: existingCaps.endpoint || '/a2a/jsonrpc',
        agent_name: agentCard.name || peer.name,
        agent_description: agentCard.description || '',
        agent_card_path: result.path,
        skills: (agentCard.skills || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          description: s.description || '',
        })),
        discovered_at: new Date().toISOString(),
        protocol_version: agentCard.protocolVersion || 'unknown',
        capabilities_raw: agentCard.capabilities || {},
      };

      await supabase
        .from('a2a_peers')
        .update({ capabilities: updatedCaps })
        .eq('id', peer_id);
      return new Response(JSON.stringify({
        success: true,
        agent_card: {
          name: agentCard.name,
          description: agentCard.description,
          skills: updatedCaps.skills,
          protocol_version: agentCard.protocolVersion,
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === ACTION: AUDIT or TEST ===
    if (action === 'audit' || action === 'test') {
      const skillName = action === 'audit' ? 'openclaw_audit' : 'openclaw_test';
      const siteUrl = body.site_url || peerUrl;

      const messageId = crypto.randomUUID();
      const skillArgs = action === 'audit'
        ? { url: siteUrl, type: 'full' }
        : { url: siteUrl, scenario: body.test_scenario || 'general' };

      const rpcPayload = {
        jsonrpc: '2.0',
        id: messageId,
        method: 'message/send',
        params: {
          message: {
            messageId,
            role: 'user',
            parts: [
              { kind: 'text', text: `skill:${skillName} ${JSON.stringify(skillArgs)}` },
            ],
          },
        },
      };

      const caps = (peer.capabilities as Record<string, unknown>) || {};
      const endpoint = (caps.endpoint as string) || '/a2a/jsonrpc';

      // Log activity
      const { data: activityRow } = await supabase
        .from('a2a_activity')
        .insert({
          peer_id: peer.id,
          direction: 'outbound',
          skill_name: skillName,
          input: skillArgs,
          status: 'pending',
        })
        .select('id')
        .single();

      const startTime = Date.now();

      try {
        const response = await fetch(`${peerUrl}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${peer.outbound_token}`,
          },
          body: JSON.stringify(rpcPayload),
          signal: AbortSignal.timeout(120000), // 2 min timeout for audit
        });

        const result = await response.json();
        const durationMs = Date.now() - startTime;

        // Determine success/failure
        let status: 'success' | 'error' = 'success';
        let errorMessage: string | null = null;
        const r = result as any;

        if (!response.ok) {
          status = 'error';
          errorMessage = r?.error?.message || `HTTP ${response.status}`;
        } else if (r?.error) {
          status = 'error';
          errorMessage = r.error.message || JSON.stringify(r.error);
        } else if (r?.result?.status?.state === 'failed') {
          status = 'error';
          const failParts = r.result?.status?.message?.parts || [];
          errorMessage = failParts.map((p: any) => p.text || p.kind).join(' ') || 'Task failed';
        }

        // Update activity
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

        // If audit succeeded, extract findings and create objectives
        if (status === 'success' && action === 'audit') {
          await createObjectivesFromResult(supabase, result, peer.name);
        }

        return new Response(JSON.stringify({
          success: status === 'success',
          result,
          duration_ms: durationMs,
          error: errorMessage,
        }), {
          status: status === 'success' ? 200 : 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        const durationMs = Date.now() - startTime;
        if (activityRow?.id) {
          await supabase.from('a2a_activity').update({
            output: { error: err.message },
            status: 'error',
            duration_ms: durationMs,
            error_message: err.message,
          }).eq('id', activityRow.id);
        }

        return new Response(JSON.stringify({
          success: false,
          error: err.message || 'Network error',
        }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[a2a-discover] Error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/**
 * Extract findings from an A2A audit result and create agent_objectives.
 */
async function createObjectivesFromResult(
  supabase: ReturnType<typeof createClient>,
  result: any,
  peerName: string,
) {
  try {
    // Extract text from the A2A response
    const taskResult = result?.result;
    if (!taskResult) return;

    // Get text from artifacts or status message
    let auditText = '';
    
    if (taskResult.artifacts?.length) {
      for (const artifact of taskResult.artifacts) {
        for (const part of artifact.parts || []) {
          if (part.kind === 'text' || part.type === 'text') {
            auditText += (part.text || '') + '\n';
          }
        }
      }
    }

    if (!auditText && taskResult.status?.message?.parts) {
      for (const part of taskResult.status.message.parts) {
        if (part.kind === 'text' || part.type === 'text') {
          auditText += (part.text || '') + '\n';
        }
      }
    }

    if (!auditText.trim()) return;

    // Create a single objective with the audit findings
    await supabase.from('agent_objectives').insert({
      goal: `Review audit findings from ${peerName}: ${auditText.slice(0, 200).trim()}`,
      status: 'active',
      constraints: {},
      success_criteria: { source: `a2a:${peerName}`, type: 'audit' },
      progress: {
        raw_findings: auditText.trim(),
        created_from: 'a2a-discover',
        peer_name: peerName,
      },
    });

    console.log(`[a2a-discover] Created objective from ${peerName} audit`);
  } catch (err) {
    console.error('[a2a-discover] Failed to create objectives:', err);
  }
}
