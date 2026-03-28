import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// Part serialization — matches OpenClaw gateway's serialization format
// so we understand TextPart, FilePart, and DataPart equally well.
// =============================================================================

function serializeParts(parts: any[]): string {
  if (!Array.isArray(parts)) return '';
  return parts.map(p => {
    // TextPart
    if (p.type === 'text' || p.kind === 'text') {
      return p.text || '';
    }
    // FilePart (URI or inline)
    if (p.type === 'file' || p.kind === 'file') {
      const file = p.file || p;
      if (file.uri) {
        return `[Attached: ${file.name || 'file'} (${file.mimeType || 'unknown'}) → ${file.uri}]`;
      }
      if (file.bytes || file.data) {
        const size = file.bytes?.length || file.data?.length || 0;
        return `[Attached: ${file.name || 'file'} (${file.mimeType || 'unknown'}), inline ${Math.round(size / 1024)}KB]`;
      }
      return '[Attached: file]';
    }
    // DataPart (structured JSON)
    if (p.type === 'data' || p.kind === 'data') {
      const data = p.data || p.value || p;
      const json = typeof data === 'string' ? data : JSON.stringify(data);
      // Truncate at 2KB like OpenClaw does
      const truncated = json.length > 2048 ? json.substring(0, 2048) + '...' : json;
      return `[Data (${p.mimeType || 'application/json'}): ${truncated}]`;
    }
    // Unknown part — serialize as text
    if (typeof p === 'string') return p;
    return JSON.stringify(p);
  }).filter(Boolean).join('\n');
}

// =============================================================================
// Extract skill from text — supports "skill:name args" prefix format
// =============================================================================

function extractSkillFromText(text: string): { skill: string | null; args: Record<string, unknown> } {
  const skillMatch = text.match(/^skill:(\S+)\s*(.*)/s);
  if (skillMatch) {
    const skillName = skillMatch[1];
    const rest = skillMatch[2].trim();
    try {
      return { skill: skillName, args: JSON.parse(rest) };
    } catch {
      return { skill: skillName, args: { text: rest } };
    }
  }
  return { skill: null, args: { text } };
}

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
    let responseSchema: Record<string, unknown> | undefined;

    if (body.jsonrpc === '2.0' && body.method) {
      // =========================================================
      // A2A v0.3.0 JSON-RPC format (OpenClaw gateway compatible)
      // =========================================================
      isJsonRpc = true;
      jsonRpcId = body.id ?? null;

      if (body.method === 'message/send' || body.method === 'message/stream') {
        const message = body.params?.message;
        const parts = message?.parts || [];

        // Serialize ALL part types (TextPart, FilePart, DataPart)
        const fullText = serializeParts(parts);

        // Check for DataPart with structured skill invocation
        const dataPart = parts.find((p: any) =>
          (p.type === 'data' || p.kind === 'data') && p.data?.skill
        );

        if (dataPart?.data?.skill) {
          // Structured skill call via DataPart
          skill = dataPart.data.skill;
          args = dataPart.data.arguments || dataPart.data.args || { text: fullText };
        } else {
          // Try to extract skill from text content
          const extracted = extractSkillFromText(fullText);
          if (extracted.skill) {
            skill = extracted.skill;
            args = extracted.args;
          } else {
            // Default: route to chat
            skill = 'a2a_chat';
            args = { text: fullText, parts };
          }
        }

        // OpenClaw extension: agentId routing (non-standard field)
        // If the peer targets a specific agentId, pass it through
        if (message?.agentId) {
          args = { ...(args || {}), _target_agent_id: message.agentId };
        }

        // Extract responseSchema if provided in params
        if (body.params?.responseSchema) {
          responseSchema = body.params.responseSchema;
        }
      } else if (body.method === 'tasks/get') {
        // Task status polling — OpenClaw uses this for async tasks
        const taskId = body.params?.id;
        if (taskId) {
          const { data: activity } = await supabase
            .from('a2a_activity')
            .select('*')
            .eq('id', taskId)
            .single();

          if (activity) {
            const state = activity.status === 'success' ? 'completed'
              : activity.status === 'error' ? 'failed'
              : 'working';

            return new Response(JSON.stringify({
              jsonrpc: '2.0',
              id: jsonRpcId,
              result: {
                id: taskId,
                status: {
                  state,
                  ...(state === 'failed' ? { message: { parts: [{ type: 'text', text: activity.error_message || 'Unknown error' }] } } : {}),
                },
                ...(state === 'completed' ? {
                  artifacts: [{
                    parts: [{ type: 'text', text: typeof activity.output === 'string' ? activity.output : JSON.stringify(activity.output) }],
                  }],
                } : {}),
              },
            }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          id: jsonRpcId,
          error: { code: -32602, message: 'Task not found' },
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
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
      if (body.responseSchema || body.response_schema) {
        responseSchema = body.responseSchema || body.response_schema;
      }
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

    // Auto-inject peer context into skill arguments
    const enrichedArgs: Record<string, unknown> = {
      ...(args || {}),
      ...(!args?.peer_name ? { peer_name: peer.name } : {}),
      ...(!args?.peer_id ? { _a2a_peer_id: peer.id } : {}),
      _site_url: 'https://demo.flowwink.com',
      ...(responseSchema ? { responseSchema } : {}),
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

    // Format response based on protocol
    if (isJsonRpc) {
      const resultText = typeof result === 'string' ? result : JSON.stringify(result);

      // Build artifacts with proper A2A Part types
      const artifactParts: any[] = [{ type: 'text', text: resultText }];

      // If result contains URLs, add FileParts (matching OpenClaw's expectation)
      if (typeof result === 'object' && result !== null) {
        const urlFields = ['url', 'screenshot_url', 'report_url', 'file_url'];
        for (const field of urlFields) {
          if (result[field]) {
            artifactParts.push({
              type: 'file',
              file: { uri: result[field], mimeType: 'application/octet-stream' },
            });
          }
        }
      }

      const jsonRpcResponse = status === 'success'
        ? {
            jsonrpc: '2.0',
            id: jsonRpcId,
            result: {
              id: activityRow?.id || crypto.randomUUID(),
              status: { state: 'completed' },
              artifacts: [{ parts: artifactParts }],
            },
          }
        : {
            jsonrpc: '2.0',
            id: jsonRpcId,
            result: {
              id: activityRow?.id || crypto.randomUUID(),
              status: {
                state: 'failed',
                message: { parts: [{ type: 'text', text: errorMessage || 'Unknown error' }] },
              },
            },
          };
      return new Response(JSON.stringify(jsonRpcResponse), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
