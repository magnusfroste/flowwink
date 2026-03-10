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
 * soul/identity, reflection, self-modification, plan decomposition,
 * self-healing, and agent-execute delegation.
 *
 * NOT a serve() handler — this is an importable module.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReasonConfig {
  scope: 'internal' | 'external';
  maxIterations?: number;
  systemPromptOverride?: string;
  extraContext?: string;
  builtInToolGroups?: Array<'memory' | 'objectives' | 'self-mod' | 'reflect' | 'soul' | 'planning' | 'automations-exec'>;
  additionalTools?: any[];
}

export interface ReasonResult {
  response: string;
  actionsExecuted: string[];
  skillResults: Array<{ skill: string; status: string; result: any }>;
  durationMs: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SELF_HEAL_THRESHOLD = 3;
const MAX_CHAIN_DEPTH = 4;

const BUILT_IN_TOOL_NAMES = new Set([
  'memory_write', 'memory_read',
  'objective_update_progress', 'objective_complete',
  'skill_create', 'skill_update', 'skill_list', 'skill_disable',
  'skill_instruct',
  'soul_update',
  'automation_create', 'automation_list',
  'reflect',
  'decompose_objective', 'advance_plan', 'propose_objective', 'execute_automation',
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
    .select('id, goal, status, constraints, success_criteria, progress, created_at, updated_at')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(10);

  if (!data || data.length === 0) return '\nNo active objectives.';

  // Priority scoring (ported from ClawCMS)
  const scored = data.map((o: any) => {
    let score = 0;
    const plan = o.progress?.plan;
    const constraints = o.constraints || {};
    const now = Date.now();

    // Urgency: deadline proximity
    if (constraints.deadline) {
      const daysLeft = (new Date(constraints.deadline).getTime() - now) / 86_400_000;
      if (daysLeft < 0) score += 50;
      else if (daysLeft < 1) score += 40;
      else if (daysLeft < 3) score += 25;
      else if (daysLeft < 7) score += 10;
    }

    // Priority field
    if (constraints.priority === 'critical') score += 35;
    else if (constraints.priority === 'high') score += 20;
    else if (constraints.priority === 'medium') score += 10;

    // Momentum: in-progress plan
    if (plan?.steps?.length) {
      const done = plan.steps.filter((s: any) => s.status === 'done').length;
      const pct = done / plan.steps.length;
      if (pct > 0 && pct < 1) score += 15;
      if (pct >= 0.7) score += 10;
    } else {
      score += 5; // needs plan
    }

    // Staleness
    const daysSinceUpdate = (now - new Date(o.updated_at).getTime()) / 86_400_000;
    if (daysSinceUpdate > 3) score += 8;
    if (daysSinceUpdate > 7) score += 12;

    if (plan?.has_failures) score += 10;

    return { ...o, _priority_score: score };
  });

  scored.sort((a: any, b: any) => b._priority_score - a._priority_score);

  return '\n\nActive objectives (sorted by priority ⬆️):\n' + scored.map((o: any, i: number) => {
    const plan = o.progress?.plan;
    const planInfo = plan
      ? ` | plan: ${plan.steps?.filter((s: any) => s.status === 'done').length}/${plan.total_steps} steps done`
      : ' | NO PLAN (needs decompose_objective)';
    const deadline = o.constraints?.deadline ? ` | ⏰ deadline: ${o.constraints.deadline}` : '';
    const priority = o.constraints?.priority ? ` | priority: ${o.constraints.priority}` : '';
    return `- #${i + 1} [score:${o._priority_score}] [${o.id.slice(0, 8)}] "${o.goal}"${planInfo}${deadline}${priority} | progress: ${JSON.stringify(o.progress)} | criteria: ${JSON.stringify(o.success_criteria)}`;
  }).join('\n');
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

// ─── Plan Decomposition (ported from ClawCMS) ─────────────────────────────────

async function decomposeObjectiveIntoPlan(
  objective: { id: string; goal: string; constraints: any; success_criteria: any },
  supabase: any,
): Promise<{ steps: any[]; total_steps: number }> {
  const { data: skills } = await supabase.from('agent_skills')
    .select('name, description, category, handler')
    .eq('enabled', true);

  const skillList = (skills || []).map((s: any) => `- ${s.name}: ${s.description} (${s.handler})`).join('\n');

  const { apiKey, apiUrl, model } = await resolveAiConfig(supabase);
  const aiResp = await fetch(apiUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: `You are a planning agent. Decompose an objective into 3-7 concrete, sequential steps. Each step should map to an available skill when possible.

Available skills:
${skillList}

Return ONLY a JSON array, no markdown. Each step:
{"id":"s1","order":1,"description":"What to do","skill_name":"skill_name_or_null","skill_args":{},"status":"pending"}

Rules:
- Steps should be ordered logically (research before drafting, drafting before publishing)
- Use actual skill names from the list above when applicable
- Set skill_args with sensible defaults based on the objective
- If no skill matches, set skill_name to null (manual step)
- Keep descriptions short and actionable`,
        },
        {
          role: 'user',
          content: `Objective: "${objective.goal}"
Constraints: ${JSON.stringify(objective.constraints || {})}
Success criteria: ${JSON.stringify(objective.success_criteria || {})}`,
        },
      ],
    }),
  });

  const data = await aiResp.json();
  const raw = data.choices?.[0]?.message?.content || '[]';
  const cleaned = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  let steps: any[];
  try {
    steps = JSON.parse(cleaned);
    if (!Array.isArray(steps)) steps = [];
  } catch {
    steps = [{ id: 's1', order: 1, description: objective.goal, skill_name: null, skill_args: {}, status: 'pending' }];
  }

  steps = steps.map((s: any, i: number) => ({
    id: s.id || `s${i + 1}`,
    order: s.order || i + 1,
    description: s.description || `Step ${i + 1}`,
    skill_name: s.skill_name || null,
    skill_args: s.skill_args || {},
    status: 'pending',
  }));

  return { steps, total_steps: steps.length };
}

