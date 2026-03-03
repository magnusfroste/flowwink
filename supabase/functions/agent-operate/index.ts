import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Memory helpers ───────────────────────────────────────────────────────────

async function loadMemories(supabase: any): Promise<string> {
  const { data } = await supabase
    .from('agent_memory')
    .select('key, value, category')
    .order('updated_at', { ascending: false })
    .limit(30);

  if (!data || data.length === 0) return '';

  const lines = data.map((m: any) => `- [${m.category}] ${m.key}: ${JSON.stringify(m.value)}`);
  return `\n\nYour memory (things you've learned about this site and its owner):\n${lines.join('\n')}`;
}

async function handleMemoryWrite(supabase: any, args: { key: string; value: any; category?: string }) {
  const { key, value, category = 'context' } = args;
  const { data: existing } = await supabase
    .from('agent_memory')
    .select('id')
    .eq('key', key)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('agent_memory')
      .update({ value: typeof value === 'object' ? value : { text: value }, category, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('agent_memory')
      .insert({ key, value: typeof value === 'object' ? value : { text: value }, category, created_by: 'flowpilot' });
  }
  return { status: 'saved', key };
}

async function handleMemoryRead(supabase: any, args: { key?: string; category?: string }) {
  let q = supabase.from('agent_memory').select('key, value, category, updated_at');
  if (args.key) q = q.ilike('key', `%${args.key}%`);
  if (args.category) q = q.eq('category', args.category);
  const { data } = await q.order('updated_at', { ascending: false }).limit(10);
  return { memories: data || [] };
}

// ─── Built-in memory tool definitions ─────────────────────────────────────────

const memoryTools = [
  {
    type: 'function',
    function: {
      name: 'memory_write',
      description: 'Save something to your persistent memory. Use this to remember user preferences, facts about the site, important decisions, or context for future conversations.',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Short identifier for this memory, e.g. "preferred_blog_tone" or "owner_name"' },
          value: { description: 'The information to remember — can be a string or object' },
          category: { type: 'string', enum: ['preference', 'context', 'fact'], description: 'Category: preference (user likes/dislikes), context (situational info), fact (objective data)' },
        },
        required: ['key', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'memory_read',
      description: 'Search your persistent memory for previously saved information. Use when you need to recall preferences, context, or facts.',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Search term to find in memory keys' },
          category: { type: 'string', enum: ['preference', 'context', 'fact'], description: 'Filter by category' },
        },
      },
    },
  },
];

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, available_skills } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get AI config from settings
    let apiKey = Deno.env.get('OPENAI_API_KEY') || '';
    let apiUrl = 'https://api.openai.com/v1/chat/completions';
    let model = 'gpt-4o';

    const { data: settings } = await supabase
      .from('site_settings').select('value').eq('key', 'system_ai').maybeSingle();

    if (settings?.value) {
      const cfg = settings.value as Record<string, string>;
      if (cfg.provider === 'gemini' && Deno.env.get('GEMINI_API_KEY')) {
        apiKey = Deno.env.get('GEMINI_API_KEY')!;
        apiUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
        model = cfg.model || 'gemini-2.5-flash';
      } else if (cfg.provider === 'openai' && Deno.env.get('OPENAI_API_KEY')) {
        apiKey = Deno.env.get('OPENAI_API_KEY')!;
        model = cfg.model || 'gpt-4o';
      }
    }

    // Fallback to Lovable AI if no keys
    if (!apiKey) {
      const lovableKey = Deno.env.get('LOVABLE_API_KEY');
      if (lovableKey) {
        apiKey = lovableKey;
        apiUrl = 'https://ai.gateway.lovable.dev/v1/chat/completions';
        model = 'google/gemini-2.5-flash';
      }
    }

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'No AI provider configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load memories for context
    const memoryContext = await loadMemories(supabase);

    const systemPrompt = `You are FlowPilot in Operate mode — an AI assistant that controls a CMS platform.

You have access to tools/skills that let you take real actions: write blog posts, add leads, analyze traffic, book appointments, send newsletters, and more.

You also have PERSISTENT MEMORY. You can remember things between conversations using memory_write and memory_read.

MEMORY GUIDELINES:
- When the user tells you a preference, fact, or important context → save it with memory_write
- Examples: their preferred tone, brand name, target audience, common tasks, language preferences
- Before answering questions about the site, check if you already know from memory
- Use category "preference" for likes/dislikes, "fact" for objective info, "context" for situational data
${memoryContext}

RULES:
- When the user asks you to do something, USE the appropriate tool immediately.
- After using a tool, summarize what you did in a friendly, concise way.
- If no tool matches, answer conversationally with your knowledge.
- Be concise: 1-2 sentences max before or after tool calls.
- Use emoji sparingly but naturally.
- If a task requires multiple steps, explain your plan first.
- Proactively save useful information to memory when you learn it.`;

    // Merge memory tools with available skills
    const allTools = [...memoryTools, ...(available_skills || [])];

    // Call AI with tool calling
    const aiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        tools: allTools.length > 0 ? allTools : undefined,
        tool_choice: allTools.length > 0 ? 'auto' : undefined,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('AI error:', aiResponse.status, errText);
      return new Response(JSON.stringify({ error: 'AI provider error', message: 'Could not process your request. Please try again.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResponse.json();
    const choice = aiData.choices?.[0];

    if (!choice) {
      return new Response(JSON.stringify({ message: 'No response from AI' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if AI wants to call a tool
    if (choice.message?.tool_calls?.length) {
      const toolCall = choice.message.tool_calls[0];
      const fnName = toolCall.function.name;
      const fnArgs = JSON.parse(toolCall.function.arguments || '{}');

      let executeResult: any;

      // Handle built-in memory tools locally
      if (fnName === 'memory_write') {
        executeResult = await handleMemoryWrite(supabase, fnArgs);
      } else if (fnName === 'memory_read') {
        executeResult = await handleMemoryRead(supabase, fnArgs);
      } else {
        // Execute skill through agent-execute
        const executeResponse = await fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            skill_name: fnName,
            arguments: fnArgs,
            agent_type: 'flowpilot',
          }),
        });
        executeResult = await executeResponse.json();
      }

      // Get AI to summarize the result
      const summaryResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
            choice.message,
            {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(executeResult),
            },
          ],
        }),
      });

      const summaryData = await summaryResponse.json();
      const summaryText = summaryData.choices?.[0]?.message?.content || 'Action completed.';

      return new Response(JSON.stringify({
        message: summaryText,
        skill_result: {
          skill: fnName,
          status: executeResult.status || 'success',
          result: executeResult.result || executeResult,
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // No tool call — just a text response
    return new Response(JSON.stringify({
      message: choice.message?.content || "I'm not sure how to help with that.",
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('agent-operate error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
