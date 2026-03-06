import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Agent Reason — Unified LLM Orchestration Engine
 *
 * The single reasoning core shared by all FlowPilot surfaces:
 *   - agent-operate (interactive, streaming)
 *   - flowpilot-heartbeat (autonomous, non-streaming)
 *   - chat-completion delegates skill execution here too
 *
 * Consolidates: AI config, built-in tools, tool loop, memory/objectives,
 * soul/identity, reflection, self-modification, and agent-execute delegation.
 *
 * NOT a serve() handler — this is an importable module.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReasonConfig {
  /** Which skill scopes to load: 'internal' | 'external' | 'both' */
  scope: 'internal' | 'external';
  /** Maximum tool-call iterations */
  maxIterations?: number;
  /** System prompt override (appended after soul/identity/memory/objectives) */
  systemPromptOverride?: string;
  /** Extra context sections to inject (e.g., site stats, activity) */
  extraContext?: string;
  /** Which built-in tool groups to include */
  builtInToolGroups?: Array<'memory' | 'objectives' | 'self-mod' | 'reflect' | 'soul'>;
  /** Additional tools (e.g., skills already loaded by the caller) */
  additionalTools?: any[];
}

export interface ReasonResult {
  /** Final text response from the LLM */
  response: string;
  /** Tool names that were executed */
  actionsExecuted: string[];
  /** Skill results (non-built-in tools) */
  skillResults: Array<{ skill: string; status: string; result: any }>;
  /** Duration in ms */
  durationMs: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BUILT_IN_TOOL_NAMES = new Set([
  'memory_write', 'memory_read',
  'objective_update_progress', 'objective_complete',
  'skill_create', 'skill_update', 'skill_list', 'skill_disable',
  'skill_instruct',
  'soul_update',
  'automation_create', 'automation_list',
  'reflect',
]);

// ─── AI Config Resolution ─────────────────────────────────────────────────────

export async function resolveAiConfig(supabase: any): Promise<{ apiKey: string; apiUrl: string; model: string }> {
  let apiKey = '';
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
    throw new Error('No AI provider configured. Set OPENAI_API_KEY, GEMINI_API_KEY, or LOVABLE_API_KEY.');
  }

  return { apiKey, apiUrl, model };
}

// ─── Soul & Identity ──────────────────────────────────────────────────────────

export async function loadSoulIdentity(supabase: any): Promise<{ soul: any; identity: any }> {
  const { data } = await supabase
    .from('agent_memory')
    .select('key, value')
    .in('key', ['soul', 'identity']);

  const soul = data?.find((m: any) => m.key === 'soul')?.value || {};
  const identity = data?.find((m: any) => m.key === 'identity')?.value || {};
  return { soul, identity };
}

export function buildSoulPrompt(soul: any, identity: any): string {
  let prompt = '';
  if (identity.name || identity.role) {
    prompt += `\n\nIDENTITY:\nName: ${identity.name || 'FlowPilot'}\nRole: ${identity.role || 'CMS operator'}`;
    if (identity.capabilities?.length) prompt += `\nCapabilities: ${identity.capabilities.join(', ')}`;
    if (identity.boundaries?.length) prompt += `\nBoundaries: ${identity.boundaries.join('; ')}`;
  }
  if (soul.purpose) prompt += `\n\nSOUL:\nPurpose: ${soul.purpose}`;
  if (soul.values?.length) prompt += `\nValues: ${soul.values.join('; ')}`;
  if (soul.tone) prompt += `\nTone: ${soul.tone}`;
  if (soul.philosophy) prompt += `\nPhilosophy: ${soul.philosophy}`;
  return prompt;
}

// ─── Memory ───────────────────────────────────────────────────────────────────