async function handleDecomposeObjective(supabase: any, args: { objective_id: string }) {
  const { data: obj, error } = await supabase.from('agent_objectives')
    .select('id, goal, constraints, success_criteria, progress')
    .eq('id', args.objective_id).single();
  if (error || !obj) return { status: 'error', error: error?.message || 'Objective not found' };

  const plan = await decomposeObjectiveIntoPlan(obj, supabase);
  const progress = (obj.progress as Record<string, any>) || {};
  progress.plan = { ...plan, current_step: 0, created_at: new Date().toISOString() };

  await supabase.from('agent_objectives').update({ progress }).eq('id', args.objective_id);
  return { status: 'planned', objective_id: args.objective_id, steps: plan.steps.length, plan: plan.steps };
}

async function handleAdvancePlan(supabase: any, supabaseUrl: string, serviceKey: string, args: { objective_id: string; chain?: boolean }) {
  const { objective_id, chain = true } = args;
  const maxSteps = chain ? MAX_CHAIN_DEPTH : 1;
  const chainResults: any[] = [];

  for (let depth = 0; depth < maxSteps; depth++) {
    const { data: obj, error } = await supabase.from('agent_objectives')
      .select('id, goal, progress')
      .eq('id', objective_id).single();
    if (error || !obj) return { status: 'error', error: error?.message || 'Objective not found' };

    const progress = (obj.progress as Record<string, any>) || {};
    const plan = progress.plan;
    if (!plan?.steps?.length) return { status: 'no_plan', message: 'No plan found. Use decompose_objective first.', chain_results: chainResults };

    const nextStep = plan.steps.find((s: any) => s.status === 'pending');
    if (!nextStep) {
      if (!plan.completed) {
        plan.completed = true;
        progress.plan = plan;
        progress.last_updated = new Date().toISOString();
        await supabase.from('agent_objectives').update({ progress }).eq('id', objective_id);
      }
      return { status: 'all_done', message: 'All plan steps completed.', chain_results: chainResults };
    }

    nextStep.status = 'running';
    plan.current_step = nextStep.order;
    await supabase.from('agent_objectives').update({ progress }).eq('id', objective_id);

    let result: any = { status: 'manual', message: 'No skill mapped — requires manual action.' };
    if (nextStep.skill_name) {
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
          body: JSON.stringify({
            skill_name: nextStep.skill_name,
            arguments: nextStep.skill_args || {},
            agent_type: 'flowpilot',
          }),
        });
        result = await resp.json();
      } catch (err: any) {
        result = { error: err.message };
      }
    }

    const success = !result.error && result.status !== 'failed';
    nextStep.status = success ? 'done' : 'failed';
    nextStep.result = result;
    nextStep.completed_at = new Date().toISOString();

    const allDone = plan.steps.every((s: any) => s.status === 'done');
    const anyFailed = plan.steps.some((s: any) => s.status === 'failed');
    plan.completed = allDone;
    plan.has_failures = anyFailed;

    progress.plan = plan;
    progress.total_runs = (progress.total_runs || 0) + 1;
    progress.last_updated = new Date().toISOString();
    await supabase.from('agent_objectives').update({ progress }).eq('id', objective_id);

    const remaining = plan.steps.filter((s: any) => s.status === 'pending').length;
    chainResults.push({
      step: nextStep.description,
      skill: nextStep.skill_name,
      status: success ? 'done' : 'failed',
      remaining_steps: remaining,
    });

    if (!success || !nextStep.skill_name || allDone) break;
  }

  const lastResult = chainResults[chainResults.length - 1];
  return {
    status: chainResults.some(r => r.status === 'failed') ? 'chain_partial' : 'chain_completed',
    steps_executed: chainResults.length,
    remaining_steps: lastResult?.remaining_steps ?? 0,
    plan_completed: chainResults.length > 0 && lastResult?.remaining_steps === 0,
    chain_results: chainResults,
  };
}

