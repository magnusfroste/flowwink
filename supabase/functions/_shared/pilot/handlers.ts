/**
 * Pilot — Built-in Tool Handlers
 * 
 * All handler functions for built-in tools (memory, objectives, skills,
 * automations, workflows, A2A, reflection, etc.)
 * 
 * Domain-agnostic: no CMS-specific logic here.
 */

import { resolveAiConfig } from '../ai-config.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

const SELF_HEAL_THRESHOLD = 3;
const MAX_CHAIN_DEPTH = 4;
const MAX_SESSION_MESSAGES = 10;

const SPECIALIST_PROMPTS: Record<string, string> = {
  seo: 'You are an SEO specialist. Focus on: keyword analysis, meta optimization, content structure, link building, page speed, Core Web Vitals. Provide specific, actionable recommendations with priority order.',
  content: 'You are a content strategy specialist. Focus on: audience alignment, content quality, editorial calendar, SEO integration, distribution channels. Write compelling, engaging content that drives results.',
  sales: 'You are a sales intelligence specialist. Focus on: lead qualification, pipeline analysis, deal strategy, ICP fit, outreach personalization. Prioritize revenue impact and provide concrete next actions.',
  analytics: 'You are a data analytics specialist. Focus on: trend identification, anomaly detection, conversion funnels, cohort analysis, actionable insights. Back every conclusion with data and suggest experiments.',
  email: 'You are an email marketing specialist. Focus on: subject lines, personalization, segmentation, deliverability, A/B testing, lifecycle campaigns. Optimize for open rates, click rates, and conversions.',
};

// ─── Vector Memory (Embedding Generation) ─────────────────────────────────────

export async function generateEmbedding(_supabase: any, text: string): Promise<number[] | null> {
  try {
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (openaiKey) {
      const resp = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 8000), dimensions: 768 }),
      });
      if (resp.ok) {
        const data = await resp.json();
        return data.data?.[0]?.embedding || null;
      }
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (geminiKey) {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'models/text-embedding-004', content: { parts: [{ text: text.slice(0, 8000) }] }, outputDimensionality: 768 }),
        }
      );
      if (resp.ok) {
        const data = await resp.json();
        return data.embedding?.values || null;
      }
    }

    console.warn('[vector-memory] No embedding provider available');
    return null;
  } catch (err) {
    console.error('[vector-memory] Embedding generation failed:', err);
    return null;
  }
}

// ─── Memory Handlers ──────────────────────────────────────────────────────────