export async function loadMemories(supabase: any): Promise<string> {
  const { data } = await supabase
    .from('agent_memory')
    .select('key, value, category')
    .not('key', 'in', '("soul","identity")')
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

// ─── Objectives ───────────────────────────────────────────────────────────────

export async function loadObjectives(supabase: any): Promise<string> {
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

// ─── Skill CRUD (Self-Modification) ──────────────────────────────────────────

async function handleSkillCreate(supabase: any, args: any) {
  const { data: existing } = await supabase
    .from('agent_skills').select('id').eq('name', args.name).maybeSingle();
  if (existing) return { status: 'error', error: `Skill "${args.name}" already exists` };

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

async function handleSkillUpdate(supabase: any, args: { skill_name: string; updates: Record<string, any> }) {
  const safeFields = ['description', 'handler', 'category', 'scope', 'requires_approval', 'enabled', 'tool_definition', 'instructions'];
  const filtered: Record<string, any> = {};
  for (const [k, v] of Object.entries(args.updates)) {
    if (safeFields.includes(k)) filtered[k] = v;
  }
  if (Object.keys(filtered).length === 0) return { status: 'error', error: 'No valid fields to update' };
  filtered.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('agent_skills').update(filtered).eq('name', args.skill_name).select('id, name, enabled').single();
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
    .from('agent_skills').update({ enabled: false, updated_at: new Date().toISOString() }).eq('name', args.skill_name).select('id, name').single();
  if (error) return { status: 'error', error: error.message };
  return { status: 'disabled', skill: data };
}

async function handleSkillInstruct(supabase: any, args: { skill_name: string; instructions: string }) {
  const { data, error } = await supabase
    .from('agent_skills').update({ instructions: args.instructions, updated_at: new Date().toISOString() }).eq('name', args.skill_name).select('id, name, instructions').single();
  if (error) return { status: 'error', error: error.message };
  return { status: 'updated', skill: data };
}

// ─── Soul Update ──────────────────────────────────────────────────────────────

async function handleSoulUpdate(supabase: any, args: { field: string; value: any }) {
  const { data: existing } = await supabase
    .from('agent_memory').select('id, value').eq('key', 'soul').maybeSingle();

  const currentSoul = existing?.value || {};
  const updatedSoul = { ...currentSoul, [args.field]: args.value };

  if (existing) {
    await supabase.from('agent_memory')
      .update({ value: updatedSoul, updated_at: new Date().toISOString() }).eq('id', existing.id);
  } else {
    await supabase.from('agent_memory')
      .insert({ key: 'soul', value: updatedSoul, category: 'preference', created_by: 'flowpilot' });
  }
  return { status: 'updated', field: args.field, soul: updatedSoul };
}

// ─── Automation CRUD ──────────────────────────────────────────────────────────

async function handleAutomationCreate(supabase: any, args: any) {
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

// ─── Reflection ───────────────────────────────────────────────────────────────

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

  const { data: allSkills } = await supabase.from('agent_skills').select('name, category, handler, enabled').order('category');
  const { data: automations } = await supabase.from('agent_automations').select('name, trigger_type, skill_name, enabled, run_count');
  const { data: objectives } = await supabase.from('agent_objectives').select('goal, status, progress');

  // Generate suggestions
  const suggestions: string[] = [];
  for (const [name, s] of Object.entries(skillStats)) {
    if (s.errors > 2) suggestions.push(`Skill "${name}" has ${s.errors} failures — consider debugging.`);
  }
  const automatedSkills = new Set((automations || []).map((a: any) => a.skill_name));
  for (const [name, s] of Object.entries(skillStats)) {
    if (s.count >= 5 && !automatedSkills.has(name)) suggestions.push(`"${name}" used ${s.count} times — consider automating.`);
  }
  const usedSkills = new Set(Object.keys(skillStats));
  const unusedSkills = (allSkills || []).filter((s: any) => s.enabled && !usedSkills.has(s.name));
  if (unusedSkills.length > 3) suggestions.push(`${unusedSkills.length} skills never used. Consider disabling or promoting them.`);
  if (suggestions.length === 0) suggestions.push('System running well. No improvements suggested.');

  // Auto-persist learnings
  const learnings: string[] = [];
  for (const [name, s] of Object.entries(skillStats)) {
    if (s.errors > 2 && s.last_error) learnings.push(`Skill "${name}" fails frequently: ${s.last_error}`);
  }
  if (learnings.length > 0) {
    await supabase.from('agent_memory').upsert({
      key: `lesson:reflect_${new Date().toISOString().slice(0, 10)}`,
      value: { learnings, suggestions, generated_at: new Date().toISOString() },
      category: 'fact',
      created_by: 'flowpilot',
    }, { onConflict: 'key' });
  }

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
    suggestions,
    auto_persisted_learnings: learnings.length,
  };
}

// ─── Skill Instructions Loader ────────────────────────────────────────────────

export async function loadSkillInstructions(supabase: any): Promise<string> {
  const { data } = await supabase
    .from('agent_skills')
    .select('name, instructions')
    .eq('enabled', true)
    .not('instructions', 'is', null);

  if (!data || data.length === 0) return '';
  const lines = data.map((s: any) => `### ${s.name}\n${s.instructions}`);
  return `\n\nSKILL KNOWLEDGE (instructions you've written for your skills):\n${lines.join('\n\n')}`;
}

// ─── Built-in Tool Definitions ────────────────────────────────────────────────

const MEMORY_TOOLS = [
  { type: 'function', function: { name: 'memory_write', description: 'Save something to your persistent memory.', parameters: { type: 'object', properties: { key: { type: 'string', description: 'Short identifier' }, value: { description: 'The information to remember' }, category: { type: 'string', enum: ['preference', 'context', 'fact'] } }, required: ['key', 'value'] } } },
  { type: 'function', function: { name: 'memory_read', description: 'Search your persistent memory.', parameters: { type: 'object', properties: { key: { type: 'string', description: 'Search term' }, category: { type: 'string', enum: ['preference', 'context', 'fact'] } } } } },
];

const OBJECTIVE_TOOLS = [
  { type: 'function', function: { name: 'objective_update_progress', description: 'Update progress on an active objective.', parameters: { type: 'object', properties: { objective_id: { type: 'string' }, progress: { type: 'object', description: 'Updated progress object' } }, required: ['objective_id', 'progress'] } } },
  { type: 'function', function: { name: 'objective_complete', description: 'Mark an objective as completed.', parameters: { type: 'object', properties: { objective_id: { type: 'string' } }, required: ['objective_id'] } } },
];

const SELF_MOD_TOOLS = [
  { type: 'function', function: { name: 'skill_create', description: 'Create a new skill in your registry.', parameters: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, handler: { type: 'string' }, category: { type: 'string', enum: ['content', 'crm', 'communication', 'automation', 'search', 'analytics'] }, scope: { type: 'string', enum: ['internal', 'external', 'both'] }, requires_approval: { type: 'boolean' }, tool_definition: { type: 'object' } }, required: ['name', 'description', 'handler', 'tool_definition'] } } },
  { type: 'function', function: { name: 'skill_update', description: 'Update an existing skill.', parameters: { type: 'object', properties: { skill_name: { type: 'string' }, updates: { type: 'object' } }, required: ['skill_name', 'updates'] } } },
  { type: 'function', function: { name: 'skill_list', description: 'List all registered skills.', parameters: { type: 'object', properties: { category: { type: 'string' }, scope: { type: 'string' }, include_disabled: { type: 'boolean' } } } } },
  { type: 'function', function: { name: 'skill_disable', description: 'Disable a skill.', parameters: { type: 'object', properties: { skill_name: { type: 'string' } }, required: ['skill_name'] } } },
  { type: 'function', function: { name: 'skill_instruct', description: 'Add rich instructions/knowledge to a skill.', parameters: { type: 'object', properties: { skill_name: { type: 'string' }, instructions: { type: 'string' } }, required: ['skill_name', 'instructions'] } } },
  { type: 'function', function: { name: 'automation_create', description: 'Create a new automation. Disabled by default for safety.', parameters: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, trigger_type: { type: 'string', enum: ['cron', 'event', 'signal'] }, trigger_config: { type: 'object' }, skill_name: { type: 'string' }, skill_arguments: { type: 'object' }, enabled: { type: 'boolean' } }, required: ['name', 'trigger_type', 'trigger_config', 'skill_name'] } } },
  { type: 'function', function: { name: 'automation_list', description: 'List all automations.', parameters: { type: 'object', properties: { enabled_only: { type: 'boolean' } } } } },
];

