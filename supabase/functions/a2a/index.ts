import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * a2a — Unified router for all A2A federation traffic.
 *
 * Routes by URL path segment:
 *   POST /functions/v1/a2a/chat      → conversational bridge (FlowPilot ↔ peer)
 *   POST /functions/v1/a2a/discover  → fetch peer agent-card / run audit/test/probe
 *   POST /functions/v1/a2a/ingest    → inbound peer webhook (peer-token auth)
 *   POST /functions/v1/a2a/outbound  → outbound dispatch to peer (admin/service auth)
 *
 * Consolidates a2a-chat, a2a-discover, a2a-ingest, a2a-outbound into a single
 * Edge Function deployment. The legacy URLs are no longer served — agent-card
 * publishes the new /a2a/ingest URL.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Path routing — strip the function prefix
  const url = new URL(req.url);
  // Path can be /functions/v1/a2a/<action> or just /a2a/<action> depending on runtime
  const segments = url.pathname.split('/').filter(Boolean);
  // Take the last segment after "a2a"
  const a2aIdx = segments.lastIndexOf('a2a');
  const action = a2aIdx >= 0 && segments.length > a2aIdx + 1 ? segments[a2aIdx + 1] : '';

  try {
    switch (action) {
      case 'chat':     return await handleChat(req);
      case 'discover': return await handleDiscover(req);
      case 'ingest':   return await handleIngest(req);
      case 'outbound': return await handleOutbound(req);
      default:
        return json({
          error: 'Unknown a2a action',
          hint: 'POST to /functions/v1/a2a/{chat|discover|ingest|outbound}',
        }, 404);
    }
  } catch (err: any) {
    console.error(`[a2a/${action}] Error:`, err);
    return json({ error: err.message || 'Internal error' }, 500);
  }
});

// =============================================================================
// CHAT — conversational bridge (was a2a-chat)
// =============================================================================

const MAX_HISTORY = 20;
const MEMORY_KEY_PREFIX = 'a2a_conv_';

interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