export async function handleMemoryWrite(supabase: any, args: { key: string; value: any; category?: string }) {
  const { key, value, category = 'context' } = args;
  const { data: existing } = await supabase
    .from('agent_memory').select('id').eq('key', key).maybeSingle();

  const memValue = typeof value === 'object' ? value : { text: value };
  const embedding = await generateEmbedding(supabase, `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);

  const record: any = { value: memValue, category, updated_at: new Date().toISOString() };
  if (embedding) record.embedding = embedding;

  if (existing) {
    await supabase.from('agent_memory').update(record).eq('id', existing.id);
  } else {
    await supabase.from('agent_memory').insert({ key, ...record, created_by: 'flowpilot' });
  }
  return { status: 'saved', key, has_embedding: !!embedding };
}

export async function handleMemoryRead(supabase: any, args: { key?: string; category?: string; semantic_query?: string }) {
  const searchText = args.semantic_query || args.key || '';
  
  if (searchText) {
    const embedding = await generateEmbedding(supabase, searchText);

    const { data: hybridResults, error } = await supabase.rpc('search_memories_hybrid', {
      query_text: searchText,
      query_embedding: embedding || null,
      match_threshold: 0.25,
      match_count: 10,
      filter_category: args.category || null,
    });

    if (!error && hybridResults?.length) {
      return {
        memories: hybridResults.map((r: any) => ({
          key: r.key, value: r.value, category: r.category, 
          similarity: r.similarity, search_type: r.search_type,
        })),
        search_type: 'hybrid',
      };
    }

    if (embedding) {
      const { data: semanticResults } = await supabase.rpc('search_memories_semantic', {
        query_embedding: embedding,
        match_threshold: 0.5,
        match_count: 10,
        filter_category: args.category || null,
      });

      if (semanticResults?.length) {
        return {
          memories: semanticResults.map((r: any) => ({
            key: r.key, value: r.value, category: r.category, similarity: r.similarity,
          })),
          search_type: 'semantic',
        };
      }
    }
  }

  let q = supabase.from('agent_memory').select('key, value, category, updated_at');
  if (args.key) q = q.ilike('key', `%${args.key}%`);
  if (args.category) q = q.eq('category', args.category);
  const { data } = await q.order('updated_at', { ascending: false }).limit(10);
  return { memories: data || [], search_type: 'keyword' };
}

export async function handleMemoryDelete(supabase: any, args: { key: string }) {
  const { error } = await supabase.from('agent_memory').delete().eq('key', args.key);
  if (error) return { status: 'error', error: error.message };
  return { status: 'deleted', key: args.key };
}

// ─── Objective Handlers ───────────────────────────────────────────────────────

export async function handleObjectiveUpdateProgress(supabase: any, args: { objective_id: string; progress: any }) {
  const { error } = await supabase
    .from('agent_objectives').update({ progress: args.progress }).eq('id', args.objective_id);
  if (error) return { status: 'error', error: error.message };
  return { status: 'updated', objective_id: args.objective_id };
}

export async function handleObjectiveComplete(supabase: any, args: { objective_id: string }) {
  const { error } = await supabase
    .from('agent_objectives')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', args.objective_id);
  if (error) return { status: 'error', error: error.message };
  return { status: 'completed', objective_id: args.objective_id };
}

export async function handleObjectiveDelete(supabase: any, args: { objective_id: string }) {
  await supabase.from('agent_objective_activities').delete().eq('objective_id', args.objective_id);
  const { error } = await supabase.from('agent_objectives').delete().eq('id', args.objective_id);
  if (error) return { status: 'error', error: error.message };
  return { status: 'deleted', objective_id: args.objective_id };
}

// ─── Plan Decomposition ───────────────────────────────────────────────────────

async function decomposeObjectiveIntoPlan(
  objective: { id: string; goal: string; constraints: any; success_criteria: any },
  supabase: any,
): Promise<{ steps: any[]; total_steps: number }> {
  const { data: skills } = await supabase.from('agent_skills')
    .select('name, description, category, handler')
    .eq('enabled', true);

  const skillList = (skills || []).map((s: any) => `- ${s.name}: ${s.description} (${s.handler})`).join('\n');

  const { apiKey, apiUrl, model } = await resolveAiConfig(supabase, 'reasoning');
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

export async function handleDecomposeObjective(supabase: any, args: { objective_id: string }) {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!args.objective_id || !UUID_RE.test(args.objective_id)) {
    return { status: 'error', error: `Invalid objective_id UUID: "${args.objective_id}". Use the full UUID from the objectives list.` };
  }
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

// ─── Atomic Task Checkout ─────────────────────────────────────────────────────

export async function checkoutObjective(supabase: any, objectiveId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('checkout_objective', {
    p_objective_id: objectiveId,
    p_locked_by: 'heartbeat',
  });
  return !error && data === true;
}

export async function releaseObjective(supabase: any, objectiveId: string): Promise<void> {
  await supabase
    .from('agent_objectives')
    .update({ locked_by: null, locked_at: null })
    .eq('id', objectiveId)
    .eq('locked_by', 'heartbeat');
}

export async function handleAdvancePlan(supabase: any, supabaseUrl: string, serviceKey: string, args: { objective_id: string; chain?: boolean }) {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!args.objective_id || !UUID_RE.test(args.objective_id)) {
    return { status: 'error', error: `Invalid objective_id UUID: "${args.objective_id}". Use the full UUID from the objectives list.` };
  }
  const { objective_id, chain = true } = args;
  const maxSteps = chain ? MAX_CHAIN_DEPTH : 1;
  const chainResults: any[] = [];

  const locked = await checkoutObjective(supabase, objective_id);
  if (!locked) {
    return { status: 'locked', message: 'Objective is currently being worked on by another process.' };
  }

  try {
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
          const objectiveContext = {
            goal: obj.goal,
            step: nextStep.description,
            why: `Step ${nextStep.order} of plan for objective: ${obj.goal}`,
          };
          const resp = await fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
            body: JSON.stringify({
              skill_name: nextStep.skill_name,
              arguments: nextStep.skill_args || {},
              agent_type: 'flowpilot',
              objective_context: objectiveContext,
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
  } finally {
    await releaseObjective(supabase, objective_id);
  }
}

export async function handleProposeObjective(supabase: any, args: { goal: string; reason: string; constraints?: any; success_criteria?: any }) {
  const { goal, reason, constraints, success_criteria } = args;

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

export async function handleExecuteAutomation(supabase: any, supabaseUrl: string, serviceKey: string, args: { automation_id: string }) {
  const { data: auto, error: fetchErr } = await supabase.from('agent_automations')
    .select('*').eq('id', args.automation_id).maybeSingle();
  if (fetchErr || !auto) return { status: 'error', error: fetchErr?.message || 'Automation not found' };

  if (auto.skill_name) {
    const { data: skill } = await supabase.from('agent_skills')
      .select('trust_level, requires_approval').eq('name', auto.skill_name).maybeSingle();
    const trustLevel = skill?.trust_level || (skill?.requires_approval ? 'approve' : 'auto');
    if (trustLevel === 'approve') {
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
  if (auto.trigger_type === 'cron') {
    const cronExpr = auto.trigger_config?.cron || auto.trigger_config?.expression;
    if (cronExpr) nextRun = calculateNextRun(cronExpr);
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

// ─── Workflow DAGs ────────────────────────────────────────────────────────────

function resolveTemplateVars(value: any, context: Record<string, any>): any {
  if (typeof value === 'string') {
    return value.replace(/\{\{([\w.]+)\}\}/g, (match, path) => {
      const parts = path.split('.');
      let current: any = context;
      for (const p of parts) {
        if (current == null) return match;
        current = current[p];
      }
      return current !== undefined ? String(current) : match;
    });
  }
  if (Array.isArray(value)) return value.map((v) => resolveTemplateVars(v, context));
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) result[k] = resolveTemplateVars(v, context);
    return result;
  }
  return value;
}

function evaluateCondition(condition: any, context: Record<string, any>): boolean {
  const { step, field, operator, value } = condition;
  const stepCtx = context[step];
  if (!stepCtx) return false;
  const parts = (field as string).split('.');
  let actual: any = stepCtx;
  for (const p of parts) {
    if (actual == null) return false;
    actual = actual[p];
  }
  switch (operator) {
    case 'eq': return actual == value;
    case 'neq': return actual != value;
    case 'gt': return Number(actual) > Number(value);
    case 'lt': return Number(actual) < Number(value);
    case 'contains': return String(actual).includes(String(value));
    case 'truthy': return Boolean(actual);
    default: return true;
  }
}

export async function handleWorkflowCreate(supabase: any, args: any) {
  const { name, description, steps, trigger_type = 'manual', trigger_config = {} } = args;
  if (!name || !steps?.length) return { status: 'error', error: 'name and steps are required' };
  const { data, error } = await supabase.from('agent_workflows')
    .insert({ name, description, steps, trigger_type, trigger_config })
    .select('id, name, trigger_type').single();
  if (error) return { status: 'error', error: error.message };
  return { status: 'created', workflow: data, step_count: steps.length };
}

export async function handleWorkflowList(supabase: any) {
  const { data } = await supabase.from('agent_workflows')
    .select('id, name, description, trigger_type, enabled, run_count, last_run_at, last_error, steps')
    .order('created_at', { ascending: false });
  return {
    workflows: (data || []).map((w: any) => ({
      ...w, step_count: Array.isArray(w.steps) ? w.steps.length : 0, steps: undefined,
    })),
    count: data?.length || 0,
  };
}

export async function handleWorkflowUpdate(supabase: any, args: { workflow_id?: string; workflow_name?: string; updates: Record<string, any> }) {
  const safeFields = ['name', 'description', 'steps', 'trigger_type', 'trigger_config', 'enabled'];
  const filtered: Record<string, any> = {};
  for (const [k, v] of Object.entries(args.updates)) {
    if (safeFields.includes(k)) filtered[k] = v;
  }
  if (Object.keys(filtered).length === 0) return { status: 'error', error: 'No valid fields to update' };
  filtered.updated_at = new Date().toISOString();

  let q = supabase.from('agent_workflows').update(filtered);
  if (args.workflow_id) q = q.eq('id', args.workflow_id);
  else if (args.workflow_name) q = q.eq('name', args.workflow_name);
  else return { status: 'error', error: 'Provide workflow_id or workflow_name' };

  const { data, error } = await q.select('id, name, enabled').single();
  if (error) return { status: 'error', error: error.message };
  return { status: 'updated', workflow: data };
}

export async function handleWorkflowDelete(supabase: any, args: { workflow_id?: string; workflow_name?: string }) {
  let q = supabase.from('agent_workflows').delete();
  if (args.workflow_id) q = q.eq('id', args.workflow_id);
  else if (args.workflow_name) q = q.eq('name', args.workflow_name);
  else return { status: 'error', error: 'Provide workflow_id or workflow_name' };

  const { data, error } = await q.select('id, name').single();
  if (error) return { status: 'error', error: error.message };
  return { status: 'deleted', workflow: data };
}

export async function handleWorkflowExecute(
  supabase: any, supabaseUrl: string, serviceKey: string,
  args: { workflow_id?: string; workflow_name?: string; input?: Record<string, any> },
) {
  let q = supabase.from('agent_workflows').select('*');
  if (args.workflow_id) q = q.eq('id', args.workflow_id);
  else if (args.workflow_name) q = q.eq('name', args.workflow_name);
  else return { status: 'error', error: 'workflow_id or workflow_name required' };

  const { data: wf, error } = await q.maybeSingle();
  if (error || !wf) return { status: 'error', error: error?.message || 'Workflow not found' };

  const steps: any[] = wf.steps || [];
  const context: Record<string, any> = { input: args.input || {} };
  const trace: any[] = [];
  let overallStatus = 'completed';

  for (const step of steps) {
    if (step.condition) {
      const condMet = evaluateCondition(step.condition, context);
      if (!condMet) {
        trace.push({ id: step.id, skill: step.skill_name, status: 'skipped', reason: 'condition not met' });
        context[step.id] = { status: 'skipped' };
        continue;
      }
    }

    const resolvedArgs = resolveTemplateVars(step.skill_args || {}, context);
    let result: any;
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
        body: JSON.stringify({ skill_name: step.skill_name, arguments: resolvedArgs, agent_type: 'flowpilot' }),
      });
      result = await resp.json();
    } catch (err: any) {
      result = { error: err.message };
    }

    const success = !result.error && result.status !== 'failed';
    trace.push({ id: step.id, skill: step.skill_name, status: success ? 'done' : 'failed', result });
    context[step.id] = { status: success ? 'done' : 'failed', result };

    if (!success && (step.on_failure || 'stop') === 'stop') {
      overallStatus = 'failed';
      break;
    }
  }

  await supabase.from('agent_workflows').update({
    run_count: (wf.run_count || 0) + 1,
    last_run_at: new Date().toISOString(),
    last_error: overallStatus === 'failed' ? (trace.find((s) => s.status === 'failed')?.result?.error || 'step failed') : null,
  }).eq('id', wf.id);

  return {
    status: overallStatus,
    workflow: wf.name,
    steps_executed: trace.filter((s) => s.status !== 'skipped').length,
    steps_skipped: trace.filter((s) => s.status === 'skipped').length,
    trace,
  };
}

// ─── A2A Delegation ───────────────────────────────────────────────────────────

export async function handleDelegateTask(
  supabase: any, _supabaseUrl: string, _serviceKey: string,
  args: { agent_name: string; task: string; context?: Record<string, any>; session_id?: string },
) {
  const { agent_name, task, context = {} } = args;

  const { data: profile } = await supabase.from('agent_memory')
    .select('value').eq('key', `agent:${agent_name}`).maybeSingle();

  const systemPrompt = profile?.value?.system_prompt
    || SPECIALIST_PROMPTS[agent_name]
    || `You are a specialist agent focused on ${agent_name}. Complete the given task thoroughly and concisely.`;

  const { apiKey, apiUrl, model } = await resolveAiConfig(supabase, 'fast');
  const contextStr = Object.keys(context).length > 0
    ? `\n\nContext:\n${JSON.stringify(context, null, 2)}`
    : '';

  const sessionKey = args.session_id || `a2a_session:${agent_name}`;
  const { data: sessionData } = await supabase.from('agent_memory')
    .select('value').eq('key', sessionKey).maybeSingle();

  const previousMessages: Array<{ role: string; content: string }> = sessionData?.value?.messages || [];

  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
    ...previousMessages.slice(-MAX_SESSION_MESSAGES),
    { role: 'user', content: `${task}${contextStr}` },
  ];

  try {
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: 1500 }),
    });
    if (!resp.ok) throw new Error(`AI error: ${resp.status}`);
    const data = await resp.json();
    const response = data.choices?.[0]?.message?.content || 'No response generated.';

    const updatedMessages = [
      ...previousMessages.slice(-(MAX_SESSION_MESSAGES - 2)),
      { role: 'user', content: task },
      { role: 'assistant', content: response },
    ];

    const sessionRecord = {
      value: {
        messages: updatedMessages,
        agent: agent_name,
        last_task: task,
        updated_at: new Date().toISOString(),
        turn_count: (sessionData?.value?.turn_count || 0) + 1,
      },
      category: 'context',
      updated_at: new Date().toISOString(),
    };

    if (sessionData) {
      await supabase.from('agent_memory').update(sessionRecord).eq('key', sessionKey);
    } else {
      await supabase.from('agent_memory').insert({ key: sessionKey, ...sessionRecord, created_by: 'flowpilot' });
    }

    return {
      status: 'completed',
      agent: agent_name,
      task,
      response,
      session_id: sessionKey,
      turn_count: (sessionData?.value?.turn_count || 0) + 1,
    };
  } catch (err: any) {
    return { status: 'error', agent: agent_name, error: err.message };
  }
}

// ─── Skill Packs ──────────────────────────────────────────────────────────────

export async function handleSkillPackList(supabase: any) {
  const { data } = await supabase.from('agent_skill_packs')
    .select('id, name, description, version, installed, installed_at, skills')
    .order('name');
  return {
    packs: (data || []).map((p: any) => ({
      id: p.id, name: p.name, description: p.description,
      version: p.version, installed: p.installed, installed_at: p.installed_at,
      skill_count: Array.isArray(p.skills) ? p.skills.length : 0,
    })),
    count: data?.length || 0,
  };
}

export async function handleSkillPackInstall(supabase: any, args: { pack_name: string }) {
  const { data: pack, error } = await supabase.from('agent_skill_packs')
    .select('*').eq('name', args.pack_name).maybeSingle();
  if (error || !pack) return { status: 'error', error: error?.message || 'Pack not found. Use skill_pack_list to see available packs.' };

  const skills: any[] = pack.skills || [];
  const results: any[] = [];

  for (const skill of skills) {
    const { data: existing } = await supabase.from('agent_skills')
      .select('id').eq('name', skill.name).maybeSingle();

    if (existing) {
      await supabase.from('agent_skills')
        .update({ description: skill.description, updated_at: new Date().toISOString() })
        .eq('name', skill.name);
      results.push({ skill: skill.name, action: 'updated' });
    } else {
      const { error: insertErr } = await supabase.from('agent_skills').insert({
        name: skill.name,
        description: skill.description,
        handler: skill.handler,
        category: skill.category || 'automation',
        scope: skill.scope || 'internal',
        trust_level: skill.trust_level || (skill.requires_approval ? 'approve' : 'auto'),
        requires_approval: skill.requires_approval ?? false,
        enabled: skill.enabled ?? true,
        instructions: skill.instructions || null,
        tool_definition: skill.tool_definition || null,
        origin: 'managed',
      });
      results.push({ skill: skill.name, action: insertErr ? 'failed' : 'created', error: insertErr?.message });
    }
  }

  await supabase.from('agent_skill_packs').update({
    installed: true, installed_at: new Date().toISOString(),
  }).eq('id', pack.id);

  return {
    status: 'installed',
    pack: args.pack_name,
    skills_processed: results.length,
    results,
  };
}

// ─── Self-Healing ─────────────────────────────────────────────────────────────

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
    await supabase.from('agent_skills').update({ enabled: false }).eq('name', skillName);
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

// ─── Skill CRUD ───────────────────────────────────────────────────────────────

export async function handleSkillCreate(supabase: any, args: any) {
  const { data: existing } = await supabase
    .from('agent_skills').select('id').eq('name', args.name).maybeSingle();
  if (existing) return { status: 'error', error: `Skill "${args.name}" already exists` };

  const { data, error } = await supabase.from('agent_skills').insert({
    name: args.name,
    description: args.description,
    handler: args.handler,
    category: args.category || 'automation',
    scope: args.scope || 'internal',
    trust_level: args.trust_level || 'approve',
    requires_approval: (args.trust_level || 'approve') === 'approve',
    enabled: true,
    tool_definition: args.tool_definition,
    origin: 'agent',
  }).select('id, name, handler, enabled, trust_level, origin').single();

  if (error) return { status: 'error', error: error.message };
  return { status: 'created', skill: data };
}

export async function handleSkillUpdate(supabase: any, args: { skill_name: string; updates: Record<string, any> }) {
  const safeFields = ['description', 'handler', 'category', 'scope', 'trust_level', 'requires_approval', 'enabled', 'tool_definition', 'instructions'];
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

export async function handleSkillList(supabase: any, args: { category?: string; scope?: string; include_disabled?: boolean }) {
  let q = supabase.from('agent_skills').select('id, name, description, category, scope, handler, enabled, trust_level, requires_approval');
  if (!args.include_disabled) q = q.eq('enabled', true);
  if (args.category) q = q.eq('category', args.category);
  if (args.scope) q = q.eq('scope', args.scope);
  const { data } = await q.order('category').order('name');
  return { skills: data || [], count: data?.length || 0 };
}

export async function handleSkillDisable(supabase: any, args: { skill_name: string }) {
  const { data, error } = await supabase
    .from('agent_skills').update({ enabled: false, updated_at: new Date().toISOString() }).eq('name', args.skill_name).select('id, name').single();
  if (error) return { status: 'error', error: error.message };
  return { status: 'disabled', skill: data };
}

export async function handleSkillEnable(supabase: any, args: { skill_name: string }) {
  const { data, error } = await supabase
    .from('agent_skills').update({ enabled: true, updated_at: new Date().toISOString() }).eq('name', args.skill_name).select('id, name').single();
  if (error) return { status: 'error', error: error.message };
  return { status: 'enabled', skill: data };
}

export async function handleSkillDelete(supabase: any, args: { skill_name: string }) {
  const { data, error } = await supabase
    .from('agent_skills').delete().eq('name', args.skill_name).select('id, name').single();
  if (error) return { status: 'error', error: error.message };
  return { status: 'deleted', skill: data };
}

export async function handleSkillInstruct(supabase: any, args: { skill_name: string; instructions: string }) {
  const { data, error } = await supabase
    .from('agent_skills').update({ instructions: args.instructions, updated_at: new Date().toISOString() }).eq('name', args.skill_name).select('id, name, instructions').single();
  if (error) return { status: 'error', error: error.message };

  await supabase.from('agent_activity').insert({
    agent: 'flowpilot',
    skill_name: 'skill_instruct',
    input: { skill_name: args.skill_name, instructions_length: args.instructions.length },
    output: { skill_id: data.id, skill_name: data.name, preview: args.instructions.slice(0, 200) },
    status: 'success',
  });

  return { status: 'updated', skill: data };
}

export async function handleSkillRead(supabase: any, args: { skill_name: string }) {
  const { data, error } = await supabase
    .from('agent_skills')
    .select('id, name, description, handler, category, scope, trust_level, instructions, tool_definition, requires, requires_approval')
    .eq('name', args.skill_name)
    .maybeSingle();

  if (error) return { status: 'error', error: error.message };
  if (!data) return { status: 'not_found', error: `Skill "${args.skill_name}" not found` };

  return {
    status: 'loaded',
    skill: {
      name: data.name,
      description: data.description,
      handler: data.handler,
      category: data.category,
      scope: data.scope,
      trust_level: data.trust_level,
      requires_approval: data.requires_approval,
      instructions: data.instructions || '(no instructions — consider adding with skill_instruct)',
      parameters: data.tool_definition?.function?.parameters || null,
      prerequisites: data.requires || [],
    },
  };
}

// ─── Soul & Agents Update ─────────────────────────────────────────────────────

export async function handleSoulUpdate(supabase: any, args: { field: string; value: any }) {
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

export async function handleAgentsUpdate(supabase: any, args: { field: string; value: any }) {
  const { data: existing } = await supabase
    .from('agent_memory').select('id, value').eq('key', 'agents').maybeSingle();

  const currentAgents = existing?.value || {};
  const updatedAgents = { ...currentAgents, [args.field]: args.value, version: currentAgents.version || '1.0' };

  if (existing) {
    await supabase.from('agent_memory')
      .update({ value: updatedAgents, updated_at: new Date().toISOString() }).eq('id', existing.id);
  } else {
    await supabase.from('agent_memory')
      .insert({ key: 'agents', value: updatedAgents, category: 'preference', created_by: 'flowpilot' });
  }
  return { status: 'updated', field: args.field, agents: updatedAgents };
}

// ─── Heartbeat Protocol Update ────────────────────────────────────────────────

export async function handleHeartbeatProtocolUpdate(supabase: any, args: { action: string; protocol?: string }) {
  // Import from prompt-compiler
  const { loadHeartbeatProtocol, saveHeartbeatProtocol, getDefaultHeartbeatProtocol } = await import('./prompt-compiler.ts');
  
  if (args.action === 'get') {
    const custom = await loadHeartbeatProtocol(supabase);
    return { status: 'ok', protocol: custom || getDefaultHeartbeatProtocol(), is_custom: !!custom };
  }
  if (args.action === 'reset') {
    await supabase.from('agent_memory').delete().eq('key', 'heartbeat_protocol');
    return { status: 'reset', message: 'Heartbeat protocol restored to default' };
  }
  if (args.action === 'set') {
    if (!args.protocol) return { status: 'error', error: 'protocol text is required for action=set' };
    await saveHeartbeatProtocol(supabase, args.protocol);
    return { status: 'updated', message: 'Custom heartbeat protocol saved. Will be used on next heartbeat.' };
  }
  return { status: 'error', error: `Unknown action: ${args.action}` };
}

// ─── Automation CRUD ──────────────────────────────────────────────────────────

export async function handleAutomationCreate(supabase: any, args: any) {
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

export async function handleAutomationList(supabase: any, args: { enabled_only?: boolean }) {
  let q = supabase.from('agent_automations').select('id, name, description, trigger_type, trigger_config, skill_name, enabled, run_count, last_triggered_at, next_run_at, last_error');
  if (args.enabled_only) q = q.eq('enabled', true);
  const { data } = await q.order('created_at', { ascending: false });
  return { automations: data || [], count: data?.length || 0 };
}

export async function handleAutomationUpdate(supabase: any, args: { automation_id?: string; automation_name?: string; updates: Record<string, any> }) {
  const safeFields = ['name', 'description', 'trigger_type', 'trigger_config', 'skill_name', 'skill_arguments', 'enabled'];
  const filtered: Record<string, any> = {};
  for (const [k, v] of Object.entries(args.updates)) {
    if (safeFields.includes(k)) filtered[k] = v;
  }
  if (Object.keys(filtered).length === 0) return { status: 'error', error: 'No valid fields to update' };
  filtered.updated_at = new Date().toISOString();

  let q = supabase.from('agent_automations').update(filtered);
  if (args.automation_id) q = q.eq('id', args.automation_id);
  else if (args.automation_name) q = q.eq('name', args.automation_name);
  else return { status: 'error', error: 'Provide automation_id or automation_name' };

  const { data, error } = await q.select('id, name, enabled').single();
  if (error) return { status: 'error', error: error.message };
  return { status: 'updated', automation: data };
}

export async function handleAutomationDelete(supabase: any, args: { automation_id?: string; automation_name?: string }) {
  let q = supabase.from('agent_automations').delete();
  if (args.automation_id) q = q.eq('id', args.automation_id);
  else if (args.automation_name) q = q.eq('name', args.automation_name);
  else return { status: 'error', error: 'Provide automation_id or automation_name' };

  const { data, error } = await q.select('id, name').single();
  if (error) return { status: 'error', error: error.message };
  return { status: 'deleted', automation: data };
}

// ─── Reflection ───────────────────────────────────────────────────────────────

export async function handleReflect(supabase: any, args: { focus?: string }) {
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

// ─── Skill Chaining ───────────────────────────────────────────────────────────

export async function handleChainSkills(
  supabase: any, supabaseUrl: string, serviceKey: string,
  args: { steps: Array<{ skill_name: string; args?: Record<string, any> }>; stop_on_error?: boolean },
) {
  const { steps = [], stop_on_error = true } = args;
  if (!steps.length) return { status: 'error', error: 'No steps provided' };
  if (steps.length > 6) return { status: 'error', error: 'Max 6 steps per chain' };

  const trace: any[] = [];
  let previousResult: any = null;

  for (const step of steps) {
    const resolvedArgs: Record<string, any> = { ...(step.args || {}) };
    if (previousResult) {
      resolvedArgs._previous_result = previousResult;
      for (const [k, v] of Object.entries(resolvedArgs)) {
        if (typeof v === 'string' && v.includes('{{prev.')) {
          resolvedArgs[k] = v.replace(/\{\{prev\.(\w+)\}\}/g, (_m, field) => {
            const val = previousResult?.[field] ?? previousResult?.result?.[field];
            return val !== undefined ? String(val) : '';
          });
        }
      }
    }

    let result: any;
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
        body: JSON.stringify({ skill_name: step.skill_name, arguments: resolvedArgs, agent_type: 'flowpilot' }),
      });
      result = await resp.json();
    } catch (err: any) {
      result = { error: err.message };
    }

    const success = !result.error && result.status !== 'failed';
    trace.push({ skill: step.skill_name, status: success ? 'done' : 'failed', result });
    previousResult = result?.result || result;

    if (!success && stop_on_error) break;
  }

  const allSuccess = trace.every(t => t.status === 'done');
  return {
    status: allSuccess ? 'chain_completed' : 'chain_partial',
    steps_executed: trace.length,
    steps_total: steps.length,
    trace,
    final_result: previousResult,
  };
}

// ─── Outcome Evaluation ───────────────────────────────────────────────────────

export async function handleEvaluateOutcomes(supabase: any, args: {
  limit?: number;
  skill_filter?: string;
  include_too_early?: boolean;
}) {
  const limit = args.limit || 15;
  const since = new Date();
  since.setDate(since.getDate() - 14);

  let query = supabase
    .from('agent_activity')
    .select('id, skill_name, input, output, status, created_at, duration_ms, outcome_status')
    .gte('created_at', since.toISOString())
    .eq('status', 'success')
    .order('created_at', { ascending: false })
    .limit(limit * 2);

  if (args.skill_filter) query = query.eq('skill_name', args.skill_filter);

  const { data: activities } = await query;
  if (!activities?.length) return { status: 'no_activities', count: 0 };

  let filteredActivities = activities.filter((a: any) =>
    a.outcome_status === null || (args.include_too_early && a.outcome_status === 'too_early')
  ).slice(0, limit);

  if (!filteredActivities.length) return { status: 'all_evaluated', count: 0, message: 'All recent activities have been evaluated.' };

  // ─── Hard Gates: Auto-score obvious failures immediately ───────────────
  const HARD_GATE_PATTERNS = ['auth_failed', 'quota_hit', 'rate_limited', 'budget_exceeded', 'circuit_broken', 'timeout', 'Unauthorized', '401', '403', '429'];
  const autoScoredIds: string[] = [];

  for (const a of filteredActivities) {
    const outputStr = JSON.stringify(a.output || {});
    const isHardFailure = HARD_GATE_PATTERNS.some(p => outputStr.includes(p));
    if (isHardFailure) {
      await supabase.from('agent_activity').update({
        outcome_status: 'negative',
        outcome_data: { auto_gate: true, reason: 'Hard gate: output contains failure indicator' },
        outcome_evaluated_at: new Date().toISOString(),
      }).eq('id', a.id);
      autoScoredIds.push(a.id);
    }
  }

  // Remove auto-scored from manual eval list
  filteredActivities = filteredActivities.filter((a: any) => !autoScoredIds.includes(a.id));
  if (!filteredActivities.length && autoScoredIds.length > 0) {
    return { status: 'auto_evaluated', count: autoScoredIds.length, message: `${autoScoredIds.length} activities auto-scored as negative via hard gates.` };
  }

  const now = new Date();
  const EVAL_WINDOW_HOURS = 24; // Frostie recommendation: 72h → 24h
  const enrichedActivities = filteredActivities.map((a: any) => {
    const createdAt = new Date(a.created_at);
    const hoursAgo = Math.round((now.getTime() - createdAt.getTime()) / 3600_000);
    return {
      id: a.id,
      skill_name: a.skill_name,
      input_summary: JSON.stringify(a.input || {}).slice(0, 200),
      output_summary: JSON.stringify(a.output || {}).slice(0, 300),
      created_at: a.created_at,
      hours_ago: hoursAgo,
      too_early: hoursAgo < EVAL_WINDOW_HOURS,
      duration_ms: a.duration_ms,
      current_outcome: a.outcome_status,
    };
  });

  const since7d = new Date();
  since7d.setDate(since7d.getDate() - 7);

  const [viewsResult, leadsResult, subscriberResult, dealsResult, bookingsResult, ordersResult, feedbackResult] = await Promise.all([
    supabase.from('page_views').select('page_slug', { count: 'exact', head: false })
      .gte('created_at', since7d.toISOString()).limit(500),
    supabase.from('leads').select('id, source, score, created_at')
      .gte('created_at', since7d.toISOString()).order('created_at', { ascending: false }).limit(50),
    supabase.from('newsletter_subscribers').select('id', { count: 'exact', head: true })
      .gte('created_at', since7d.toISOString()),
    supabase.from('deals').select('stage, value_cents, created_at')
      .gte('created_at', since7d.toISOString()).limit(50),
    supabase.from('bookings').select('id, status, created_at')
      .gte('created_at', since7d.toISOString()).limit(50),
    supabase.from('order_items').select('id, price_cents, created_at')
      .gte('created_at', since7d.toISOString()).limit(50),
    supabase.from('chat_feedback').select('rating, created_at')
      .gte('created_at', since7d.toISOString()).limit(50),
  ]);

  const pageViewCounts: Record<string, number> = {};
  for (const pv of (viewsResult.data || [])) {
    pageViewCounts[pv.page_slug] = (pageViewCounts[pv.page_slug] || 0) + 1;
  }

  const feedbackSummary: Record<string, number> = {};
  for (const f of (feedbackResult.data || [])) {
    feedbackSummary[f.rating] = (feedbackSummary[f.rating] || 0) + 1;
  }

  const correlationContext = {
    total_page_views_7d: viewsResult.data?.length || 0,
    top_pages: Object.entries(pageViewCounts).sort((a, b) => b[1] - a[1]).slice(0, 10),
    new_leads_7d: leadsResult.data?.length || 0,
    new_subscribers_7d: subscriberResult.count || 0,
    lead_sources: [...new Set((leadsResult.data || []).map((l: any) => l.source))],
    new_deals_7d: dealsResult.data?.length || 0,
    deal_value_7d: (dealsResult.data || []).reduce((s: number, d: any) => s + (d.value_cents || 0), 0),
    bookings_7d: bookingsResult.data?.length || 0,
    orders_7d: ordersResult.data?.length || 0,
    order_revenue_7d: (ordersResult.data || []).reduce((s: number, o: any) => s + (o.price_cents || 0), 0),
    chat_feedback_7d: feedbackSummary,
  };

  const { data: historicalOutcomes } = await supabase
    .from('agent_activity')
    .select('skill_name, outcome_status')
    .not('outcome_status', 'is', null)
    .neq('outcome_status', 'too_early')
    .order('created_at', { ascending: false })
    .limit(200);

  const scorecard: Record<string, { total: number; success: number; partial: number; neutral: number; negative: number; rate: number }> = {};
  for (const o of (historicalOutcomes || [])) {
    if (!o.skill_name) continue;
    if (!scorecard[o.skill_name]) scorecard[o.skill_name] = { total: 0, success: 0, partial: 0, neutral: 0, negative: 0, rate: 0 };
    const s = scorecard[o.skill_name];
    s.total++;
    if (o.outcome_status === 'success') s.success++;
    else if (o.outcome_status === 'partial') s.partial++;
    else if (o.outcome_status === 'neutral') s.neutral++;
    else if (o.outcome_status === 'negative') s.negative++;
  }
  for (const s of Object.values(scorecard)) {
    s.rate = s.total > 0 ? Math.round(((s.success + s.partial * 0.5) / s.total) * 100) : 0;
  }

  const { data: learnings } = await supabase
    .from('agent_memory')
    .select('key, value, created_at')
    .like('key', 'outcome_learning:%')
    .order('created_at', { ascending: false })
    .limit(10);

  const recentLearnings = (learnings || []).map((l: any) => ({
    skill: l.value?.skill,
    outcome: l.value?.outcome,
    lesson: l.value?.lesson,
    data: l.value?.data,
    date: l.created_at?.slice(0, 10),
  }));

  return {
    status: 'pending_evaluation',
    count: enrichedActivities.length,
    activities: enrichedActivities,
    correlation_data: correlationContext,
    skill_scorecard: scorecard,
    recent_learnings: recentLearnings.length ? recentLearnings : undefined,
    instructions: 'For each activity, assess impact using its causal_data AND the broad correlation_data. Check the skill_scorecard to see historical patterns. Review recent_learnings to avoid repeating mistakes. Call record_outcome for each activity.',
  };
}

export async function handleRecordOutcome(supabase: any, args: {
  activity_id: string;
  outcome_status: string;
  outcome_data?: Record<string, any>;
}) {
  const validStatuses = ['success', 'partial', 'neutral', 'negative', 'too_early'];
  if (!validStatuses.includes(args.outcome_status)) {
    return { status: 'error', error: `Invalid outcome_status. Must be one of: ${validStatuses.join(', ')}` };
  }

  const { data, error } = await supabase
    .from('agent_activity')
    .update({
      outcome_status: args.outcome_status,
      outcome_data: args.outcome_data || {},
      outcome_evaluated_at: new Date().toISOString(),
    })
    .eq('id', args.activity_id)
    .select('id, skill_name, outcome_status')
    .single();

  if (error) return { status: 'error', error: error.message };

  if (args.outcome_status === 'negative' || args.outcome_status === 'neutral') {
    const skillName = data?.skill_name || 'unknown';
    await supabase.from('agent_memory').upsert({
      key: `outcome_learning:${skillName}:${new Date().toISOString().slice(0, 10)}`,
      value: {
        skill: skillName,
        outcome: args.outcome_status,
        data: args.outcome_data,
        lesson: `${skillName} produced ${args.outcome_status} result. Review strategy.`,
      },
      category: 'context',
      created_by: 'flowpilot',
    }, { onConflict: 'key' });
  }

  if (args.outcome_status === 'success' && args.outcome_data) {
    const skillName = data?.skill_name || 'unknown';
    await supabase.from('agent_memory').upsert({
      key: `outcome_success:${skillName}:${new Date().toISOString().slice(0, 10)}`,
      value: {
        skill: skillName,
        outcome: 'success',
        data: args.outcome_data,
        lesson: `${skillName} produced successful result. Replicate this approach.`,
      },
      category: 'context',
      created_by: 'flowpilot',
    }, { onConflict: 'key' });
  }

  return { status: 'recorded', activity: data };
}
