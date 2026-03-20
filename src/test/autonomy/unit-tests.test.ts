/**
 * Lager 1: Unit Tests — Autonomy Functions
 * 
 * Tests pure, deterministic functions from the autonomy layer:
 * - buildSystemPrompt (prompt compiler)
 * - extractTokenUsage / accumulateTokens / isOverBudget
 * - buildSoulPrompt
 * 
 * These don't need DB or network — fast and reliable.
 */
import { describe, it, expect } from "vitest";

// We re-implement the pure functions here since they live in Deno edge functions.
// This mirrors the logic from agent-reason.ts for testability.

// ─── Token Tracking ───────────────────────────────────────────────────────────

interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

function extractTokenUsage(aiData: any): TokenUsage {
  const usage = aiData.usage || {};
  return {
    prompt_tokens: usage.prompt_tokens || 0,
    completion_tokens: usage.completion_tokens || 0,
    total_tokens: (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
  };
}

function accumulateTokens(current: TokenUsage, incoming: TokenUsage): TokenUsage {
  return {
    prompt_tokens: current.prompt_tokens + incoming.prompt_tokens,
    completion_tokens: current.completion_tokens + incoming.completion_tokens,
    total_tokens: current.total_tokens + incoming.total_tokens,
  };
}

function isOverBudget(usage: TokenUsage, budget: number): boolean {
  return usage.total_tokens >= budget;
}

// ─── Soul Prompt Builder ──────────────────────────────────────────────────────

function buildSoulPrompt(soul: any, identity: any): string {
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

// ─── Prompt Compiler (simplified) ─────────────────────────────────────────────

type PromptMode = 'operate' | 'heartbeat' | 'chat';

interface PromptCompilerInput {
  mode: PromptMode;
  soulPrompt: string;
  memoryContext: string;
  objectiveContext: string;
  activityContext?: string;
  statsContext?: string;
  automationContext?: string;
  healingReport?: string;
  cmsSchemaContext?: string;
  heartbeatState?: string;
  tokenBudget?: number;
  maxIterations?: number;
  chatSystemPrompt?: string;
}

function buildSystemPrompt(input: PromptCompilerInput): string {
  const { mode, soulPrompt, memoryContext, objectiveContext } = input;

  if (mode === 'chat' && input.chatSystemPrompt) {
    return input.chatSystemPrompt;
  }

  const parts: string[] = [];

  if (mode === 'heartbeat') {
    parts.push(`You are FlowPilot running in AUTONOMOUS HEARTBEAT mode. No human is watching.`);
  } else {
    parts.push(`You are FlowPilot — an autonomous, self-improving AI agent that operates a CMS platform.`);
  }

  parts.push(soulPrompt);

  if (input.cmsSchemaContext) {
    parts.push(input.cmsSchemaContext);
  }

  // Core instructions (abbreviated for test)
  parts.push('CORE_INSTRUCTIONS');

  if (mode === 'heartbeat') {
    parts.push(`\nCONTEXT:`);
    parts.push(memoryContext);
    parts.push(objectiveContext);
    if (input.automationContext) parts.push(input.automationContext);
    if (input.activityContext) parts.push(input.activityContext);
    if (input.statsContext) parts.push(input.statsContext);
    if (input.healingReport) parts.push(input.healingReport);
    if (input.heartbeatState) parts.push(input.heartbeatState);
    if (input.tokenBudget) {
      parts.push(`\nTOKEN BUDGET: ${input.tokenBudget} tokens max. Be efficient — stop early if approaching the limit.`);
    }
    parts.push('');
    parts.push('HEARTBEAT_PROTOCOL');
    parts.push(`\n- Max ${input.maxIterations || 8} tool iterations per heartbeat`);
  } else {
    parts.push(memoryContext);
    parts.push(`\nOBJECTIVES:\n- After executing skills that contribute to an objective, update progress.\n- When all success_criteria are met, mark as complete.`);
    parts.push(objectiveContext);
  }

  return parts.filter(Boolean).join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Token Tracking", () => {
  it("extracts token usage from AI response", () => {
    const aiData = { usage: { prompt_tokens: 100, completion_tokens: 50 } };
    const result = extractTokenUsage(aiData);
    expect(result).toEqual({ prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 });
  });

  it("handles missing usage gracefully", () => {
    expect(extractTokenUsage({})).toEqual({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });
    expect(extractTokenUsage({ usage: {} })).toEqual({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });
  });

  it("accumulates tokens correctly across iterations", () => {
    const a: TokenUsage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 };
    const b: TokenUsage = { prompt_tokens: 200, completion_tokens: 80, total_tokens: 280 };
    const result = accumulateTokens(a, b);
    expect(result).toEqual({ prompt_tokens: 300, completion_tokens: 130, total_tokens: 430 });
  });

  it("accumulates from zero", () => {
    const zero: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const incoming: TokenUsage = { prompt_tokens: 500, completion_tokens: 100, total_tokens: 600 };
    expect(accumulateTokens(zero, incoming)).toEqual(incoming);
  });

  it("detects budget exceeded", () => {
    expect(isOverBudget({ prompt_tokens: 40000, completion_tokens: 10000, total_tokens: 50000 }, 50000)).toBe(true);
    expect(isOverBudget({ prompt_tokens: 40000, completion_tokens: 10001, total_tokens: 50001 }, 50000)).toBe(true);
  });

  it("allows within budget", () => {
    expect(isOverBudget({ prompt_tokens: 30000, completion_tokens: 10000, total_tokens: 40000 }, 50000)).toBe(false);
    expect(isOverBudget({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, 50000)).toBe(false);
  });
});

describe("Soul Prompt Builder", () => {
  it("builds prompt with full soul and identity", () => {
    const soul = { purpose: "Help grow the business", values: ["Honesty", "Growth"], tone: "professional", philosophy: "Always add value" };
    const identity = { name: "Aria", role: "Digital consultant", capabilities: ["SEO", "Content"], boundaries: ["No spam"] };
    const prompt = buildSoulPrompt(soul, identity);

    expect(prompt).toContain("Name: Aria");
    expect(prompt).toContain("Role: Digital consultant");
    expect(prompt).toContain("Capabilities: SEO, Content");
    expect(prompt).toContain("Boundaries: No spam");
    expect(prompt).toContain("Purpose: Help grow the business");
    expect(prompt).toContain("Values: Honesty; Growth");
    expect(prompt).toContain("Tone: professional");
    expect(prompt).toContain("Philosophy: Always add value");
  });

  it("uses defaults for missing identity fields", () => {
    const prompt = buildSoulPrompt({}, { name: null, role: null });
    // No identity or soul sections when empty
    expect(prompt).toBe('');
  });

  it("handles partial soul", () => {
    const prompt = buildSoulPrompt({ purpose: "Grow traffic" }, {});
    expect(prompt).toContain("Purpose: Grow traffic");
    expect(prompt).not.toContain("IDENTITY");
  });
});

describe("Prompt Compiler (buildSystemPrompt)", () => {
  const baseInput: PromptCompilerInput = {
    mode: 'operate',
    soulPrompt: 'SOUL: Test',
    memoryContext: 'MEMORY: user likes blue',
    objectiveContext: 'OBJ: Grow traffic by 20%',
  };

  it("operates mode includes objectives section", () => {
    const prompt = buildSystemPrompt(baseInput);
    expect(prompt).toContain("autonomous, self-improving AI agent");
    expect(prompt).toContain("SOUL: Test");
    expect(prompt).toContain("MEMORY: user likes blue");
    expect(prompt).toContain("OBJECTIVES:");
    expect(prompt).toContain("OBJ: Grow traffic by 20%");
    expect(prompt).not.toContain("HEARTBEAT");
  });

  it("heartbeat mode includes protocol and context", () => {
    const prompt = buildSystemPrompt({
      ...baseInput,
      mode: 'heartbeat',
      activityContext: 'Recent: blog post created',
      statsContext: 'Views: 500',
      automationContext: 'Cron: daily-report',
      maxIterations: 5,
    });
    expect(prompt).toContain("AUTONOMOUS HEARTBEAT mode");
    expect(prompt).toContain("CONTEXT:");
    expect(prompt).toContain("Recent: blog post created");
    expect(prompt).toContain("Views: 500");
    expect(prompt).toContain("Cron: daily-report");
    expect(prompt).toContain("HEARTBEAT_PROTOCOL");
    expect(prompt).toContain("Max 5 tool iterations");
  });

  it("injects CMS schema when provided", () => {
    const prompt = buildSystemPrompt({
      ...baseInput,
      cmsSchemaContext: 'CMS: 10 pages, 5 products, Stripe active',
    });
    expect(prompt).toContain("CMS: 10 pages, 5 products, Stripe active");
  });

  it("injects heartbeat state in heartbeat mode", () => {
    const prompt = buildSystemPrompt({
      ...baseInput,
      mode: 'heartbeat',
      heartbeatState: 'Last run: 2026-03-14, 3 objectives advanced',
    });
    expect(prompt).toContain("Last run: 2026-03-14, 3 objectives advanced");
  });

  it("includes token budget warning in heartbeat mode", () => {
    const prompt = buildSystemPrompt({
      ...baseInput,
      mode: 'heartbeat',
      tokenBudget: 50000,
    });
    expect(prompt).toContain("TOKEN BUDGET: 50000 tokens max");
  });

  it("chat mode uses chatSystemPrompt as base layer", () => {
    const prompt = buildSystemPrompt({
      ...baseInput,
      mode: 'chat',
      chatSystemPrompt: 'You are a helpful assistant.',
    });
    expect(prompt).toContain('You are a helpful assistant.');
    // Chat mode now adds soul + grounding layers on top
    expect(prompt).toContain('SOUL: Test');
  });

  it("does not leak heartbeat state into operate mode", () => {
    const prompt = buildSystemPrompt({
      ...baseInput,
      mode: 'operate',
      heartbeatState: 'SHOULD NOT APPEAR',
    });
    expect(prompt).not.toContain("SHOULD NOT APPEAR");
  });
});