async function handleChat(req: Request): Promise<Response> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const body = await req.json();
  const text = body.text || '';
  const peerName = body.peer_name || body.context?.peer_name || 'unknown';
  const peerId = body._a2a_peer_id || body.context?.peer_id || null;
  const responseSchema = body.responseSchema || body.response_schema || null;
  const isOutbound = body.outbound === true;
  const isPassthrough = body.passthrough === true;

  if (!text.trim()) return json({ result: 'No message provided' });

  // PASSTHROUGH: skip AI, deliver text directly
  if (isOutbound && isPassthrough) {
    const memoryKey = `${MEMORY_KEY_PREFIX}${peerId || peerName}`;
    const { data: memoryRow } = await supabase
      .from('agent_memory').select('value').eq('key', memoryKey).maybeSingle();
    const history: ConversationEntry[] = Array.isArray(memoryRow?.value) ? memoryRow.value as ConversationEntry[] : [];
    const updatedHistory = [...history, { role: 'assistant' as const, content: text, timestamp: new Date().toISOString() }].slice(-MAX_HISTORY);
    await supabase.from('agent_memory').upsert({ key: memoryKey, value: updatedHistory, category: 'conversation', created_by: 'flowpilot', updated_at: new Date().toISOString() }, { onConflict: 'key' });

    const outboundPayload: Record<string, unknown> = { message: text };
    if (peerId) outboundPayload.peer_id = peerId;
    else outboundPayload.peer_name = peerName;

    let outboundResult: unknown = null;
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/a2a/outbound`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
        body: JSON.stringify(outboundPayload),
      });
      outboundResult = await resp.json().catch(() => ({ status: resp.status }));
      console.log(`[a2a/chat] PASSTHROUGH to ${peerName}: status=${resp.status}`);
    } catch (err: any) {
      console.error(`[a2a/chat] PASSTHROUGH delivery failed for ${peerName}:`, err.message);
      outboundResult = { error: err.message };
    }
    return json({ result: text, outbound_delivered: true, passthrough: true, outbound_result: outboundResult });
  }

  // Load history
  const memoryKey = `${MEMORY_KEY_PREFIX}${peerId || peerName}`;
  const { data: memoryRow } = await supabase
    .from('agent_memory').select('value').eq('key', memoryKey).maybeSingle();
  const history: ConversationEntry[] = Array.isArray(memoryRow?.value)
    ? (memoryRow.value as ConversationEntry[]) : [];

  // Identity
  const [soulResult, identityResult] = await Promise.all([
    supabase.from('agent_memory').select('value').eq('key', 'soul').maybeSingle(),
    supabase.from('agent_memory').select('value').eq('key', 'identity').maybeSingle(),
  ]);
  const soulText = typeof soulResult.data?.value === 'string'
    ? soulResult.data.value : JSON.stringify(soulResult.data?.value || '');
  const idObj = identityResult.data?.value as any;
  const agentName = idObj?.name || 'FlowPilot';

  const siteIntel = await gatherSiteIntelligence(supabase);

  const schemaInstruction = responseSchema
    ? `\n\nIMPORTANT: The peer has requested a specific response format. You MUST respond with valid JSON matching this schema:\n${JSON.stringify(responseSchema, null, 2)}\nDo NOT wrap it in markdown code blocks. Return raw JSON only.`
    : '';
  const conversationDirection = isOutbound
    ? `You are INITIATING a message to peer "${peerName}". The "user" message below is your internal prompt/intent — compose a natural, direct message to send to the peer.`
    : `You are RESPONDING to a message from federation peer "${peerName}" via the A2A protocol.`;

  const systemPrompt = `You are ${agentName}, an autonomous CMS operator for FlowWink (demo.flowwink.com). ${conversationDirection}

${soulText ? `Your soul/personality:\n${soulText}\n` : ''}

## Current Site Status
${siteIntel}

## Conversation Guidelines
- You have an ongoing relationship with this peer. Reference previous exchanges when relevant.
- Be direct, actionable, and share concrete data when asked.
- If asked to perform tasks, confirm what you'll do and follow through.
- If the peer is an Architect (like OpenClaw/Frostie), treat their findings seriously — they help improve our platform.
- Share metrics, health status, and recent activity proactively when it adds value.${schemaInstruction}`;

  const messages: Array<{ role: string; content: string }> = [{ role: 'system', content: systemPrompt }];
  for (const entry of history.slice(-MAX_HISTORY)) {
    messages.push({ role: entry.role, content: entry.content });
  }
  messages.push({ role: 'user', content: text });

  const chatResponse = await fetch(`${supabaseUrl}/functions/v1/chat-completion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
    body: JSON.stringify({ messages, mode: 'agent', stream: false }),
  });

  if (!chatResponse.ok) {
    const errText = await chatResponse.text();
    console.error('[a2a/chat] chat-completion error:', chatResponse.status, errText);
    return json({ result: `I received your message but had trouble processing it. Please try again.`, error: 'chat_completion_failed' });
  }

  const rawText = await chatResponse.text();
  let reply = '';
  for (const line of rawText.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6).trim();
    if (data === '[DONE]') break;
    try {
      const parsed = JSON.parse(data);
      const delta = parsed.choices?.[0]?.delta?.content;
      if (delta) reply += delta;
    } catch { /* skip */ }
  }
  if (!reply) reply = 'Message received, but I could not generate a response.';

  const updatedHistory: ConversationEntry[] = [
    ...history,
    { role: 'user', content: text, timestamp: new Date().toISOString() },
    { role: 'assistant', content: reply, timestamp: new Date().toISOString() },
  ].slice(-MAX_HISTORY);

  await supabase.from('agent_memory').upsert({
    key: memoryKey, value: updatedHistory, category: 'conversation',
    created_by: 'flowpilot', updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });

  console.log(`[a2a/chat] ${isOutbound ? 'OUTBOUND' : 'INBOUND'} conversation with ${peerName}: ${history.length} prior exchanges, replied: ${reply.substring(0, 80)}...`);

  let outboundResult: unknown = null;
  if (isOutbound) {
    try {
      const outboundPayload: Record<string, unknown> = { message: reply };
      if (peerId) outboundPayload.peer_id = peerId;
      else outboundPayload.peer_name = peerName;

      const outboundResponse = await fetch(`${supabaseUrl}/functions/v1/a2a/outbound`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
        body: JSON.stringify(outboundPayload),
      });
      outboundResult = await outboundResponse.json().catch(() => ({ status: outboundResponse.status }));
      console.log(`[a2a/chat] Outbound delivery to ${peerName}: status=${outboundResponse.status}`);
    } catch (err: any) {
      console.error(`[a2a/chat] Outbound delivery failed for ${peerName}:`, err.message);
      outboundResult = { error: err.message };
    }
  }

  let result: unknown = reply;
  if (responseSchema) {
    try { result = JSON.parse(reply); }
    catch { result = { _raw: reply, _schema_compliance: false }; }
  }

  return json({ result, ...(isOutbound ? { outbound_delivered: true, outbound_result: outboundResult } : {}) });
}