const REFLECT_TOOL = [
  { type: 'function', function: { name: 'reflect', description: 'Analyze your performance over the past week. Auto-persists learnings.', parameters: { type: 'object', properties: { focus: { type: 'string', description: 'Focus area: errors, usage, automations, objectives' } } } } },
];

const SOUL_TOOL = [
  { type: 'function', function: { name: 'soul_update', description: 'Update your personality, values, tone, or philosophy.', parameters: { type: 'object', properties: { field: { type: 'string', enum: ['purpose', 'values', 'tone', 'philosophy'] }, value: { description: 'New value' } }, required: ['field', 'value'] } } },
];

export function getBuiltInTools(groups: Array<'memory' | 'objectives' | 'self-mod' | 'reflect' | 'soul'>): any[] {
  const tools: any[] = [];
  if (groups.includes('memory')) tools.push(...MEMORY_TOOLS);
  if (groups.includes('objectives')) tools.push(...OBJECTIVE_TOOLS);
  if (groups.includes('self-mod')) tools.push(...SELF_MOD_TOOLS);
  if (groups.includes('reflect')) tools.push(...REFLECT_TOOL);
  if (groups.includes('soul')) tools.push(...SOUL_TOOL);
  return tools;
}

// ─── Tool Execution Router ───────────────────────────────────────────────────

