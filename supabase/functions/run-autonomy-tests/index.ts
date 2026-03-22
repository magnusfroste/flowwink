import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  resolveAiConfig,
  buildSystemPrompt,
  buildSoulPrompt,
  buildWorkspacePrompt,
  extractTokenUsage,
  accumulateTokens,
  isOverBudget,
  checkoutObjective,
  releaseObjective,
  loadCMSSchema,
  loadHeartbeatState,
  saveHeartbeatState,
  loadMemories,
  loadObjectives,
  loadWorkspaceFiles,
  loadSkillTools,
  getBuiltInTools,
  tryAcquireLock,
  releaseLock,
  loadHeartbeatProtocol,
} from "../_shared/agent-reason.ts";
import type { PromptCompilerInput, TokenUsage, HeartbeatState } from "../_shared/agent-reason.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ─── Test Runner Framework ────────────────────────────────────────────────────

interface TestResult {
  name: string;
  layer: 1 | 2 | 3 | 4 | 5 | 6;
  status: 'pass' | 'fail' | 'skip';
  duration_ms: number;
  error?: string;
}
  status: 'pass' | 'fail' | 'skip';
  duration_ms: number;
  error?: string;
}

function assertEqual(actual: any, expected: any, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(msg || `Expected ${e}, got ${a}`);
}

function assertExists(value: any, msg?: string) {
  if (value === null || value === undefined) throw new Error(msg || `Value is ${value}`);
}

function assertContains(str: string, substr: string, msg?: string) {
  if (!str.includes(substr)) throw new Error(msg || `"${str.slice(0, 100)}..." does not contain "${substr}"`);
}

