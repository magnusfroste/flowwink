import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * a2a-chat — Conversational A2A endpoint with peer memory.
 *
 * Maintains per-peer conversation history in agent_memory so
 * FlowPilot and peers like OpenClaw can have rich, multi-turn
 * dialogues with full context.
 *
 * Also injects site health/stats so the peer gets actionable
 * intelligence without having to ask for it.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_HISTORY = 20; // Keep last N exchanges per peer
const MEMORY_KEY_PREFIX = 'a2a_conv_';

interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const text = body.text || '';
    const peerName = body.peer_name || body.context?.peer_name || 'unknown';
    const peerId = body._a2a_peer_id || body.context?.peer_id || null;
    const responseSchema = body.responseSchema || body.response_schema || null;

    if (!text.trim()) {
      return new Response(JSON.stringify({ result: 'No message provided' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- 1. Load conversation history for this peer ---
    const memoryKey = `${MEMORY_KEY_PREFIX}${peerId || peerName}`;
    const { data: memoryRow } = await supabase
      .from('agent_memory')
      .select('value')
      .eq('key', memoryKey)
      .maybeSingle();

    const history: ConversationEntry[] = Array.isArray(memoryRow?.value)
      ? (memoryRow.value as ConversationEntry[])
      : [];

    // --- 2. Load FlowPilot identity ---
    const [soulResult, identityResult] = await Promise.all([
      supabase.from('agent_memory').select('value').eq('key', 'soul').maybeSingle(),
      supabase.from('agent_memory').select('value').eq('key', 'identity').maybeSingle(),
    ]);

    const soulText = typeof soulResult.data?.value === 'string'
      ? soulResult.data.value
      : JSON.stringify(soulResult.data?.value || '');
    const idObj = identityResult.data?.value as any;
    const agentName = idObj?.name || 'FlowPilot';

    // --- 3. Gather site intelligence (lightweight) ---
    const siteIntel = await gatherSiteIntelligence(supabase);

    // --- 4. Build system prompt ---
    const schemaInstruction = responseSchema
      ? `\n\nIMPORTANT: The peer has requested a specific response format. You MUST respond with valid JSON matching this schema:\n${JSON.stringify(responseSchema, null, 2)}\nDo NOT wrap it in markdown code blocks. Return raw JSON only.`
      : '';

    const systemPrompt = `You are ${agentName}, an autonomous CMS operator for FlowWink (demo.flowwink.com). You are in a conversation with federation peer "${peerName}" via the A2A protocol.

${soulText ? `Your soul/personality:\n${soulText}\n` : ''}

## Current Site Status
${siteIntel}

## Conversation Guidelines
- You have an ongoing relationship with this peer. Reference previous exchanges when relevant.
- Be direct, actionable, and share concrete data when asked.
- If asked to perform tasks, confirm what you'll do and follow through.
- If the peer is an Architect (like OpenClaw/Frostie), treat their findings seriously — they help improve our platform.
- Share metrics, health status, and recent activity proactively when it adds value.${schemaInstruction}`;

    // --- 5. Build message array with history ---
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history (last N entries)
    for (const entry of history.slice(-MAX_HISTORY)) {
      messages.push({ role: entry.role, content: entry.content });
    }

    // Add current message
    messages.push({ role: 'user', content: text });

    // --- 6. Call chat-completion ---
    const chatResponse = await fetch(`${supabaseUrl}/functions/v1/chat-completion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        messages,
        mode: 'agent',
        stream: false,
      }),
    });

    if (!chatResponse.ok) {
      const errText = await chatResponse.text();
      console.error('[a2a-chat] chat-completion error:', chatResponse.status, errText);
      return new Response(JSON.stringify({
        result: `I received your message but had trouble processing it. Please try again.`,
        error: 'chat_completion_failed',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse SSE stream
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

    // --- 7. Save updated conversation history ---
    const updatedHistory: ConversationEntry[] = [
      ...history,
      { role: 'user', content: text, timestamp: new Date().toISOString() },
      { role: 'assistant', content: reply, timestamp: new Date().toISOString() },
    ].slice(-MAX_HISTORY); // Keep bounded

    await supabase.from('agent_memory').upsert({
      key: memoryKey,
      value: updatedHistory,
      category: 'conversation',
      created_by: 'flowpilot',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });

    console.log(`[a2a-chat] Conversation with ${peerName}: ${history.length} prior exchanges, replied: ${reply.substring(0, 80)}...`);

    // --- 8. If responseSchema was requested, try to parse as JSON ---
    let result: unknown = reply;
    if (responseSchema) {
      try {
        result = JSON.parse(reply);
      } catch {
        // LLM didn't return valid JSON — return as-is with a hint
        result = { _raw: reply, _schema_compliance: false };
      }
    }

    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[a2a-chat] Error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// =============================================================================
// Site Intelligence Gatherer
// =============================================================================

async function gatherSiteIntelligence(supabase: any): Promise<string> {
  try {
    const [
      pagesResult,
      postsResult,
      leadsResult,
      bookingsResult,
      objectivesResult,
      activityResult,
      peersResult,
    ] = await Promise.all([
      supabase.from('pages').select('id', { count: 'exact', head: true }),
      supabase.from('blog_posts').select('id', { count: 'exact', head: true }),
      supabase.from('leads').select('id', { count: 'exact', head: true }),
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'confirmed'),
      supabase.from('agent_objectives').select('id, goal, status').eq('status', 'active').limit(5),
      supabase.from('agent_activity')
        .select('skill_name, status, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase.from('a2a_peers').select('name, status, last_seen_at').eq('status', 'active'),
    ]);

    const activeObjectives = (objectivesResult.data || [])
      .map((o: any) => `  - ${o.goal}`)
      .join('\n');

    const recentActivity = (activityResult.data || [])
      .map((a: any) => `  - ${a.skill_name}: ${a.status} (${a.created_at})`)
      .join('\n');

    const activePeers = (peersResult.data || [])
      .map((p: any) => `  - ${p.name} (last seen: ${p.last_seen_at || 'never'})`)
      .join('\n');

    return `Pages: ${pagesResult.count || 0} | Blog posts: ${postsResult.count || 0} | Leads: ${leadsResult.count || 0} | Active bookings: ${bookingsResult.count || 0}

Active objectives:
${activeObjectives || '  (none)'}

Recent agent activity:
${recentActivity || '  (none)'}

Connected peers:
${activePeers || '  (none)'}`;
  } catch (err) {
    console.warn('[a2a-chat] Failed to gather site intelligence:', err);
    return '(Site intelligence unavailable)';
  }
}