async function handleProposeObjective(supabase: any, args: { goal: string; reason: string; constraints?: any; success_criteria?: any }) {
  const { goal, reason, constraints, success_criteria } = args;

  // Duplicate check
  const { data: existing } = await supabase.from('agent_objectives')
    .select('id, goal').eq('status', 'active');
  const isDuplicate = (existing || []).some((o: any) =>
    o.goal.toLowerCase().includes(goal.toLowerCase().slice(0, 20)) ||
    goal.toLowerCase().includes(o.goal.toLowerCase().slice(0, 20))
  );
  if (isDuplicate) {
    return { status: 'skipped', reason: 'Similar objective already active' };
  }

  const { data: newObj, error } = await supabase.from('agent_objectives')
    .insert({
      goal,
      constraints: constraints || {},
      success_criteria: success_criteria || {},
      progress: { proposed_by: 'flowpilot', reason: reason || 'proactive', proposed_at: new Date().toISOString() },
      status: 'active',
    })
    .select('id').single();
  if (error) return { status: 'error', error: error.message };

  await supabase.from('agent_activity').insert({
    agent: 'flowpilot', skill_name: 'propose_objective',
    input: { goal, reason },
    output: { objective_id: newObj.id },
    status: 'success',
  });

  return { status: 'proposed', objective_id: newObj.id, goal };
}

// ─── Cron helpers ─────────────────────────────────────────────────────────────

