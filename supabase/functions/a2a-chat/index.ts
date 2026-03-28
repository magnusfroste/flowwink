import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    if (!text.trim()) {
      return new Response(JSON.stringify({ result: 'No message provided' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load FlowPilot soul + identity for context
    const { data: soul } = await supabase
      .from('agent_memory')
      .select('value')
      .eq('key', 'soul')
      .maybeSingle();

    const { data: identity } = await supabase
      .from('agent_memory')
      .select('value')
      .eq('key', 'identity')
      .maybeSingle();

    const soulText = typeof soul?.value === 'string' ? soul.value : JSON.stringify(soul?.value || '');
    const idObj = identity?.value as any;
    const agentName = idObj?.name || 'FlowPilot';

    const systemPrompt = `You are ${agentName}, an autonomous CMS operator. You are responding to a message from a federation peer agent named "${peerName}" via the A2A protocol.

${soulText ? `Your soul/personality:\n${soulText}\n` : ''}

Respond helpfully and concisely. You represent the FlowWink platform. If asked about capabilities, describe what you can do (content management, booking, CRM, analytics, etc). If asked to perform tasks, explain what you'd need or confirm you'll handle it.`;

    // Call chat-completion to get FlowPilot's response
    const chatResponse = await fetch(`${supabaseUrl}/functions/v1/chat-completion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `[A2A message from ${peerName}]: ${text}` },
        ],
        mode: 'agent',
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

    const chatResult = await chatResponse.json();
    const reply = chatResult.reply || chatResult.choices?.[0]?.message?.content || chatResult.content || 'Message received.';

    console.log(`[a2a-chat] Replied to ${peerName}: ${reply.substring(0, 100)}...`);

    return new Response(JSON.stringify({ result: reply }), {
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