async function gatherSiteIntelligence(supabase: any): Promise<string> {
  try {
    const [pagesResult, postsResult, leadsResult, bookingsResult, objectivesResult, activityResult, peersResult] = await Promise.all([
      supabase.from('pages').select('id', { count: 'exact', head: true }),
      supabase.from('blog_posts').select('id', { count: 'exact', head: true }),
      supabase.from('leads').select('id', { count: 'exact', head: true }),
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'confirmed'),
      supabase.from('agent_objectives').select('id, goal, status').eq('status', 'active').limit(5),
      supabase.from('agent_activity').select('skill_name, status, created_at').order('created_at', { ascending: false }).limit(5),
      supabase.from('a2a_peers').select('name, status, last_seen_at').eq('status', 'active'),
    ]);

    const activeObjectives = (objectivesResult.data || []).map((o: any) => `  - ${o.goal}`).join('\n');
    const recentActivity = (activityResult.data || []).map((a: any) => `  - ${a.skill_name}: ${a.status} (${a.created_at})`).join('\n');
    const activePeers = (peersResult.data || []).map((p: any) => `  - ${p.name} (last seen: ${p.last_seen_at || 'never'})`).join('\n');

    return `Pages: ${pagesResult.count || 0} | Blog posts: ${postsResult.count || 0} | Leads: ${leadsResult.count || 0} | Active bookings: ${bookingsResult.count || 0}

Active objectives:
${activeObjectives || '  (none)'}

Recent agent activity:
${recentActivity || '  (none)'}

Connected peers:
${activePeers || '  (none)'}`;
  } catch (err) {
    console.warn('[a2a/chat] Failed to gather site intelligence:', err);
    return '(Site intelligence unavailable)';
  }
}

// =============================================================================
// DISCOVER — was a2a-discover
// =============================================================================

interface DiscoverRequest {
  peer_id?: string;
  peer_url?: string;
  action: 'discover' | 'audit' | 'test' | 'probe';
  site_url?: string;
  test_scenario?: string;
}

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
      const res = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        if (data && (data.name || data.skills || data.protocolVersion)) {
          console.log(`[a2a/discover] Found agent card at ${url}`);
          return { card: data, path };
        }
      }
    } catch { /* try next */ }
  }
  return null;
}