function calculateNextRun(cronExpr: string): string | null {
  try {
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length < 5) return null;
    const now = new Date();
    const [min, hour, dayOfMonth] = parts;

    if (min === '*' && hour === '*') return new Date(now.getTime() + 60_000).toISOString();
    if (min.startsWith('*/')) return new Date(now.getTime() + parseInt(min.slice(2), 10) * 60_000).toISOString();
    if (hour.startsWith('*/')) return new Date(now.getTime() + parseInt(hour.slice(2), 10) * 3600_000).toISOString();
    if (hour !== '*' && min !== '*') {
      const next = new Date(now);
      next.setHours(parseInt(hour, 10), parseInt(min, 10), 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      if (dayOfMonth !== '*') {
        next.setDate(parseInt(dayOfMonth, 10));
        if (next <= now) next.setMonth(next.getMonth() + 1);
      }
      return next.toISOString();
    }
    return new Date(now.getTime() + 12 * 3600_000).toISOString();
  } catch {
    return new Date(Date.now() + 12 * 3600_000).toISOString();
  }
}

async function handleExecuteAutomation(supabase: any, supabaseUrl: string, serviceKey: string, args: { automation_id: string }) {
  const { data: auto, error: fetchErr } = await supabase.from('agent_automations')
    .select('*').eq('id', args.automation_id).maybeSingle();
  if (fetchErr || !auto) return { status: 'error', error: fetchErr?.message || 'Automation not found' };

  // Check if linked skill requires approval
  if (auto.skill_name) {
    const { data: skill } = await supabase.from('agent_skills')
      .select('requires_approval').eq('name', auto.skill_name).maybeSingle();
    if (skill?.requires_approval) {
      await supabase.from('agent_activity').insert({
        agent: 'flowpilot', skill_name: auto.skill_name,
        input: { automation_id: args.automation_id, arguments: auto.skill_arguments },
        output: { reason: 'Skill requires admin approval before execution' },
        status: 'pending_approval',
      });
      return { status: 'pending_approval', skill: auto.skill_name };
    }
  }

  let skillResult: any;
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
      body: JSON.stringify({
        skill_name: auto.skill_name,
        arguments: auto.skill_arguments || {},
        agent_type: 'flowpilot',
      }),
    });
    skillResult = await resp.json();
  } catch (err: any) {
    skillResult = { error: err.message };
  }

  let nextRun: string | null = null;
  if (auto.trigger_type === 'cron' && auto.trigger_config?.cron) {
    nextRun = calculateNextRun(auto.trigger_config.cron);
  }

  const updatePayload: Record<string, any> = {
    last_triggered_at: new Date().toISOString(),
    run_count: (auto.run_count || 0) + 1,
    last_error: skillResult.error || null,
  };
  if (nextRun) updatePayload.next_run_at = nextRun;
  await supabase.from('agent_automations').update(updatePayload).eq('id', args.automation_id);

  return {
    status: skillResult.error ? 'failed' : 'success',
    automation: auto.name,
    skill: auto.skill_name,
    next_run_at: nextRun,
    result: skillResult,
  };
}

// ─── Self-Healing (ported from ClawCMS) ───────────────────────────────────────

export async function runSelfHealing(supabase: any): Promise<string> {
  const since = new Date();
  since.setDate(since.getDate() - 3);
  const { data: recentActivity } = await supabase
    .from('agent_activity')
    .select('skill_name, status, created_at')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false }).limit(200);

  if (!recentActivity?.length) return '';

  const skillStreaks: Record<string, number> = {};
  const checked = new Set<string>();

  for (const a of recentActivity) {
    const name = a.skill_name;
    if (!name || checked.has(name)) continue;
    if (a.status === 'failed') {
      skillStreaks[name] = (skillStreaks[name] || 0) + 1;
    } else {
      checked.add(name);
    }
  }

  const toDisable = Object.entries(skillStreaks)
    .filter(([, count]) => count >= SELF_HEAL_THRESHOLD)
    .map(([name]) => name);

  if (!toDisable.length) return '';

  for (const skillName of toDisable) {
    await supabase.from('agent_skills')
      .update({ enabled: false })
      .eq('name', skillName);
    console.log(`[self-heal] Auto-disabled skill: ${skillName} (${skillStreaks[skillName]} consecutive failures)`);
  }

  for (const skillName of toDisable) {
    await supabase.from('agent_automations')
      .update({ enabled: false, last_error: `Auto-disabled: ${SELF_HEAL_THRESHOLD}+ consecutive failures` })
      .eq('skill_name', skillName)
      .eq('enabled', true);
  }

  return `\n\n⚠️ Self-healing: Auto-disabled ${toDisable.length} skills due to repeated failures: ${toDisable.join(', ')}`;
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
  let q = supabase.from('agent_automations').select('id, name, description, trigger_type, trigger_config, skill_name, enabled, run_count, last_triggered_at, next_run_at, last_error');
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