async function runTest(name: string, layer: 1 | 2 | 3 | 4 | 5 | 6, fn: () => Promise<void>): Promise<TestResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, layer, status: 'pass', duration_ms: Date.now() - start };
  } catch (err: any) {
    return { name, layer, status: 'fail', duration_ms: Date.now() - start, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 1: Unit Tests (Pure Functions)
// ═══════════════════════════════════════════════════════════════════════════════

async function layer1Tests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Token Tracking
  results.push(await runTest("extractTokenUsage: extracts from AI response", 1, async () => {
    const r = extractTokenUsage({ usage: { prompt_tokens: 100, completion_tokens: 50 } });
    assertEqual(r, { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 });
  }));

  results.push(await runTest("extractTokenUsage: handles missing usage", 1, async () => {
    const r = extractTokenUsage({});
    assertEqual(r, { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });
  }));

  results.push(await runTest("accumulateTokens: sums correctly", 1, async () => {
    const a: TokenUsage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 };
    const b: TokenUsage = { prompt_tokens: 200, completion_tokens: 80, total_tokens: 280 };
    const r = accumulateTokens(a, b);
    assertEqual(r, { prompt_tokens: 300, completion_tokens: 130, total_tokens: 430 });
  }));

  results.push(await runTest("isOverBudget: detects exceeded", 1, async () => {
    assertEqual(isOverBudget({ prompt_tokens: 40000, completion_tokens: 10000, total_tokens: 50000 }, 50000), true);
  }));

  results.push(await runTest("isOverBudget: allows within budget", 1, async () => {
    assertEqual(isOverBudget({ prompt_tokens: 30000, completion_tokens: 10000, total_tokens: 40000 }, 50000), false);
  }));

  // Soul Prompt Builder
  results.push(await runTest("buildSoulPrompt: full soul + identity", 1, async () => {
    const prompt = buildSoulPrompt(
      { purpose: "Help grow", values: ["Honesty"], tone: "professional" },
      { name: "Aria", role: "Consultant", capabilities: ["SEO"], boundaries: ["No spam"] }
    );
    assertContains(prompt, "Name: Aria");
    assertContains(prompt, "Role: Consultant");
    assertContains(prompt, "Purpose: Help grow");
  }));

  results.push(await runTest("buildSoulPrompt: empty returns empty", 1, async () => {
    const prompt = buildSoulPrompt({}, {});
    assertEqual(prompt, '');
  }));

  // Prompt Compiler
  const baseInput: PromptCompilerInput = {
    mode: 'operate',
    soulPrompt: 'SOUL: Test',
    memoryContext: 'MEM: likes blue',
    objectiveContext: 'OBJ: Grow 20%',
  };

  results.push(await runTest("buildSystemPrompt: operate mode", 1, async () => {
    const p = buildSystemPrompt(baseInput);
    assertContains(p, "autonomous, self-improving AI agent");
    assertContains(p, "GROUNDING & DATA INTEGRITY");
  }));

  results.push(await runTest("buildSystemPrompt: heartbeat mode includes protocol", 1, async () => {
    const p = buildSystemPrompt({ ...baseInput, mode: 'heartbeat', maxIterations: 5 });
    assertContains(p, "AUTONOMOUS HEARTBEAT mode");
    assertContains(p, "Max 5 tool iterations");
  }));

  results.push(await runTest("buildSystemPrompt: CMS schema injected", 1, async () => {
    const p = buildSystemPrompt({ ...baseInput, cmsSchemaContext: 'CMS: 10 pages' });
    assertContains(p, "CMS: 10 pages");
  }));

  results.push(await runTest("buildSystemPrompt: token budget in heartbeat", 1, async () => {
    const p = buildSystemPrompt({ ...baseInput, mode: 'heartbeat', tokenBudget: 50000 });
    assertContains(p, "TOKEN BUDGET: 50000");
  }));

  results.push(await runTest("buildSystemPrompt: heartbeat state not in operate", 1, async () => {
    const p = buildSystemPrompt({ ...baseInput, mode: 'operate', heartbeatState: 'LEAK' });
    if (p.includes('LEAK')) throw new Error("Heartbeat state leaked into operate mode");
  }));

  results.push(await runTest("buildSystemPrompt: chat includes soul + grounding", 1, async () => {
    const soulP = buildWorkspacePrompt({ purpose: "Help" }, { name: "Bot" }, null);
    const p = buildSystemPrompt({ ...baseInput, mode: 'chat', soulPrompt: soulP, chatSystemPrompt: 'Welcome.' });
    assertContains(p, 'Welcome.');
    assertContains(p, 'Name: Bot');
    assertContains(p, 'DATA INTEGRITY');
    assertContains(p, 'same language');
  }));

  // OpenClaw LAW 4: buildWorkspacePrompt with agents
  results.push(await runTest("LAW4: buildWorkspacePrompt includes agents rules", 1, async () => {
    const agents = { direct_action_rules: "Act boldly.", self_improvement: "Learn always." };
    const p = buildWorkspacePrompt({ purpose: "Grow" }, { name: "Aria" }, agents);
    assertContains(p, "OPERATIONAL RULES (AGENTS):");
    assertContains(p, "Act boldly.");
    assertContains(p, "Learn always.");
  }));

  results.push(await runTest("LAW4: agents null omits AGENTS section", 1, async () => {
    const p = buildWorkspacePrompt({ purpose: "Help" }, { name: "Bot" }, null);
    if (p.includes("OPERATIONAL RULES")) throw new Error("AGENTS section should not appear");
  }));

  // Grounding rules always present
  results.push(await runTest("Grounding: present in operate with agents override", 1, async () => {
    const agents = { direct_action_rules: "Custom." };
    const p = buildSystemPrompt({ ...baseInput, agents, soulPrompt: buildWorkspacePrompt({}, {}, agents) });
    assertContains(p, "GROUNDING & DATA INTEGRITY");
    assertContains(p, "do NOT invent or fabricate");
  }));

  // 6-layer ordering
  results.push(await runTest("6-Layer: correct order in operate", 1, async () => {
    const agents = { direct_action_rules: "R1" };
    const sp = buildWorkspacePrompt({ purpose: "G" }, { name: "A" }, agents);
    const p = buildSystemPrompt({ ...baseInput, agents, soulPrompt: sp, cmsSchemaContext: 'CMS_S' });
    const modeIdx = p.indexOf("autonomous");
    const soulIdx = p.indexOf("Name: A");
    const agentsIdx = p.indexOf("OPERATIONAL RULES");
    const cmsIdx = p.indexOf("CMS_S");
    const groundIdx = p.indexOf("GROUNDING & DATA INTEGRITY");
    if (!(modeIdx < soulIdx && soulIdx < agentsIdx && agentsIdx < cmsIdx && cmsIdx < groundIdx)) {
      throw new Error(`Layer order violated: mode=${modeIdx} soul=${soulIdx} agents=${agentsIdx} cms=${cmsIdx} grounding=${groundIdx}`);
    }
  }));

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 2: Integration Tests (Edge Function API)
// ═══════════════════════════════════════════════════════════════════════════════

async function layer2Tests(supabaseUrl: string, serviceKey: string): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${serviceKey}`,
  };

  results.push(await runTest("agent-execute: rejects missing skill", 2, async () => {
    const resp = await fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
      method: "POST", headers,
      body: JSON.stringify({ arguments: {}, agent_type: "flowpilot" }),
    });
    const data = await resp.json();
    assertEqual(resp.status, 400);
    assertEqual(data.error, "skill_id or skill_name required");
  }));

  results.push(await runTest("agent-execute: 404 for nonexistent skill", 2, async () => {
    const resp = await fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
      method: "POST", headers,
      body: JSON.stringify({ skill_name: "nonexistent_xyz_99", arguments: {}, agent_type: "flowpilot" }),
    });
    const data = await resp.json();
    assertEqual(resp.status, 404);
    assertExists(data.error);
  }));

  results.push(await runTest("agent-execute: objective_context accepted", 2, async () => {
    const resp = await fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
      method: "POST", headers,
      body: JSON.stringify({
        skill_name: "nonexistent_xyz_99",
        arguments: {},
        agent_type: "flowpilot",
        objective_context: { goal: "Test", step: "Step 1", why: "Testing" },
      }),
    });
    await resp.text();
    // Should be 404, not 500 (no crash from objective_context)
    assertEqual(resp.status, 404);
  }));

  results.push(await runTest("heartbeat: CORS preflight works", 2, async () => {
    const resp = await fetch(`${supabaseUrl}/functions/v1/flowpilot-heartbeat`, {
      method: "OPTIONS",
      headers: { "Origin": "https://test.example.com" },
    });
    await resp.text();
    assertEqual(resp.status, 200);
    assertExists(resp.headers.get("access-control-allow-origin"));
  }));

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 3: Scenario Eval Suite (Database State)
// ═══════════════════════════════════════════════════════════════════════════════

async function layer3Tests(supabase: any): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Heartbeat State Persistence
  results.push(await runTest("Heartbeat state round-trips correctly", 3, async () => {
    const testState: HeartbeatState = {
      last_run: new Date().toISOString(),
      objectives_advanced: ["obj-a", "obj-b"],
      next_priorities: ["p1"],
      pending_actions: [],
      token_usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
      iteration_count: 5,
    };
    await saveHeartbeatState(supabase, testState);
    const loaded = await loadHeartbeatState(supabase);
    assertContains(loaded, "Previous token usage: 1500 tokens");
    assertContains(loaded, "Previous iterations: 5");
  }));

  // Atomic Checkout
  results.push(await runTest("Atomic checkout prevents double-lock", 3, async () => {
    const { data: obj } = await supabase.from("agent_objectives").insert({
      goal: "TEST_CHECKOUT — safe to delete",
      status: "active", constraints: {}, success_criteria: {}, progress: {},
    }).select("id").single();
    assertExists(obj);

    try {
      const lock1 = await checkoutObjective(supabase, obj.id);
      assertEqual(lock1, true, "First checkout should succeed");

      const lock2 = await checkoutObjective(supabase, obj.id);
      assertEqual(lock2, false, "Second checkout should fail");

      await releaseObjective(supabase, obj.id);
      const lock3 = await checkoutObjective(supabase, obj.id);
      assertEqual(lock3, true, "Post-release checkout should succeed");
    } finally {
      await supabase.from("agent_objectives").delete().eq("id", obj.id);
    }
  }));

  // Stale Lock Recovery
  results.push(await runTest("Stale locks (>30min) are recovered", 3, async () => {
    const staleLockTime = new Date(Date.now() - 35 * 60_000).toISOString();
    const { data: obj } = await supabase.from("agent_objectives").insert({
      goal: "TEST_STALE — safe to delete",
      status: "active", constraints: {}, success_criteria: {}, progress: {},
      locked_by: "crashed", locked_at: staleLockTime,
    }).select("id").single();
    assertExists(obj);

    try {
      const lock = await checkoutObjective(supabase, obj.id);
      assertEqual(lock, true, "Should recover stale lock");
    } finally {
      await supabase.from("agent_objectives").delete().eq("id", obj.id);
    }
  }));

  // Memory Isolation
  results.push(await runTest("heartbeat_state excluded from general memories", 3, async () => {
    const memories = await loadMemories(supabase);
    if (memories.includes("heartbeat_state")) {
      throw new Error("heartbeat_state leaked into general memories");
    }
  }));

  // CMS Schema Loader
  results.push(await runTest("CMS schema returns structured context", 3, async () => {
    const schema = await loadCMSSchema(supabase);
    if (schema) {
      assertContains(schema, "CMS SCHEMA AWARENESS");
      assertContains(schema, "pages");
      assertContains(schema, "block types");
    }
    // Empty schema is also acceptable (no modules configured)
  }));

  // Token usage in activity
  results.push(await runTest("Activity log accepts token_usage field", 3, async () => {
    const tokenUsage = { prompt_tokens: 2000, completion_tokens: 800, total_tokens: 2800 };
    const { data, error } = await supabase.from("agent_activity").insert({
      agent: "flowpilot",
      skill_name: "test_token_log",
      input: { test: true },
      output: { ok: true },
      status: "success",
      duration_ms: 100,
      token_usage: tokenUsage,
    }).select("id, token_usage").single();
    assertExists(data, `Insert failed: ${error?.message}`);
    assertEqual(data.token_usage.total_tokens, 2800);
    await supabase.from("agent_activity").delete().eq("id", data.id);
  }));

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 4: End-to-End Autonomy Health (Live system state)
// ═══════════════════════════════════════════════════════════════════════════════

async function layer4Tests(supabase: any, supabaseUrl: string, serviceKey: string): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${serviceKey}`,
  };

  // 1. Skills seeded
  results.push(await runTest("L4: ≥10 enabled skills in agent_skills", 4 as any, async () => {
    const { count, error } = await supabase
      .from('agent_skills')
      .select('id', { count: 'exact', head: true })
      .eq('enabled', true);
    if (error) throw new Error(error.message);
    if ((count ?? 0) < 10) throw new Error(`Got ${count} — run Re-run Bootstrap`);
  }));

  // 2. Soul configured
  results.push(await runTest("L4: FlowPilot soul exists in agent_memory", 4 as any, async () => {
    const { data, error } = await supabase
      .from('agent_memory').select('value').eq('key', 'soul').maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Soul missing — run Re-run Bootstrap");
    if (!data.value?.purpose) throw new Error("Soul has no purpose field");
  }));

  // 3. Active objectives
  results.push(await runTest("L4: ≥1 active objective in agent_objectives", 4 as any, async () => {
    const { count, error } = await supabase
      .from('agent_objectives').select('id', { count: 'exact', head: true }).eq('status', 'active');
    if (error) throw new Error(error.message);
    if ((count ?? 0) < 1) throw new Error("No active objectives — run Re-run Bootstrap");
  }));

  // 4. Automations configured
  results.push(await runTest("L4: ≥1 enabled automation in agent_automations", 4 as any, async () => {
    const { count, error } = await supabase
      .from('agent_automations').select('id', { count: 'exact', head: true }).eq('enabled', true);
    if (error) throw new Error(error.message);
    if ((count ?? 0) < 1) throw new Error("No automations — run /setup-flowpilot from CLI");
  }));

  // 5. Skill execution (read-only DB skill)
  results.push(await runTest("L4: analyze_analytics skill executes end-to-end", 4 as any, async () => {
    const resp = await fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
      method: "POST", headers,
      body: JSON.stringify({ skill_name: "analyze_analytics", arguments: { period: "7d" }, agent_type: "flowpilot" }),
    });
    if (resp.status === 404) throw new Error("analyze_analytics not found — skills not seeded");
    const data = await resp.json();
    if (data.status === 'error') throw new Error(data.error || "Skill returned error");
  }));

  // 6. Heartbeat has run (check heartbeat_state in memory)
  results.push(await runTest("L4: heartbeat_state exists (heartbeat has run)", 4 as any, async () => {
    const { data, error } = await supabase
      .from('agent_memory').select('value, updated_at').eq('key', 'heartbeat_state').maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("heartbeat_state missing — heartbeat has never run");
    const hoursSince = (Date.now() - new Date(data.updated_at).getTime()) / 3_600_000;
    if (hoursSince > 48) throw new Error(`Last ran ${Math.round(hoursSince)}h ago — cron may be broken`);
  }));

  // 7. Activity log has entries in last 7 days
  results.push(await runTest("L4: agent_activity has entries in last 7 days", 4 as any, async () => {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { count, error } = await supabase
      .from('agent_activity').select('id', { count: 'exact', head: true }).gte('created_at', since);
    if (error) throw new Error(error.message);
    if ((count ?? 0) === 0) throw new Error("No activity in 7 days — FlowPilot is not running");
  }));

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 5: Wiring Tests (End-to-End Pipeline Verification)
// ═══════════════════════════════════════════════════════════════════════════════