async function handleDiscover(req: Request): Promise<Response> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: roles } = await supabase
    .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin');
  if (!roles || roles.length === 0) return json({ error: 'Admin access required' }, 403);

  const body: DiscoverRequest = await req.json();
  const { peer_id, peer_url, action = 'discover' } = body;

  // PROBE: pre-creation discovery
  if (action === 'probe') {
    if (!peer_url) return json({ error: 'peer_url required for probe' }, 400);

    const knownPaths = [
      '/.well-known/agent-card.json', '/.well-known/agent.json',
      '/agent-card.json', '/agent-card',
      '/a2a/agent-card', '/functions/v1/agent-card',
    ];
    let baseUrl = peer_url.replace(/\/$/, '');
    for (const p of knownPaths) {
      if (baseUrl.endsWith(p)) { baseUrl = baseUrl.slice(0, -p.length); break; }
    }
    const result = await fetchAgentCard(baseUrl);
    if (!result) {
      return json({
        success: false,
        error: 'No agent card found at any standard path',
        tried_paths: ['/.well-known/agent-card.json', '/.well-known/agent.json', '/agent-card', '/a2a/agent-card', '/functions/v1/agent-card'],
      });
    }
    return json({
      success: true,
      found_at: result.path,
      agent_card: {
        name: result.card.name,
        description: result.card.description,
        skills: (result.card.skills || []).map((s: any) => ({ id: s.id, name: s.name || s.id, description: s.description || '' })),
        protocol_version: result.card.protocolVersion || 'unknown',
      },
    });
  }

  if (!peer_id) return json({ error: 'peer_id required' }, 400);

  const { data: peer, error: peerError } = await supabase.from('a2a_peers').select('*').eq('id', peer_id).single();
  if (peerError || !peer) return json({ error: 'Peer not found' }, 404);
  if (!peer.url) return json({ error: 'Peer has no URL configured' }, 400);
  const peerUrl = peer.url.replace(/\/$/, '');

  if (action === 'discover') {
    const result = await fetchAgentCard(peerUrl);
    if (!result) {
      return json({ error: `No agent card found at ${peerUrl} — tried /.well-known/agent-card.json and 5 other standard paths` }, 502);
    }
    const agentCard = result.card;
    const existingCaps = (peer.capabilities && typeof peer.capabilities === 'object' && !Array.isArray(peer.capabilities))
      ? peer.capabilities as Record<string, unknown> : {};
    const updatedCaps = {
      ...existingCaps,
      protocol: existingCaps.protocol || 'jsonrpc',
      endpoint: existingCaps.endpoint || '/a2a/jsonrpc',
      agent_name: agentCard.name || peer.name,
      agent_description: agentCard.description || '',
      agent_card_path: result.path,
      skills: (agentCard.skills || []).map((s: any) => ({ id: s.id, name: s.name, description: s.description || '' })),
      discovered_at: new Date().toISOString(),
      protocol_version: agentCard.protocolVersion || 'unknown',
      capabilities_raw: agentCard.capabilities || {},
    };
    await supabase.from('a2a_peers').update({ capabilities: updatedCaps }).eq('id', peer_id);
    return json({
      success: true,
      agent_card: { name: agentCard.name, description: agentCard.description, skills: updatedCaps.skills, protocol_version: agentCard.protocolVersion },
    });
  }

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
      params: { message: { messageId, role: 'user', parts: [{ kind: 'text', text: `skill:${skillName} ${JSON.stringify(skillArgs)}` }] } },
    };

    const caps = (peer.capabilities as Record<string, unknown>) || {};
    const endpoint = (caps.endpoint as string) || '/a2a/jsonrpc';

    const { data: activityRow } = await supabase
      .from('a2a_activity')
      .insert({ peer_id: peer.id, direction: 'outbound', skill_name: skillName, input: skillArgs, status: 'pending' })
      .select('id').single();

    const startTime = Date.now();
    try {
      const response = await fetch(`${peerUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${peer.outbound_token}` },
        body: JSON.stringify(rpcPayload),
        signal: AbortSignal.timeout(120000),
      });
      const result = await response.json();
      const durationMs = Date.now() - startTime;

      let status: 'success' | 'error' = 'success';
      let errorMessage: string | null = null;
      const r = result as any;
      if (!response.ok) { status = 'error'; errorMessage = r?.error?.message || `HTTP ${response.status}`; }
      else if (r?.error) { status = 'error'; errorMessage = r.error.message || JSON.stringify(r.error); }
      else if (r?.result?.status?.state === 'failed') {
        status = 'error';
        const failParts = r.result?.status?.message?.parts || [];
        errorMessage = failParts.map((p: any) => p.text || p.kind).join(' ') || 'Task failed';
      }

      if (activityRow?.id) {
        await supabase.from('a2a_activity').update({ output: result, status, duration_ms: durationMs, error_message: errorMessage }).eq('id', activityRow.id);
      }
      await supabase.from('a2a_peers').update({ last_seen_at: new Date().toISOString(), request_count: (peer.request_count || 0) + 1 }).eq('id', peer.id);

      if (status === 'success' && action === 'audit') {
        await createObjectivesFromResult(supabase, result, peer.name);
      }

      return json({ success: status === 'success', result, duration_ms: durationMs, error: errorMessage }, status === 'success' ? 200 : 502);
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      if (activityRow?.id) {
        await supabase.from('a2a_activity').update({ output: { error: err.message }, status: 'error', duration_ms: durationMs, error_message: err.message }).eq('id', activityRow.id);
      }
      return json({ success: false, error: err.message || 'Network error' }, 502);
    }
  }

  return json({ error: `Unknown action: ${action}` }, 400);
}