const PLANNING_TOOLS = [
  { type: 'function', function: { name: 'decompose_objective', description: 'Break an objective into 3-7 ordered steps using AI planning. Each step maps to an available skill. Use this when an objective has no plan yet.', parameters: { type: 'object', properties: { objective_id: { type: 'string', description: 'The objective UUID to decompose' } }, required: ['objective_id'] } } },
  { type: 'function', function: { name: 'advance_plan', description: "Execute the next pending step(s) in an objective's plan with automatic chaining. By default (chain=true), up to 4 consecutive steps are executed in one call. This is the PRIMARY tool for plan execution.", parameters: { type: 'object', properties: { objective_id: { type: 'string', description: 'The objective UUID whose plan to advance' }, chain: { type: 'boolean', description: 'Auto-chain consecutive steps (default: true)' } }, required: ['objective_id'] } } },
  { type: 'function', function: { name: 'propose_objective', description: 'Proactively create a new objective based on signal patterns, site stats, or strategic gaps. Only propose when there is a clear need not covered by existing objectives.', parameters: { type: 'object', properties: { goal: { type: 'string', description: 'The objective goal' }, reason: { type: 'string', description: 'Why this objective is being proposed' }, constraints: { type: 'object', description: 'Optional constraints (priority, deadline)' }, success_criteria: { type: 'object', description: 'How to measure success' } }, required: ['goal', 'reason'] } } },
];

const AUTOMATION_EXEC_TOOLS = [
  { type: 'function', function: { name: 'execute_automation', description: 'Execute an enabled automation by ID. Runs its linked skill with preconfigured arguments and updates run metadata. Prioritize objective-linked and DUE automations.', parameters: { type: 'object', properties: { automation_id: { type: 'string', description: 'The automation UUID to execute' } }, required: ['automation_id'] } } },
];

export function getBuiltInTools(groups: Array<'memory' | 'objectives' | 'self-mod' | 'reflect' | 'soul' | 'planning' | 'automations-exec'>): any[] {
  const tools: any[] = [];
  if (groups.includes('memory')) tools.push(...MEMORY_TOOLS);
  if (groups.includes('objectives')) tools.push(...OBJECTIVE_TOOLS);
  if (groups.includes('self-mod')) tools.push(...SELF_MOD_TOOLS);
  if (groups.includes('reflect')) tools.push(...REFLECT_TOOL);
  if (groups.includes('soul')) tools.push(...SOUL_TOOL);
  if (groups.includes('planning')) tools.push(...PLANNING_TOOLS);
  if (groups.includes('automations-exec')) tools.push(...AUTOMATION_EXEC_TOOLS);
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
    case 'decompose_objective': return handleDecomposeObjective(supabase, fnArgs);
    case 'advance_plan': return handleAdvancePlan(supabase, supabaseUrl, serviceKey, fnArgs);
    case 'propose_objective': return handleProposeObjective(supabase, fnArgs);
    case 'execute_automation': return handleExecuteAutomation(supabase, supabaseUrl, serviceKey, fnArgs);
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

  const { apiKey, apiUrl, model } = await resolveAiConfig(supabase);

  const builtInTools = getBuiltInTools(config.builtInToolGroups || ['memory', 'objectives', 'reflect']);
  const skillTools = await loadSkillTools(supabase, config.scope);
  const allTools = [...builtInTools, ...(config.additionalTools || []), ...skillTools];

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

    if (!msg.tool_calls?.length) {
      finalResponse = msg.content || 'Done.';
      break;
    }

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
