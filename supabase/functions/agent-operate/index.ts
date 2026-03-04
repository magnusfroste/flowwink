import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_TOOL_ITERATIONS = 6;

const BUILT_IN_TOOL_NAMES = [
  'memory_write', 'memory_read',
  'objective_update_progress', 'objective_complete',
  'skill_create', 'skill_update', 'skill_list', 'skill_disable',
  'automation_create', 'automation_list',
  'reflect',
];

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
    .from('agent_memory').select('id').eq('key', key).maybeSingle();

  if (existing) {
    await supabase.from('agent_memory')
      .update({ value: typeof value === 'object' ? value : { text: value }, category, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await supabase.from('agent_memory')
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

// ─── Objectives helpers ───────────────────────────────────────────────────────

async function loadObjectives(supabase: any): Promise<string> {
  const { data } = await supabase
    .from('agent_objectives')
    .select('id, goal, status, constraints, success_criteria, progress')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(10);

  if (!data || data.length === 0) return '';
  const lines = data.map((o: any) =>
    `- [${o.id.slice(0, 8)}] "${o.goal}" | progress: ${JSON.stringify(o.progress)} | criteria: ${JSON.stringify(o.success_criteria)} | constraints: ${JSON.stringify(o.constraints)}`
  );
  return `\n\nYour active objectives (high-level goals to work toward):\n${lines.join('\n')}`;
}

async function handleObjectiveUpdateProgress(supabase: any, args: { objective_id: string; progress: any }) {
  const { error } = await supabase
    .from('agent_objectives').update({ progress: args.progress }).eq('id', args.objective_id);
  if (error) return { status: 'error', error: error.message };
  return { status: 'updated', objective_id: args.objective_id };
}

async function handleObjectiveComplete(supabase: any, args: { objective_id: string }) {
  const { error } = await supabase
    .from('agent_objectives')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', args.objective_id);
  if (error) return { status: 'error', error: error.message };
  return { status: 'completed', objective_id: args.objective_id };
}

// ─── Self-modification: Skill CRUD ────────────────────────────────────────────

async function handleSkillCreate(supabase: any, args: {
  name: string;
  description: string;
  handler: string;
  category?: string;
  scope?: string;
  requires_approval?: boolean;
  tool_definition: any;
}) {
  const { data: existing } = await supabase
    .from('agent_skills').select('id').eq('name', args.name).maybeSingle();
  if (existing) return { status: 'error', error: `Skill "${args.name}" already exists (id: ${existing.id})` };

  const { data, error } = await supabase.from('agent_skills').insert({
    name: args.name,
    description: args.description,
    handler: args.handler,
    category: args.category || 'automation',
    scope: args.scope || 'internal',
    requires_approval: args.requires_approval ?? true,
    enabled: true,
    tool_definition: args.tool_definition,
  }).select('id, name, handler, enabled').single();

  if (error) return { status: 'error', error: error.message };
  return { status: 'created', skill: data };
}

async function handleSkillUpdate(supabase: any, args: {
  skill_name: string;
  updates: Record<string, any>;
}) {
  const safeFields = ['description', 'handler', 'category', 'scope', 'requires_approval', 'enabled', 'tool_definition'];
  const filtered: Record<string, any> = {};
  for (const [k, v] of Object.entries(args.updates)) {
    if (safeFields.includes(k)) filtered[k] = v;
  }

  if (Object.keys(filtered).length === 0) return { status: 'error', error: 'No valid fields to update' };
  filtered.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('agent_skills')
    .update(filtered)
    .eq('name', args.skill_name)
    .select('id, name, enabled')
    .single();

  if (error) return { status: 'error', error: error.message };
  return { status: 'updated', skill: data };
}

async function handleSkillList(supabase: any, args: { category?: string; scope?: string; include_disabled?: boolean }) {
  let q = supabase.from('agent_skills').select('id, name, description, category, scope, handler, enabled, requires_approval');
  if (!args.include_disabled) q = q.eq('enabled', true);
  if (args.category) q = q.eq('category', args.category);
  if (args.scope) q = q.eq('scope', args.scope);
  const { data } = await q.order('category').order('name');
  return { skills: data || [], count: data?.length || 0 };
}

async function handleSkillDisable(supabase: any, args: { skill_name: string }) {
  const { data, error } = await supabase
    .from('agent_skills')
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq('name', args.skill_name)
    .select('id, name')
    .single();
  if (error) return { status: 'error', error: error.message };
  return { status: 'disabled', skill: data };
}

// ─── Self-modification: Automation CRUD ───────────────────────────────────────

async function handleAutomationCreate(supabase: any, args: {
  name: string;
  description?: string;
  trigger_type: string;
  trigger_config: any;
  skill_name: string;
  skill_arguments?: any;
  enabled?: boolean;
}) {
  const { data: skill } = await supabase
    .from('agent_skills').select('id').eq('name', args.skill_name).eq('enabled', true).maybeSingle();

  const { data, error } = await supabase.from('agent_automations').insert({
    name: args.name,
    description: args.description || null,
    trigger_type: args.trigger_type || 'cron',
    trigger_config: args.trigger_config || {},
    skill_id: skill?.id || null,
    skill_name: args.skill_name,
    skill_arguments: args.skill_arguments || {},
    enabled: args.enabled ?? false,
  }).select('id, name, trigger_type, enabled').single();

  if (error) return { status: 'error', error: error.message };
  return { status: 'created', automation: data };
}

async function handleAutomationList(supabase: any, args: { enabled_only?: boolean }) {
  let q = supabase.from('agent_automations').select('id, name, description, trigger_type, trigger_config, skill_name, enabled, run_count, last_triggered_at');
  if (args.enabled_only) q = q.eq('enabled', true);
  const { data } = await q.order('created_at', { ascending: false });
  return { automations: data || [], count: data?.length || 0 };
}

// ─── Reflection: Analyze patterns ─────────────────────────────────────────────

async function handleReflect(supabase: any, args: { focus?: string }) {
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const { data: recentActivity } = await supabase
    .from('agent_activity')
    .select('skill_name, status, duration_ms, error_message, created_at')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(100);

  const activities = recentActivity || [];

  const skillStats: Record<string, { count: number; errors: number; avg_ms: number; last_error?: string }> = {};
  for (const a of activities) {
    const name = a.skill_name || 'unknown';
    if (!skillStats[name]) skillStats[name] = { count: 0, errors: 0, avg_ms: 0 };
    skillStats[name].count++;
    if (a.status === 'failed') {
      skillStats[name].errors++;
      skillStats[name].last_error = a.error_message;
    }
    if (a.duration_ms) {
      skillStats[name].avg_ms = Math.round(
        (skillStats[name].avg_ms * (skillStats[name].count - 1) + a.duration_ms) / skillStats[name].count
      );
    }
  }

  const { data: allSkills } = await supabase
    .from('agent_skills').select('name, category, handler, enabled').order('category');
  const { data: automations } = await supabase
    .from('agent_automations').select('name, trigger_type, skill_name, enabled, run_count');
  const { data: objectives } = await supabase
    .from('agent_objectives').select('goal, status, progress');

  return {
    period: '7 days',
    total_actions: activities.length,
    skill_usage: skillStats,
    registered_skills: allSkills?.length || 0,
    active_automations: automations?.filter((a: any) => a.enabled).length || 0,
    total_automations: automations?.length || 0,
    active_objectives: objectives?.filter((o: any) => o.status === 'active').length || 0,
    skills: allSkills || [],
    automations: automations || [],
    objectives: objectives || [],
    suggestions: generateSuggestions(skillStats, allSkills || [], automations || []),
  };
}

function generateSuggestions(
  stats: Record<string, any>,
  skills: any[],
  automations: any[],
): string[] {
  const suggestions: string[] = [];
  for (const [name, s] of Object.entries(stats)) {
    if (s.errors > 2) {
      suggestions.push(`Skill "${name}" has ${s.errors} failures — consider debugging or updating its handler.`);
    }
  }
  const automatedSkills = new Set(automations.map((a: any) => a.skill_name));
  for (const [name, s] of Object.entries(stats)) {
    if (s.count >= 5 && !automatedSkills.has(name)) {
      suggestions.push(`"${name}" was used ${s.count} times manually — consider creating an automation for it.`);
    }
  }
  const usedSkills = new Set(Object.keys(stats));
  const unusedSkills = skills.filter(s => s.enabled && !usedSkills.has(s.name));
  if (unusedSkills.length > 3) {
    suggestions.push(`${unusedSkills.length} skills have never been used. Consider disabling unused ones or promoting them in your workflow.`);
  }
  if (suggestions.length === 0) {
    suggestions.push('System is running well. No immediate improvements suggested.');
  }
  return suggestions;
}

// ─── Built-in tool definitions ────────────────────────────────────────────────

const memoryTools = [
  {
    type: 'function',
    function: {
      name: 'memory_write',
      description: 'Save something to your persistent memory.',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Short identifier e.g. "preferred_blog_tone"' },
          value: { description: 'The information to remember' },
          category: { type: 'string', enum: ['preference', 'context', 'fact'] },
        },
        required: ['key', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'memory_read',
      description: 'Search your persistent memory.',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Search term' },
          category: { type: 'string', enum: ['preference', 'context', 'fact'] },
        },
      },
    },
  },
];

const objectiveTools = [
  {
    type: 'function',
    function: {
      name: 'objective_update_progress',
      description: 'Update progress on an active objective.',
      parameters: {
        type: 'object',
        properties: {
          objective_id: { type: 'string' },
          progress: { type: 'object', description: 'Updated progress object' },
        },
        required: ['objective_id', 'progress'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'objective_complete',
      description: 'Mark an objective as completed.',
      parameters: {
        type: 'object',
        properties: {
          objective_id: { type: 'string' },
        },
        required: ['objective_id'],
      },
    },
  },
];

const selfModTools = [
  {
    type: 'function',
    function: {
      name: 'skill_create',
      description: 'Create a new skill in your registry. Use this to extend your own capabilities. Handler types: "module:name" for DB operations, "edge:function-name" for edge functions, "db:table" for direct queries, "webhook:url" for external calls.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'snake_case skill name, e.g. "weekly_digest_report"' },
          description: { type: 'string', description: 'What this skill does' },
          handler: { type: 'string', description: 'Handler route, e.g. "module:blog", "edge:my-function", "db:page_views"' },
          category: { type: 'string', enum: ['content', 'crm', 'communication', 'automation', 'search', 'analytics'] },
          scope: { type: 'string', enum: ['internal', 'external', 'both'], description: 'Who can use this skill' },
          requires_approval: { type: 'boolean', description: 'Whether admin must approve before execution. Default true for safety.' },
          tool_definition: { type: 'object', description: 'OpenAI function calling definition with type:"function" and function:{name, description, parameters}' },
        },
        required: ['name', 'description', 'handler', 'tool_definition'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'skill_update',
      description: 'Update an existing skill. Can change description, handler, scope, approval setting, or tool_definition.',
      parameters: {
        type: 'object',
        properties: {
          skill_name: { type: 'string', description: 'Name of the skill to update' },
          updates: { type: 'object', description: 'Fields to update: description, handler, category, scope, requires_approval, enabled, tool_definition' },
        },
        required: ['skill_name', 'updates'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'skill_list',
      description: 'List all registered skills with their details.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Filter by category' },
          scope: { type: 'string', description: 'Filter by scope' },
          include_disabled: { type: 'boolean', description: 'Include disabled skills' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'skill_disable',
      description: 'Disable a skill that is no longer needed or is causing problems.',
      parameters: {
        type: 'object',
        properties: {
          skill_name: { type: 'string', description: 'Name of the skill to disable' },
        },
        required: ['skill_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'automation_create',
      description: 'Create a new automation that triggers a skill on a schedule or event. Created automations are disabled by default for safety.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Human-readable automation name' },
          description: { type: 'string' },
          trigger_type: { type: 'string', enum: ['cron', 'event', 'signal'] },
          trigger_config: { type: 'object', description: 'For cron: {cron: "0 9 * * 1"}, for event: {event_name: "lead.created"}, for signal: {signal: "score_threshold", condition: {min_score: 50}}' },
          skill_name: { type: 'string', description: 'Name of the skill to execute' },
          skill_arguments: { type: 'object', description: 'Default arguments to pass to the skill' },
          enabled: { type: 'boolean', description: 'Whether to enable immediately (default: false)' },
        },
        required: ['name', 'trigger_type', 'trigger_config', 'skill_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'automation_list',
      description: 'List all automations with their status and run counts.',
      parameters: {
        type: 'object',
        properties: {
          enabled_only: { type: 'boolean', description: 'Only show enabled automations' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reflect',
      description: 'Analyze your own performance over the past week. Returns skill usage stats, error rates, unused skills, automation coverage, and improvement suggestions. Use this to identify areas for self-improvement.',
      parameters: {
        type: 'object',
        properties: {
          focus: { type: 'string', description: 'Optional focus area: "errors", "usage", "automations", "objectives"' },
        },
      },
    },
  },
];

// ─── Tool execution helper ────────────────────────────────────────────────────

async function executeToolCall(
  supabase: any,
  supabaseUrl: string,
  serviceKey: string,
  fnName: string,
  fnArgs: any,
): Promise<any> {
  switch (fnName) {
    case 'memory_write': return handleMemoryWrite(supabase, fnArgs);
    case 'memory_read': return handleMemoryRead(supabase, fnArgs);
    case 'objective_update_progress': return handleObjectiveUpdateProgress(supabase, fnArgs);
    case 'objective_complete': return handleObjectiveComplete(supabase, fnArgs);
    case 'skill_create': return handleSkillCreate(supabase, fnArgs);
    case 'skill_update': return handleSkillUpdate(supabase, fnArgs);
    case 'skill_list': return handleSkillList(supabase, fnArgs);
    case 'skill_disable': return handleSkillDisable(supabase, fnArgs);
    case 'automation_create': return handleAutomationCreate(supabase, fnArgs);
    case 'automation_list': return handleAutomationList(supabase, fnArgs);
    case 'reflect': return handleReflect(supabase, fnArgs);
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
    body: JSON.stringify({ skill_name: fnName, arguments: fnArgs, agent_type: 'flowpilot' }),
  });
  return response.json();
}

// ─── SSE helpers ──────────────────────────────────────────────────────────────

function sseEvent(writer: WritableStreamDefaultWriter, encoder: TextEncoder, event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return writer.write(encoder.encode(payload));
}

// ─── Main handler (streaming) ─────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, available_skills } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get AI config
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

    // Load context
    const [memoryContext, objectiveContext] = await Promise.all([
      loadMemories(supabase),
      loadObjectives(supabase),
    ]);

    const systemPrompt = `You are FlowPilot in Operate mode — an autonomous, self-improving AI assistant that controls a CMS platform.

You can use MULTIPLE tools in a single turn and CHAIN tool calls across iterations.
When a task requires multiple steps, execute them sequentially — don't just describe a plan.

TOOLS & SKILLS:
- CMS skills: blog posts, leads, analytics, bookings, newsletters, etc.
- PERSISTENT MEMORY (memory_write / memory_read)
- OBJECTIVES (objective_update_progress / objective_complete)
- SELF-MODIFICATION: You can create, update, disable, and list your own skills and automations.
- REFLECTION: Use 'reflect' to analyze your performance and identify improvements.

SELF-IMPROVEMENT GUIDELINES:
- If a user asks you to do something you can't, consider creating a new skill for it.
- When you notice repetitive manual tasks, suggest creating an automation.
- Use 'reflect' periodically (or when asked) to review your own performance.
- When creating skills, set requires_approval=true for anything destructive.
- New automations are disabled by default — tell the user to enable them when ready.
- Handler types: module:name (DB ops), edge:function (edge functions), db:table (queries), webhook:url (external)

MEMORY GUIDELINES:
- Save user preferences, facts, and context with memory_write
- Check memory before answering questions about the site
${memoryContext}

OBJECTIVES:
- After executing skills that contribute to an objective, update progress.
- When all success_criteria are met, mark as complete.
${objectiveContext}

RULES:
- When the user asks you to do something, USE the appropriate tools immediately.
- You can call MULTIPLE tools in parallel when they're independent.
- After tool results come back, you may call MORE tools if the task isn't done.
- After all actions complete, summarize what you did concisely.
- Use markdown formatting for clear, readable responses.
- Be concise but thorough. Use emoji sparingly.`;

    const allTools = [...memoryTools, ...objectiveTools, ...selfModTools, ...(available_skills || [])];

    // ─── Set up SSE stream ────────────────────────────────────────────
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    const response = new Response(readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

    // Run the agent loop in background
    (async () => {
      try {
        let conversationMessages: any[] = [
          { role: 'system', content: systemPrompt },
          ...messages,
        ];

        const allSkillResults: any[] = [];

        for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
          // Non-streaming AI call for tool-calling iterations
          const aiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              messages: conversationMessages,
              tools: allTools.length > 0 ? allTools : undefined,
              tool_choice: allTools.length > 0 ? 'auto' : undefined,
            }),
          });

          if (!aiResponse.ok) {
            const errText = await aiResponse.text();
            console.error('AI error:', aiResponse.status, errText);
            await sseEvent(writer, encoder, 'error', { message: 'AI provider error' });
            break;
          }

          const aiData = await aiResponse.json();
          const choice = aiData.choices?.[0];

          if (!choice) {
            await sseEvent(writer, encoder, 'error', { message: 'No response from AI' });
            break;
          }

          const assistantMessage = choice.message;

          // No tool calls — stream the final text response
          if (!assistantMessage.tool_calls?.length) {
            // Send skill results metadata first
            if (allSkillResults.length > 0) {
              await sseEvent(writer, encoder, 'skill_results', allSkillResults);
            }

            // Now stream the final answer
            const finalContent = assistantMessage.content || 'Done.';
            await streamFinalResponse(apiUrl, apiKey, model, conversationMessages, allTools, writer, encoder, finalContent);
            break;
          }

          // Tool calls — execute them and notify client
          conversationMessages.push(assistantMessage);

          // Send status event for each tool being executed
          const toolNames = assistantMessage.tool_calls.map((tc: any) => tc.function.name);
          await sseEvent(writer, encoder, 'tool_start', { 
            iteration: iteration + 1,
            tools: toolNames,
          });

          const toolResults = await Promise.all(
            assistantMessage.tool_calls.map(async (tc: any) => {
              const fnName = tc.function.name;
              let fnArgs: any;
              try {
                fnArgs = JSON.parse(tc.function.arguments || '{}');
              } catch {
                fnArgs = {};
              }

              let result: any;
              try {
                result = await executeToolCall(supabase, supabaseUrl, serviceKey, fnName, fnArgs);
              } catch (err: any) {
                result = { error: err.message };
              }

              if (!BUILT_IN_TOOL_NAMES.includes(fnName)) {
                allSkillResults.push({
                  skill: fnName,
                  status: result?.status || 'success',
                  result: result?.result || result,
                });
              }

              return {
                role: 'tool' as const,
                tool_call_id: tc.id,
                content: JSON.stringify(result),
              };
            })
          );

          conversationMessages.push(...toolResults);

          await sseEvent(writer, encoder, 'tool_done', {
            iteration: iteration + 1,
            tools: toolNames,
            results_count: toolResults.length,
          });
        }
      } catch (err: any) {
        console.error('agent-operate stream error:', err);
        try {
          await sseEvent(writer, encoder, 'error', { message: err.message || 'Internal error' });
        } catch { /* writer may be closed */ }
      } finally {
        try {
          await writer.close();
        } catch { /* already closed */ }
      }
    })();

    return response;

  } catch (err: any) {
    console.error('agent-operate error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ─── Stream final AI response token-by-token ─────────────────────────────────

async function streamFinalResponse(
  apiUrl: string,
  apiKey: string,
  model: string,
  conversationMessages: any[],
  _allTools: any[],
  writer: WritableStreamDefaultWriter,
  encoder: TextEncoder,
  fallbackContent: string,
) {
  try {
    // Try streaming the response
    const streamResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: conversationMessages,
        stream: true,
      }),
    });

    if (!streamResponse.ok || !streamResponse.body) {
      // Fallback: send the already-available content as a single delta
      await sseEvent(writer, encoder, 'delta', { content: fallbackContent });
      await sseEvent(writer, encoder, 'done', {});
      return;
    }

    const reader = streamResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (!line.startsWith('data: ')) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') {
          await sseEvent(writer, encoder, 'done', {});
          return;
        }

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            await sseEvent(writer, encoder, 'delta', { content });
          }
        } catch {
          // Partial JSON, put back
          buffer = line + '\n' + buffer;
          break;
        }
      }
    }

    // Flush remaining
    if (buffer.trim()) {
      for (let raw of buffer.split('\n')) {
        if (!raw) continue;
        if (raw.endsWith('\r')) raw = raw.slice(0, -1);
        if (!raw.startsWith('data: ')) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === '[DONE]') continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            await sseEvent(writer, encoder, 'delta', { content });
          }
        } catch { /* ignore */ }
      }
    }

    await sseEvent(writer, encoder, 'done', {});
  } catch (err) {
    console.error('Stream error, falling back:', err);
    await sseEvent(writer, encoder, 'delta', { content: fallbackContent });
    await sseEvent(writer, encoder, 'done', {});
  }
}