async function createObjectivesFromResult(supabase: ReturnType<typeof createClient>, result: any, peerName: string) {
  try {
    const taskResult = result?.result;
    if (!taskResult) return;
    let auditText = '';
    if (taskResult.artifacts?.length) {
      for (const artifact of taskResult.artifacts) {
        for (const part of artifact.parts || []) {
          if (part.kind === 'text' || part.type === 'text') auditText += (part.text || '') + '\n';
        }
      }
    }
    if (!auditText && taskResult.status?.message?.parts) {
      for (const part of taskResult.status.message.parts) {
        if (part.kind === 'text' || part.type === 'text') auditText += (part.text || '') + '\n';
      }
    }
    if (!auditText.trim()) return;
    await supabase.from('agent_objectives').insert({
      goal: `Review audit findings from ${peerName}: ${auditText.slice(0, 200).trim()}`,
      status: 'active', constraints: {},
      success_criteria: { source: `a2a:${peerName}`, type: 'audit' },
      progress: { raw_findings: auditText.trim(), created_from: 'a2a-discover', peer_name: peerName },
    });
    console.log(`[a2a/discover] Created objective from ${peerName} audit`);
  } catch (err) {
    console.error('[a2a/discover] Failed to create objectives:', err);
  }
}

// =============================================================================
// INGEST — inbound peer webhook (was a2a-ingest)
// =============================================================================

function serializeParts(parts: any[]): string {
  if (!Array.isArray(parts)) {
    if (typeof parts === 'string') return parts;
    return '';
  }
  return parts.map(p => {
    if (typeof p === 'string') return p;
    if (p.type === 'text' || p.kind === 'text') return p.text || p.content || '';
    if (p.type === 'message' && p.content) {
      if (typeof p.content === 'string') return p.content;
      if (Array.isArray(p.content)) return serializeParts(p.content);
    }
    if (p.type === 'file' || p.kind === 'file') {
      const file = p.file || p;
      if (file.uri) return `[Attached: ${file.name || 'file'} (${file.mimeType || 'unknown'}) → ${file.uri}]`;
      if (file.bytes || file.data) {
        const size = file.bytes?.length || file.data?.length || 0;
        return `[Attached: ${file.name || 'file'} (${file.mimeType || 'unknown'}), inline ${Math.round(size / 1024)}KB]`;
      }
      return '[Attached: file]';
    }
    if (p.type === 'data' || p.kind === 'data') {
      const data = p.data || p.value || p;
      const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
      const truncated = jsonStr.length > 2048 ? jsonStr.substring(0, 2048) + '...' : jsonStr;
      return `[Data (${p.mimeType || 'application/json'}): ${truncated}]`;
    }
    if (p.text) return p.text;
    if (p.content) return typeof p.content === 'string' ? p.content : JSON.stringify(p.content);
    return JSON.stringify(p);
  }).filter(Boolean).join('\n');
}

function extractSkillFromText(text: string): { skill: string | null; args: Record<string, unknown> } {
  const skillMatch = text.match(/^skill:(\S+)\s*(.*)/s);
  if (skillMatch) {
    const skillName = skillMatch[1];
    const rest = skillMatch[2].trim();
    try { return { skill: skillName, args: JSON.parse(rest) }; }
    catch { return { skill: skillName, args: { text: rest } }; }
  }
  return { skill: null, args: { text } };
}