export async function executeBuiltInTool(
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
    case 'skill_instruct': return handleSkillInstruct(supabase, fnArgs);
    case 'soul_update': return handleSoulUpdate(supabase, fnArgs);
    case 'automation_create': return handleAutomationCreate(supabase, fnArgs);
    case 'automation_list': return handleAutomationList(supabase, fnArgs);
    case 'reflect': return handleReflect(supabase, fnArgs);
  }

  // Not a built-in → delegate to agent-execute
  const response = await fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
    body: JSON.stringify({ skill_name: fnName, arguments: fnArgs, agent_type: 'flowpilot' }),
  });
  return response.json();
}

export function isBuiltInTool(name: string): boolean {
  return BUILT_IN_TOOL_NAMES.has(name);
}

// ─── Load Skills from Registry ────────────────────────────────────────────────

export async function loadSkillTools(supabase: any, scope: 'internal' | 'external'): Promise<any[]> {
  const scopes = scope === 'internal' ? ['internal', 'both'] : ['external', 'both'];
  const { data: skills } = await supabase
    .from('agent_skills')
    .select('name, tool_definition, scope')
    .eq('enabled', true)
    .in('scope', scopes);

  return (skills || [])
    .filter((s: any) => s.tool_definition?.function)
    .map((s: any) => s.tool_definition);
}

// ─── Non-Streaming Reason Loop ────────────────────────────────────────────────

export async function reason(
  supabase: any,
  messages: any[],
  config: ReasonConfig,
): Promise<ReasonResult> {
  const startTime = Date.now();
  const maxIterations = config.maxIterations || 6;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Resolve AI
  const { apiKey, apiUrl, model } = await resolveAiConfig(supabase);

  // Build tools
  const builtInTools = getBuiltInTools(config.builtInToolGroups || ['memory', 'objectives', 'reflect']);
  const skillTools = await loadSkillTools(supabase, config.scope);
  const allTools = [...builtInTools, ...(config.additionalTools || []), ...skillTools];

  // Run the loop
  let conversationMessages = [...messages];
  const actionsExecuted: string[] = [];
  const skillResults: ReasonResult['skillResults'] = [];
  let finalResponse = '';

  for (let i = 0; i < maxIterations; i++) {
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
      console.error('[agent-reason] AI error:', aiResponse.status, errText);
      throw new Error(`AI provider error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const choice = aiData.choices?.[0];
    if (!choice) throw new Error('No AI response');

    const msg = choice.message;

    // No tool calls → done
    if (!msg.tool_calls?.length) {
      finalResponse = msg.content || 'Done.';
      break;
    }

    // Execute tool calls
    conversationMessages.push(msg);

    for (const tc of msg.tool_calls) {
      const fnName = tc.function.name;
      let fnArgs: any;
      try { fnArgs = JSON.parse(tc.function.arguments || '{}'); } catch { fnArgs = {}; }

      console.log(`[agent-reason] Executing: ${fnName}`, JSON.stringify(fnArgs).slice(0, 200));
      actionsExecuted.push(fnName);

      let result: any;
      try {
        result = await executeBuiltInTool(supabase, supabaseUrl, serviceKey, fnName, fnArgs);
      } catch (err: any) {
        result = { error: err.message };
      }

      if (!isBuiltInTool(fnName)) {
        skillResults.push({ skill: fnName, status: result?.status || 'success', result: result?.result || result });
      }

      conversationMessages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
    }
  }

  return {
    response: finalResponse,
    actionsExecuted,
    skillResults,
    durationMs: Date.now() - startTime,
  };
}