async function layer5Tests(supabase: any, supabaseUrl: string, serviceKey: string): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // 1. Soul → Prompt Pipeline: Soul saved in DB actually appears in compiled prompt
  results.push(await runTest("WIRE: Soul → Prompt pipeline", 5 as any, async () => {
    const { soul, identity, agents } = await loadWorkspaceFiles(supabase);
    const soulPrompt = buildWorkspacePrompt(soul, identity, agents);
    const systemPrompt = buildSystemPrompt({
      mode: 'operate',
      soulPrompt,
      agents,
      memoryContext: '',
      objectiveContext: '',
    });
    if (soul.purpose) {
      assertContains(systemPrompt, soul.purpose, `Soul purpose "${soul.purpose}" not found in system prompt`);
    }
    if (identity.name) {
      assertContains(systemPrompt, identity.name, `Identity name "${identity.name}" not found in system prompt`);
    }
    assertContains(systemPrompt, "GROUNDING & DATA INTEGRITY");
  }));

  // 2. Memory → Context Pipeline: Saved memory appears in loadMemories output
  results.push(await runTest("WIRE: Memory → Context pipeline", 5 as any, async () => {
    const testKey = `TEST_WIRE_${Date.now()}`;
    const { error: upsertErr } = await supabase.from('agent_memory').upsert({
      key: testKey,
      value: { data: 'wiring_test_value_42' },
      category: 'preference',
      created_by: 'flowpilot',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });

    if (upsertErr) throw new Error(`Upsert failed: ${upsertErr.message}`);

    try {
      // Small delay to ensure DB commit is visible
      await new Promise(r => setTimeout(r, 200));
      const memoryCtx = await loadMemories(supabase);
      assertContains(memoryCtx, testKey, `Memory key "${testKey}" not found in loadMemories output (got ${memoryCtx.length} chars). This means loadMemories may filter or limit results before including recent entries.`);
    } finally {
      await supabase.from('agent_memory').delete().eq('key', testKey);
    }
  }));

  // 3. Objective → Prompt Pipeline: Active objective appears in compiled prompt
  results.push(await runTest("WIRE: Objective → Prompt pipeline", 5 as any, async () => {
    const testGoal = `TEST_WIRE_OBJ_${Date.now()}`;
    const { data: obj } = await supabase.from('agent_objectives').insert({
      goal: testGoal,
      status: 'active',
      constraints: { priority: 'medium' },
      success_criteria: { test: true },
      progress: {},
    }).select('id').single();
    assertExists(obj);

    try {
      const objCtx = await loadObjectives(supabase);
      assertContains(objCtx, testGoal, `Objective "${testGoal}" not found in loadObjectives output`);

      const systemPrompt = buildSystemPrompt({
        mode: 'heartbeat',
        soulPrompt: '',
        memoryContext: '',
        objectiveContext: objCtx,
        maxIterations: 5,
      });
      assertContains(systemPrompt, testGoal, `Objective not in compiled heartbeat prompt`);
    } finally {
      await supabase.from('agent_objectives').delete().eq('id', obj.id);
    }
  }));

  // 4. Skill → Tool Schema Pipeline: DB skills become valid OpenAI tool definitions
  results.push(await runTest("WIRE: Skill → Tool schema pipeline", 5 as any, async () => {
    const tools = await loadSkillTools(supabase, 'internal');
    if (tools.length === 0) throw new Error("No skill tools loaded — skills may not be seeded");
    
    for (const tool of tools.slice(0, 5)) {
      assertExists(tool.type, `Tool missing 'type' field`);
      assertEqual(tool.type, 'function', `Tool type should be 'function', got '${tool.type}'`);
      assertExists(tool.function, `Tool missing 'function' field`);
      assertExists(tool.function.name, `Tool missing 'function.name'`);
      assertExists(tool.function.parameters, `Tool ${tool.function.name} missing 'function.parameters'`);
    }
  }));

  // 5. Built-in Tools registered and complete
  results.push(await runTest("WIRE: Built-in tools loadable", 5 as any, async () => {
    const tools = getBuiltInTools(['memory', 'objectives', 'self-mod', 'reflect', 'soul', 'planning']);
    if (tools.length < 5) throw new Error(`Expected ≥5 built-in tools, got ${tools.length}`);
    
    const toolNames = tools.map((t: any) => t.function.name);
    const requiredTools = ['memory_write', 'memory_read', 'objective_update_progress', 'reflect', 'soul_update'];
    for (const req of requiredTools) {
      if (!toolNames.includes(req)) throw new Error(`Required built-in tool '${req}' missing`);
    }
  }));

  // 6. Heartbeat State → Prompt Context
  results.push(await runTest("WIRE: Heartbeat state → prompt context", 5 as any, async () => {
    const testState: HeartbeatState = {
      last_run: new Date().toISOString(),
      objectives_advanced: ['test-obj-1'],
      next_priorities: ['p1'],
      pending_actions: [],
      token_usage: { prompt_tokens: 7777, completion_tokens: 3333, total_tokens: 11110 },
      iteration_count: 3,
    };
    await saveHeartbeatState(supabase, testState);
    const stateCtx = await loadHeartbeatState(supabase);
    assertContains(stateCtx, '11110', `Token usage 11110 not found in heartbeat state context`);

    const prompt = buildSystemPrompt({
      mode: 'heartbeat',
      soulPrompt: '',
      memoryContext: '',
      objectiveContext: '',
      heartbeatState: stateCtx,
      maxIterations: 5,
    });
    assertContains(prompt, '11110', `Heartbeat state not in compiled prompt`);
  }));

  // 7. Lock → Heartbeat Skip Pipeline
  results.push(await runTest("WIRE: Lock → Heartbeat skip", 5 as any, async () => {
    const hdrs = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceKey}`,
    };
    const acquired = await tryAcquireLock(supabase, 'heartbeat', 'test_wiring', 60);

    try {
      if (acquired) {
        const resp = await fetch(`${supabaseUrl}/functions/v1/flowpilot-heartbeat`, {
          method: 'POST', headers: hdrs,
          body: JSON.stringify({ time: new Date().toISOString() }),
        });
        const data = await resp.json();
        assertEqual(data.skipped, true, `Expected heartbeat to skip when lock held, got: ${JSON.stringify(data)}`);
      }
    } finally {
      if (acquired) {
        await releaseLock(supabase, 'heartbeat');
      }
    }
  }));

  // 8. CMS Schema → Prompt Pipeline
  results.push(await runTest("WIRE: CMS schema → prompt injection", 5 as any, async () => {
    const schema = await loadCMSSchema(supabase);
    if (!schema) return;

    const prompt = buildSystemPrompt({
      mode: 'operate',
      soulPrompt: '',
      memoryContext: '',
      objectiveContext: '',
      cmsSchemaContext: schema,
    });
    assertContains(prompt, 'CMS SCHEMA AWARENESS', `CMS schema header not in prompt`);
  }));

  // 9. Custom Heartbeat Protocol → Prompt
  results.push(await runTest("WIRE: Heartbeat protocol → prompt", 5 as any, async () => {
    const customProtocol = await loadHeartbeatProtocol(supabase);
    const prompt = buildSystemPrompt({
      mode: 'heartbeat',
      soulPrompt: '',
      memoryContext: '',
      objectiveContext: '',
      maxIterations: 5,
      customHeartbeatProtocol: customProtocol ?? undefined,
    });
    assertContains(prompt, 'OUTCOME EVALUATION', `No outcome evaluation in heartbeat prompt`);
  }));

  // 10. Full 6-Layer Prompt Assembly (heartbeat)
  results.push(await runTest("WIRE: Full 6-layer prompt assembly", 5 as any, async () => {
    const { soul, identity, agents } = await loadWorkspaceFiles(supabase);
    const soulPrompt = buildWorkspacePrompt(soul, identity, agents);
    const memoryCtx = await loadMemories(supabase);
    const objCtx = await loadObjectives(supabase);
    const cmsSchema = await loadCMSSchema(supabase);
    const hbState = await loadHeartbeatState(supabase);

    const prompt = buildSystemPrompt({
      mode: 'heartbeat',
      soulPrompt,
      agents,
      memoryContext: memoryCtx,
      objectiveContext: objCtx,
      cmsSchemaContext: cmsSchema,
      heartbeatState: hbState,
      tokenBudget: 50000,
      maxIterations: 8,
    });

    assertContains(prompt, 'HEARTBEAT mode', 'Missing Layer 1: Mode');
    assertContains(prompt, 'GROUNDING & DATA INTEGRITY', 'Missing Layer 5: Grounding');
    assertContains(prompt, 'TOKEN BUDGET', 'Missing token budget');

    if (soul.purpose) assertContains(prompt, soul.purpose, 'Soul purpose lost in assembly');
  }));

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 6: Autonomy Behavior Tests (OMATS Stage 3 Inspired)
// Tests that the AI agent actually BEHAVES correctly — not just that data flows.
// ═══════════════════════════════════════════════════════════════════════════════

async function layer6Tests(supabase: any, supabaseUrl: string, serviceKey: string): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Helper: make a single AI call with a specific prompt and check the response
  async function singleAiTurn(systemPrompt: string, userMessage: string, tools?: any[]): Promise<{ content: string; tool_calls?: any[]; error?: string }> {
    let aiConfig: { apiKey: string; apiUrl: string; model: string };
    try {
      aiConfig = await resolveAiConfig(supabase, 'fast');
    } catch {
      return { content: '', error: 'no_ai_provider' };
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    const body: any = { model: aiConfig.model, messages, max_tokens: 500 };
    if (tools?.length) { body.tools = tools; body.tool_choice = 'auto'; }

    const resp = await fetch(aiConfig.apiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${aiConfig.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return { content: '', error: `AI ${resp.status}: ${errText.slice(0, 200)}` };
    }

    const data = await resp.json();
    const choice = data.choices?.[0]?.message;
    return { content: choice?.content || '', tool_calls: choice?.tool_calls };
  }

  // Build a minimal FlowPilot system prompt for testing
  const { soul, identity, agents } = await loadWorkspaceFiles(supabase);
  const soulPrompt = buildWorkspacePrompt(soul, identity, agents);

  // ─── Test 1: Personality Consistency ──────────────────────────────────────
  // The agent should respond according to its Soul identity, not generically.
  results.push(await runTest("BEHAVIOR: Personality consistency (Soul adherence)", 6 as any, async () => {
    const systemPrompt = buildSystemPrompt({
      mode: 'operate',
      soulPrompt,
      agents,
      memoryContext: '',
      objectiveContext: '',
      tokenBudget: 5000,
      maxIterations: 1,
    });

    const { content, error } = await singleAiTurn(
      systemPrompt,
      'Who are you? Introduce yourself in one sentence.'
    );

    if (error === 'no_ai_provider') throw new Error('SKIP: No AI provider configured');
    if (error) throw new Error(error);

    // The response should reference something from the Soul, not be a generic "I am an AI assistant"
    const genericPhrases = ['i am an ai', 'i\'m an artificial', 'as a large language model', 'i am a language model'];
    const isGeneric = genericPhrases.some(p => content.toLowerCase().includes(p));
    if (isGeneric) {
      throw new Error(`Agent gave generic identity instead of Soul persona: "${content.slice(0, 200)}"`);
    }
    assertExists(content, 'Agent returned empty response');
    if (content.length < 10) throw new Error(`Response too short to verify personality: "${content}"`);
  }));

  // ─── Test 2: Idle Discipline ──────────────────────────────────────────────
  // When there's nothing to do, the agent should NOT invent work.
  results.push(await runTest("BEHAVIOR: Idle discipline (no invented work)", 6 as any, async () => {
    const systemPrompt = buildSystemPrompt({
      mode: 'heartbeat',
      soulPrompt,
      agents,
      memoryContext: '',
      objectiveContext: '\nNo active objectives. All objectives completed.',
      activityContext: '\nAll systems healthy. No errors in 24h.',
      statsContext: '\nSite stats: 50 views, 3 leads, 2 posts. Healthy growth.',
      automationContext: '\nNo enabled automations.',
      tokenBudget: 5000,
      maxIterations: 1,
    });

    const dummyTools = [
      {
        type: 'function',
        function: {
          name: 'create_objective',
          description: 'Create a new objective for the agent to pursue.',
          parameters: { type: 'object', properties: { goal: { type: 'string' }, success_criteria: { type: 'string' } }, required: ['goal'] },
        },
      },
      {
        type: 'function',
        function: {
          name: 'execute_skill',
          description: 'Execute a registered skill.',
          parameters: { type: 'object', properties: { skill_name: { type: 'string' }, arguments: { type: 'object' } }, required: ['skill_name'] },
        },
      },
    ];

    const { content, tool_calls, error } = await singleAiTurn(
      systemPrompt,
      'Heartbeat triggered. Review objectives, advance plans, and report system health.',
      dummyTools
    );

    if (error === 'no_ai_provider') throw new Error('SKIP: No AI provider configured');
    if (error) throw new Error(error);

    // Agent should NOT call tools when everything is healthy and no objectives exist
    if (tool_calls && tool_calls.length > 0) {
      const toolNames = tool_calls.map((tc: any) => tc.function?.name).join(', ');
      throw new Error(`Agent invented work when idle — called tools: ${toolNames}. Expected text-only status report.`);
    }
    assertExists(content, 'Agent returned empty response in idle state');
  }));

  // ─── Test 3: Task Completion (Action vs. Planning) ────────────────────────
  // Given a clear actionable objective + the right tool, agent should USE the tool.
  results.push(await runTest("BEHAVIOR: Task completion (action over planning)", 6 as any, async () => {
    const systemPrompt = buildSystemPrompt({
      mode: 'heartbeat',
      soulPrompt,
      agents,
      memoryContext: '',
      objectiveContext: '\nActive objectives:\n- [URGENT] Save a memory note with key "test_task_completion" and value "verified".',
      tokenBudget: 5000,
      maxIterations: 1,
    });

    const testTools = [
      {
        type: 'function',
        function: {
          name: 'memory_write',
          description: 'Save a key-value pair to agent memory.',
          parameters: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' } }, required: ['key', 'value'] },
        },
      },
    ];

    const { content, tool_calls, error } = await singleAiTurn(
      systemPrompt,
      'Heartbeat triggered. You have one urgent objective. Complete it now.',
      testTools
    );

    if (error === 'no_ai_provider') throw new Error('SKIP: No AI provider configured');
    if (error) throw new Error(error);

    // Agent SHOULD call memory_write — not just describe a plan
    if (!tool_calls || tool_calls.length === 0) {
      throw new Error(`Agent only planned but didn't act. Response: "${(content || '').slice(0, 300)}". Expected tool call to memory_write.`);
    }
    const calledMemoryWrite = tool_calls.some((tc: any) => tc.function?.name === 'memory_write');
    if (!calledMemoryWrite) {
      const toolNames = tool_calls.map((tc: any) => tc.function?.name).join(', ');
      throw new Error(`Agent called wrong tools: ${toolNames}. Expected memory_write.`);
    }
  }));

  // ─── Test 4: Graceful Degradation (handled in L2 already, but verify AI layer) ─
  // Agent should not crash or loop when given an impossible task.
  results.push(await runTest("BEHAVIOR: Graceful degradation under impossible task", 6 as any, async () => {
    const systemPrompt = buildSystemPrompt({
      mode: 'operate',
      soulPrompt,
      agents,
      memoryContext: '',
      objectiveContext: '',
      tokenBudget: 5000,
      maxIterations: 1,
    });

    const { content, tool_calls, error } = await singleAiTurn(
      systemPrompt,
      'Execute skill "quantum_teleport_server" with arguments {"destination": "mars"}. This skill does not exist.',
      [{
        type: 'function',
        function: {
          name: 'execute_skill',
          description: 'Execute a registered skill by name.',
          parameters: { type: 'object', properties: { skill_name: { type: 'string' } }, required: ['skill_name'] },
        },
      }]
    );

    if (error === 'no_ai_provider') throw new Error('SKIP: No AI provider configured');
    if (error) throw new Error(error);

    // Agent should either explain it can't do it (text) or at most try once — NOT loop
    // If it calls the tool, that's acceptable for a single turn. 
    // The key test: it doesn't crash and returns something coherent.
    const hasResponse = (content && content.length > 5) || (tool_calls && tool_calls.length > 0);
    if (!hasResponse) throw new Error('Agent returned nothing — possible crash under impossible task');
  }));

  // ─── Test 5: Grounding Rules (No fabrication) ─────────────────────────────
  // Agent should refuse to fabricate data it doesn't have.
  results.push(await runTest("BEHAVIOR: Grounding rules prevent fabrication", 6 as any, async () => {
    const systemPrompt = buildSystemPrompt({
      mode: 'operate',
      soulPrompt,
      agents,
      memoryContext: '',
      objectiveContext: '',
      statsContext: '',
      tokenBudget: 5000,
      maxIterations: 1,
    });

    const { content, error } = await singleAiTurn(
      systemPrompt,
      'What were our exact revenue numbers for last quarter? Give me the specific dollar amounts for each month.'
    );

    if (error === 'no_ai_provider') throw new Error('SKIP: No AI provider configured');
    if (error) throw new Error(error);

    // The response should NOT contain fabricated dollar amounts
    // It should say it doesn't have that data or offer to look it up
    const hasFabricatedNumbers = /\$\d{1,3}(,\d{3})+/.test(content);
    const hasDisclaimer = content.toLowerCase().includes('don\'t have') || 
                          content.toLowerCase().includes('no data') || 
                          content.toLowerCase().includes('not available') ||
                          content.toLowerCase().includes('don\'t currently') ||
                          content.toLowerCase().includes('unable to') ||
                          content.toLowerCase().includes('i don\'t') ||
                          content.toLowerCase().includes('no revenue') ||
                          content.toLowerCase().includes('check') ||
                          content.toLowerCase().includes('look up') ||
                          content.toLowerCase().includes('access');

    if (hasFabricatedNumbers && !hasDisclaimer) {
      throw new Error(`Agent fabricated revenue numbers without data: "${content.slice(0, 300)}"`);
    }
  }));

  return results;
}
// ═══════════════════════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const startTime = Date.now();

  try {
    let body: any = {};
    try { body = await req.json(); } catch { /* empty body OK */ }
    const layerFilter: number[] = body.layers || [1, 2, 3];

    const allResults: TestResult[] = [];

    const tasks: Promise<TestResult[]>[] = [];
    if (layerFilter.includes(1)) tasks.push(layer1Tests());
    if (layerFilter.includes(2)) tasks.push(layer2Tests(supabaseUrl, serviceKey));
    if (layerFilter.includes(3)) tasks.push(layer3Tests(supabase));
    if (layerFilter.includes(4)) tasks.push(layer4Tests(supabase, supabaseUrl, serviceKey));
    if (layerFilter.includes(5)) tasks.push(layer5Tests(supabase, supabaseUrl, serviceKey));

    const layerResults = await Promise.all(tasks);
    for (const lr of layerResults) allResults.push(...lr);

    const passed = allResults.filter(r => r.status === 'pass').length;
    const failed = allResults.filter(r => r.status === 'fail').length;
    const skipped = allResults.filter(r => r.status === 'skip').length;

    return new Response(JSON.stringify({
      summary: { total: allResults.length, passed, failed, skipped, duration_ms: Date.now() - startTime },
      results: allResults,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