async function handleIngest(req: Request): Promise<Response> {
  const startTime = Date.now();

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Missing or invalid authorization header' }, 401);
  }
  const token = authHeader.replace('Bearer ', '');

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  const tokenHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  const { data: peer, error: peerError } = await supabase
    .from('a2a_peers').select('*').eq('inbound_token_hash', tokenHash).eq('status', 'active').single();

  if (peerError || !peer) return json({ error: 'Invalid or inactive peer token' }, 403);

  const body = await req.json();
  let skill: string | undefined;
  let args: Record<string, unknown> | undefined;
  let isJsonRpc = false;
  let jsonRpcId: string | number | null = null;
  let responseSchema: Record<string, unknown> | undefined;

  if (body.jsonrpc === '2.0' && body.method) {
    isJsonRpc = true;
    jsonRpcId = body.id ?? null;

    if (body.method === 'message/send' || body.method === 'message/stream') {
      const message = body.params?.message;
      const parts = message?.parts || [];

      console.log(`[a2a/ingest] Inbound from peer, method=${body.method}, messageId=${message?.messageId || 'none'}`);
      console.log(`[a2a/ingest] Parts count=${parts.length}, raw parts:`, JSON.stringify(parts).substring(0, 500));

      if (parts.length === 0 && message?.text) parts.push({ type: 'text', text: message.text });
      if (parts.length === 0 && message?.content) {
        if (typeof message.content === 'string') parts.push({ type: 'text', text: message.content });
        else if (Array.isArray(message.content)) parts.push(...message.content);
      }

      const fullText = serializeParts(parts);
      console.log(`[a2a/ingest] Serialized text (${fullText.length} chars): ${fullText.substring(0, 200)}`);

      const dataPart = parts.find((p: any) => (p.type === 'data' || p.kind === 'data') && p.data?.skill);
      if (dataPart?.data?.skill) {
        skill = dataPart.data.skill;
        args = dataPart.data.arguments || dataPart.data.args || { text: fullText };
      } else {
        const extracted = extractSkillFromText(fullText);
        if (extracted.skill) { skill = extracted.skill; args = extracted.args; }
        else { skill = 'a2a_chat'; args = { text: fullText, parts }; }
      }

      if (message?.agentId) args = { ...(args || {}), _target_agent_id: message.agentId };
      if (body.params?.responseSchema) responseSchema = body.params.responseSchema;
    } else if (body.method === 'tasks/get') {
      const taskId = body.params?.id;
      if (taskId) {
        const { data: activity } = await supabase.from('a2a_activity').select('*').eq('id', taskId).single();
        if (activity) {
          const state = activity.status === 'success' ? 'completed' : activity.status === 'error' ? 'failed' : 'working';
          return json({
            jsonrpc: '2.0', id: jsonRpcId,
            result: {
              id: taskId,
              status: { state, ...(state === 'failed' ? { message: { parts: [{ type: 'text', text: activity.error_message || 'Unknown error' }] } } : {}) },
              ...(state === 'completed' ? { artifacts: [{ parts: [{ type: 'text', text: typeof activity.output === 'string' ? activity.output : JSON.stringify(activity.output) }] }] } : {}),
            },
          });
        }
      }
      return json({ jsonrpc: '2.0', id: jsonRpcId, error: { code: -32602, message: 'Task not found' } });
    } else {
      return json({ jsonrpc: '2.0', id: jsonRpcId, error: { code: -32601, message: `Method not found: ${body.method}` } });
    }
  } else {
    skill = body.skill;
    args = body.arguments;
    if (body.responseSchema || body.response_schema) responseSchema = body.responseSchema || body.response_schema;
  }

  if (!skill) {
    const errorPayload = isJsonRpc
      ? { jsonrpc: '2.0', id: jsonRpcId, error: { code: -32602, message: 'Could not determine skill from message' } }
      : { error: 'Missing "skill" field' };
    return json(errorPayload, isJsonRpc ? 200 : 400);
  }

  const { data: activityRow } = await supabase
    .from('a2a_activity')
    .insert({ peer_id: peer.id, direction: 'inbound', skill_name: skill, input: args || {}, status: 'pending' })
    .select('id').single();

  const enrichedArgs: Record<string, unknown> = {
    ...(args || {}),
    ...(!args?.peer_name ? { peer_name: peer.name } : {}),
    ...(!args?.peer_id ? { _a2a_peer_id: peer.id } : {}),
    _site_url: 'https://demo.flowwink.com',
    ...(responseSchema ? { responseSchema } : {}),
  };

  let result: any;
  let status: 'success' | 'error' = 'success';
  let errorMessage: string | null = null;

  try {
    const execResponse = await fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
      body: JSON.stringify({
        skill_name: skill,
        arguments: enrichedArgs,
        context: { source: 'a2a', peer_id: peer.id, peer_name: peer.name },
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
  if (activityRow?.id) {
    await supabase.from('a2a_activity').update({ output: result, status, duration_ms: durationMs, error_message: errorMessage }).eq('id', activityRow.id);
  }
  await supabase.from('a2a_peers').update({ last_seen_at: new Date().toISOString(), request_count: (peer.request_count || 0) + 1 }).eq('id', peer.id);

  if (isJsonRpc) {
    const resultText = typeof result === 'string' ? result : JSON.stringify(result);
    const artifactParts: any[] = [{ type: 'text', text: resultText }];
    if (typeof result === 'object' && result !== null) {
      const urlFields = ['url', 'screenshot_url', 'report_url', 'file_url'];
      for (const field of urlFields) {
        if (result[field]) artifactParts.push({ type: 'file', file: { uri: result[field], mimeType: 'application/octet-stream' } });
      }
    }
    const jsonRpcResponse = status === 'success'
      ? { jsonrpc: '2.0', id: jsonRpcId, result: { id: activityRow?.id || crypto.randomUUID(), status: { state: 'completed' }, artifacts: [{ parts: artifactParts }] } }
      : { jsonrpc: '2.0', id: jsonRpcId, result: { id: activityRow?.id || crypto.randomUUID(), status: { state: 'failed', message: { parts: [{ type: 'text', text: errorMessage || 'Unknown error' }] } } } };
    return json(jsonRpcResponse);
  }

  return json(result, status === 'success' ? 200 : 500);
}

// =============================================================================
// OUTBOUND — admin/service dispatch to peer (was a2a-outbound)
// =============================================================================

interface OutboundRequest {
  peer_name?: string;
  peer_id?: string;
  skill?: string;
  arguments?: Record<string, unknown>;
  message?: string;
}

async function handleOutbound(req: Request): Promise<Response> {
  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
  const apikeyHeader = req.headers.get('apikey')?.trim();
  const trimmedServiceKey = serviceKey.trim();
  let isAuthorized = (token === trimmedServiceKey) || (apikeyHeader === trimmedServiceKey);

  if (!isAuthorized && token && token.startsWith('eyJ')) {
    try {
      const anonKey = (Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '').trim();
      if (token !== anonKey) {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          if (payload.role === 'service_role') isAuthorized = true;
        }
      }
    } catch { /* not a valid JWT */ }
  }

  if (!isAuthorized && token) {
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user } } = await authClient.auth.getUser();
    if (user) {
      const { data: roles } = await createClient(supabaseUrl, serviceKey)
        .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin');
      isAuthorized = !!(roles && roles.length > 0);
    }
  }

  if (!isAuthorized) return json({ error: 'Unauthorized — admin or service role only' }, 401);

  const supabase = createClient(supabaseUrl, serviceKey);
  const body: OutboundRequest = await req.json();
  const { peer_name, peer_id, skill, arguments: args = {}, message: rawMessage } = body;
  const effectiveSkill = (rawMessage && !skill) ? 'message' : (skill || 'message');

  let peerQuery = supabase.from('a2a_peers').select('*').eq('status', 'active');
  if (peer_id) peerQuery = peerQuery.eq('id', peer_id);
  else if (peer_name) peerQuery = peerQuery.ilike('name', peer_name);
  else return json({ error: 'peer_name or peer_id required' }, 400);

  const { data: peer, error: peerError } = await peerQuery.single();
  if (peerError || !peer) return json({ error: `Peer not found or not active` }, 404);
  if (!peer.url) return json({ error: `Peer '${peer.name}' has no URL configured — cannot make outbound calls` }, 400);

  const { data: activityRow } = await supabase
    .from('a2a_activity')
    .insert({ peer_id: peer.id, direction: 'outbound', skill_name: effectiveSkill, input: rawMessage ? { message: rawMessage, ...args } : args, status: 'pending' })
    .select('id').single();

  const caps = (peer.capabilities as Record<string, unknown>) || {};
  const hasGatewayToken = !!(peer.gateway_token);
  const protocol = hasGatewayToken ? 'responses' : ((caps.protocol as string) || 'jsonrpc');
  const peerUrl = peer.url.replace(/\/$/, '');

  let endpoint: string;
  let requestBody: Record<string, unknown>;
  let outboundAuth = `Bearer ${peer.outbound_token}`;

  if (protocol === 'responses') {
    endpoint = (caps.endpoint as string) || '/v1/responses';
    outboundAuth = `Bearer ${peer.gateway_token}`;
    const textPayload = rawMessage || `skill:${effectiveSkill} ${JSON.stringify(args)}`;
    requestBody = { model: (caps.model as string) || 'openclaw', input: textPayload };
    if (peer.mcp_api_key && caps.inject_mcp_tools) {
      const mcpUrl = Deno.env.get('SUPABASE_URL')!;
      (requestBody as any).tools = [{
        type: 'mcp', server_label: 'flowwink',
        server_url: `${mcpUrl}/functions/v1/mcp-server`,
        headers: { 'x-api-key': peer.mcp_api_key },
      }];
    }
  } else if (protocol === 'jsonrpc' || protocol === 'a2a') {
    endpoint = (caps.endpoint as string) || '/a2a/ingest';
    const messageId = activityRow?.id || crypto.randomUUID();
    const textPayload = rawMessage
      ? rawMessage
      : (effectiveSkill === 'message' && Object.keys(args).length === 0) ? 'ping' : `skill:${effectiveSkill} ${JSON.stringify(args)}`;
    requestBody = {
      jsonrpc: '2.0', id: messageId, method: 'message/send',
      params: { message: { messageId, role: 'user', parts: [{ kind: 'text', type: 'text', text: textPayload }] } },
    };
  } else if (protocol === 'native') {
    endpoint = (caps.endpoint as string) || '/functions/v1/a2a/ingest';
    requestBody = { skill: effectiveSkill, arguments: args, ...(rawMessage ? { message: rawMessage } : {}) };
  } else {
    endpoint = (caps.endpoint as string) || '/functions/v1/a2a-negotiate';
    requestBody = { type: 'task', skill_id: effectiveSkill, input: args };
  }

  let result: unknown;
  let status: 'success' | 'error' | 'peer_unavailable' = 'success';
  let errorMessage: string | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55_000);

    const fullUrl = `${peerUrl}${endpoint}`;
    console.log(`[a2a/outbound] Calling peer '${peer.name}' at ${fullUrl} (protocol: ${protocol})`);

    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': outboundAuth },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    console.log(`[a2a/outbound] Response from '${peer.name}': status=${response.status} content-type=${response.headers.get('content-type')}`);

    let resultText: string | null = null;
    try { result = await response.json(); }
    catch {
      try { resultText = await response.text(); } catch { resultText = ''; }
      result = { raw: resultText };
    }

    if (!response.ok) {
      status = 'error';
      const r = result as any;
      errorMessage = r?.error?.message || r?.error || `HTTP ${response.status}`;
    } else if (protocol === 'jsonrpc' || protocol === 'a2a') {
      const r = result as any;
      if (r?.error) { status = 'error'; errorMessage = r.error.message || JSON.stringify(r.error); }
      else if (r?.result?.status?.state === 'failed') {
        status = 'error';
        const failParts = r.result.status.message?.parts || [];
        errorMessage = failParts.map((p: any) => p.text).join(' ') || 'Task failed';
      }
    }
  } catch (err: any) {
    console.error(`[a2a/outbound] Fetch error for '${peer.name}':`, err.name, err.message);
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
  const activityStatus = status === 'peer_unavailable' ? 'peer_unavailable' : status;
  if (activityRow?.id) {
    await supabase.from('a2a_activity').update({
      output: result,
      status: activityStatus === 'peer_unavailable' ? 'error' : activityStatus,
      duration_ms: durationMs, error_message: errorMessage,
    }).eq('id', activityRow.id);
  }
  if (status === 'success') {
    await supabase.from('a2a_peers').update({
      last_seen_at: new Date().toISOString(),
      request_count: (peer.request_count || 0) + 1,
    }).eq('id', peer.id);
  }

  const httpStatus = status === 'success' ? 200 : status === 'peer_unavailable' ? 503 : 502;
  const responseBody = status !== 'success'
    ? { error: { message: errorMessage || `Peer returned an error`, code: status }, result }
    : result;
  return json(responseBody, httpStatus);
}
