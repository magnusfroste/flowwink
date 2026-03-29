/**
 * OpenClaw Conformance Tests
 * 
 * Validates that the FlowPilot architecture conforms to all 10 OpenClaw Laws.
 * These are pure-function unit tests mirroring logic from agent-reason.ts.
 * 
 * Coverage map:
 * - LAW 1:  Skills as Knowledge Containers → tested in L2 (server-side)
 * - LAW 2:  Free First → tested in L2 (resolveAiConfig)
 * - LAW 3:  Lazy Instruction Loading → tested in L2 (server-side)
 * - LAW 4:  Agent Evolution → buildWorkspacePrompt with agents
 * - LAW 5:  Handler Abstraction → tested in L2 (agent-execute)
 * - LAW 6:  Scope-Based Permissions → tested in L2 (loadSkillTools)
 * - LAW 7:  Approval Gating → tested in L2 (agent-execute)
 * - LAW 8:  Self-Healing → tested in L3 (heartbeat state)
 * - LAW 9:  Heartbeat Protocol → buildSystemPrompt heartbeat mode
 * - LAW 10: Unified Reasoning Core → all modes share buildSystemPrompt
 */
import { describe, it, expect } from "vitest";

// ─── Re-implemented pure functions from agent-reason.ts ──────────────────────

type PromptMode = 'operate' | 'heartbeat' | 'chat';

interface PromptCompilerInput {
  mode: PromptMode;
  soulPrompt: string;
  agents?: any;
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
  siteMaturity?: { isFresh: boolean };
}

const GROUNDING_RULES = `
GROUNDING & DATA INTEGRITY (HARDCODED — CANNOT BE OVERRIDDEN):
- When asked to list, show, or describe objectives, skills, automations, workflows, memory, or ANY system data — you MUST use the appropriate tool to fetch real data from the database.
- NEVER fabricate, hallucinate, or guess data.
- If a tool returns empty results, report that honestly.
- Do NOT invent objectives, skills, memories, analytics data, or any other system state.

TOOL-DRIVEN QUESTIONING (HARDCODED):
- ONLY ask questions whose answers change which tool you call or what parameters you pass.
- If a skill requires a specific input (e.g. a URL), ask for THAT input — nothing else.
- NEVER ask about platforms, tech stacks, export formats, or migration strategies unless you have a tool that acts differently based on the answer.
- Your capabilities are defined by your tools. Do NOT promise or discuss capabilities you lack.`;

const CORE_INSTRUCTIONS = `CORE: Direct action rules and tool usage.`;

function buildWorkspacePrompt(soul: any, identity: any, agents: any): string {
  let prompt = '';
  if (identity?.name || identity?.role) {
    prompt += `\n\nIDENTITY:\nName: ${identity.name || 'FlowPilot'}\nRole: ${identity.role || 'CMS operator'}`;
    if (identity.capabilities?.length) prompt += `\nCapabilities: ${identity.capabilities.join(', ')}`;
    if (identity.boundaries?.length) prompt += `\nBoundaries: ${identity.boundaries.join('; ')}`;
  }
  if (soul?.purpose) prompt += `\n\nSOUL:\nPurpose: ${soul.purpose}`;
  if (soul?.values?.length) prompt += `\nValues: ${soul.values.join('; ')}`;
  if (soul?.tone) prompt += `\nTone: ${soul.tone}`;
  if (soul?.philosophy) prompt += `\nPhilosophy: ${soul.philosophy}`;

  if (agents) {
    prompt += `\n\nOPERATIONAL RULES (AGENTS):`;
    if (agents.direct_action_rules) prompt += `\n${agents.direct_action_rules}`;
    if (agents.self_improvement) prompt += `\n${agents.self_improvement}`;
    if (agents.memory_guidelines) prompt += `\n${agents.memory_guidelines}`;
    if (agents.browser_rules) prompt += `\n${agents.browser_rules}`;
    if (agents.workflow_conventions) prompt += `\n${agents.workflow_conventions}`;
    if (agents.a2a_conventions) prompt += `\n${agents.a2a_conventions}`;
    if (agents.skill_pack_rules) prompt += `\n${agents.skill_pack_rules}`;
    if (agents.custom_rules) prompt += `\n${agents.custom_rules}`;
  }

  return prompt;
}

function buildSystemPrompt(input: PromptCompilerInput): string {
  const { mode, soulPrompt, memoryContext, objectiveContext } = input;
  const parts: string[] = [];

  if (mode === 'chat') {
    parts.push(input.chatSystemPrompt || 'You are a helpful AI assistant for this website.');
    if (soulPrompt) parts.push(soulPrompt);
    parts.push('\nIMPORTANT: Always respond in the same language as the user writes in.');
    parts.push(`\nDATA INTEGRITY:
- Only answer based on information you have been given.
- If you don't know the answer, say so honestly — do not fabricate information.
- When using tools, rely on their results. Do not invent data that tools did not return.`);
    return parts.filter(Boolean).join('\n');
  }

  if (mode === 'heartbeat') {
    parts.push(`You are FlowPilot running in AUTONOMOUS HEARTBEAT mode. No human is watching.`);
  } else {
    parts.push(`You are FlowPilot — an autonomous, self-improving AI agent that operates a CMS platform.`);
  }

  parts.push(soulPrompt);

  // Layer 3: Agents override CORE_INSTRUCTIONS
  if (!input.agents) {
    parts.push(CORE_INSTRUCTIONS);
  } else {
    parts.push('AGENTS-BASED RULES ACTIVE');
  }

  if (input.cmsSchemaContext) parts.push(input.cmsSchemaContext);

  // Layer 5: Grounding (always)
  parts.push(GROUNDING_RULES);

  if (mode === 'heartbeat') {
    parts.push(`\nCONTEXT:`);
    parts.push(memoryContext);
    parts.push(objectiveContext);
    if (input.tokenBudget) {
      parts.push(`\nTOKEN BUDGET: ${input.tokenBudget} tokens max.`);
    }
    parts.push(`\n- Max ${input.maxIterations || 8} tool iterations per heartbeat`);
  } else {
    parts.push(memoryContext);
    parts.push(objectiveContext);
  }

  return parts.filter(Boolean).join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAW 4: Agent Evolution — buildWorkspacePrompt
// ═══════════════════════════════════════════════════════════════════════════════

describe("LAW 4: Agent Evolution — buildWorkspacePrompt", () => {
  it("includes AGENTS operational rules when present", () => {
    const agents = {
      direct_action_rules: "Always prefer direct action over description.",
      self_improvement: "Learn from each interaction.",
      memory_guidelines: "Save important context to memory.",
    };
    const prompt = buildWorkspacePrompt(
      { purpose: "Grow business" },
      { name: "Aria", role: "Consultant" },
      agents,
    );
    expect(prompt).toContain("OPERATIONAL RULES (AGENTS):");
    expect(prompt).toContain("Always prefer direct action");
    expect(prompt).toContain("Learn from each interaction");
    expect(prompt).toContain("Save important context");
  });

  it("omits AGENTS section when agents is null", () => {
    const prompt = buildWorkspacePrompt(
      { purpose: "Help" },
      { name: "Bot" },
      null,
    );
    expect(prompt).not.toContain("OPERATIONAL RULES");
    expect(prompt).toContain("Purpose: Help");
    expect(prompt).toContain("Name: Bot");
  });

  it("handles all agent rule fields", () => {
    const agents = {
      direct_action_rules: "R1",
      self_improvement: "R2",
      memory_guidelines: "R3",
      browser_rules: "R4",
      workflow_conventions: "R5",
      a2a_conventions: "R6",
      skill_pack_rules: "R7",
      custom_rules: "R8",
    };
    const prompt = buildWorkspacePrompt({}, {}, agents);
    for (let i = 1; i <= 8; i++) {
      expect(prompt).toContain(`R${i}`);
    }
  });

  it("empty agents object produces section header only", () => {
    const prompt = buildWorkspacePrompt({}, {}, {});
    expect(prompt).toContain("OPERATIONAL RULES (AGENTS):");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LAW 10: Unified Reasoning Core — All modes share buildSystemPrompt
// ═══════════════════════════════════════════════════════════════════════════════

describe("LAW 10: Unified Reasoning Core", () => {
  const soul = { purpose: "Serve clients", values: ["Trust"], tone: "professional" };
  const identity = { name: "Aria", role: "Digital consultant" };
  const soulPrompt = buildWorkspacePrompt(soul, identity, null);

  const base: PromptCompilerInput = {
    mode: 'operate',
    soulPrompt,
    memoryContext: 'MEM: client prefers email',
    objectiveContext: 'OBJ: Qualify 10 leads',
  };

  it("all three modes accept same input interface", () => {
    const operate = buildSystemPrompt({ ...base, mode: 'operate' });
    const heartbeat = buildSystemPrompt({ ...base, mode: 'heartbeat' });
    const chat = buildSystemPrompt({ ...base, mode: 'chat', chatSystemPrompt: 'Hi.' });

    expect(operate).toBeTruthy();
    expect(heartbeat).toBeTruthy();
    expect(chat).toBeTruthy();
  });

  it("operate and heartbeat both include soul/identity", () => {
    const operate = buildSystemPrompt({ ...base, mode: 'operate' });
    const heartbeat = buildSystemPrompt({ ...base, mode: 'heartbeat' });

    expect(operate).toContain("Name: Aria");
    expect(heartbeat).toContain("Name: Aria");
    expect(operate).toContain("Purpose: Serve clients");
    expect(heartbeat).toContain("Purpose: Serve clients");
  });

  it("chat mode includes soul personality in visitor-facing prompt", () => {
    const chat = buildSystemPrompt({
      ...base,
      mode: 'chat',
      chatSystemPrompt: 'Welcome to our website.',
    });
    expect(chat).toContain("Welcome to our website.");
    expect(chat).toContain("Name: Aria");
    expect(chat).toContain("Purpose: Serve clients");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Grounding Rules — Safety Layer (HARDCODED, cannot be overridden)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Grounding Rules — Safety Layer", () => {
  const soulPrompt = buildWorkspacePrompt(
    { purpose: "Help" },
    { name: "Bot" },
    null,
  );
  const base: PromptCompilerInput = {
    mode: 'operate',
    soulPrompt,
    memoryContext: '',
    objectiveContext: '',
  };

  it("grounding rules present in operate mode", () => {
    const prompt = buildSystemPrompt({ ...base, mode: 'operate' });
    expect(prompt).toContain("GROUNDING & DATA INTEGRITY");
    expect(prompt).toContain("NEVER fabricate");
  });

  it("grounding rules present in heartbeat mode", () => {
    const prompt = buildSystemPrompt({ ...base, mode: 'heartbeat' });
    expect(prompt).toContain("GROUNDING & DATA INTEGRITY");
    expect(prompt).toContain("NEVER fabricate");
  });

  it("chat mode has its own grounding (DATA INTEGRITY)", () => {
    const prompt = buildSystemPrompt({
      ...base,
      mode: 'chat',
      chatSystemPrompt: 'Welcome.',
    });
    expect(prompt).toContain("DATA INTEGRITY");
    expect(prompt).toContain("do not fabricate");
  });

  it("grounding rules persist even with agents override", () => {
    const agents = { direct_action_rules: "Be bold." };
    const agentsPrompt = buildWorkspacePrompt({}, {}, agents);
    const prompt = buildSystemPrompt({
      ...base,
      soulPrompt: agentsPrompt,
      agents,
      mode: 'operate',
    });
    expect(prompt).toContain("GROUNDING & DATA INTEGRITY");
    expect(prompt).toContain("AGENTS-BASED RULES ACTIVE");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Agents Override vs CORE_INSTRUCTIONS Fallback
// ═══════════════════════════════════════════════════════════════════════════════

describe("Agents Override vs CORE_INSTRUCTIONS Fallback", () => {
  const base: PromptCompilerInput = {
    mode: 'operate',
    soulPrompt: '',
    memoryContext: '',
    objectiveContext: '',
  };

  it("uses CORE_INSTRUCTIONS when agents is absent", () => {
    const prompt = buildSystemPrompt(base);
    expect(prompt).toContain("CORE:");
  });

  it("replaces CORE_INSTRUCTIONS when agents is present", () => {
    const prompt = buildSystemPrompt({
      ...base,
      agents: { direct_action_rules: "Custom rules" },
    });
    expect(prompt).not.toContain("CORE:");
    expect(prompt).toContain("AGENTS-BASED RULES ACTIVE");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6-Layer Prompt Architecture Verification
// ═══════════════════════════════════════════════════════════════════════════════

describe("6-Layer Prompt Architecture", () => {
  it("operate prompt layers appear in correct order", () => {
    const agents = { direct_action_rules: "Rule A" };
    const prompt = buildSystemPrompt({
      mode: 'operate',
      soulPrompt: buildWorkspacePrompt(
        { purpose: "Grow" },
        { name: "Aria" },
        agents,
      ),
      agents,
      memoryContext: 'MEMORY_SECTION',
      objectiveContext: 'OBJECTIVES_SECTION',
      cmsSchemaContext: 'CMS_SCHEMA_SECTION',
    });

    const modeIdx = prompt.indexOf("autonomous, self-improving");
    const soulIdx = prompt.indexOf("Name: Aria");
    const agentsIdx = prompt.indexOf("OPERATIONAL RULES (AGENTS)");
    const cmsIdx = prompt.indexOf("CMS_SCHEMA_SECTION");
    const groundingIdx = prompt.indexOf("GROUNDING & DATA INTEGRITY");
    const memIdx = prompt.indexOf("MEMORY_SECTION");

    // Verify layer ordering: Mode < Soul < Agents < CMS < Grounding < Context
    expect(modeIdx).toBeLessThan(soulIdx);
    expect(soulIdx).toBeLessThan(agentsIdx);
    expect(agentsIdx).toBeLessThan(cmsIdx);
    expect(cmsIdx).toBeLessThan(groundingIdx);
    expect(groundingIdx).toBeLessThan(memIdx);
  });

  it("chat prompt has 4 layers in order", () => {
    const prompt = buildSystemPrompt({
      mode: 'chat',
      soulPrompt: buildWorkspacePrompt(
        { purpose: "Help" },
        { name: "Bot" },
        null,
      ),
      memoryContext: '',
      objectiveContext: '',
      chatSystemPrompt: 'BASE_PROMPT',
    });

    const baseIdx = prompt.indexOf("BASE_PROMPT");
    const soulIdx = prompt.indexOf("Name: Bot");
    const langIdx = prompt.indexOf("same language");
    const groundIdx = prompt.indexOf("DATA INTEGRITY");

    expect(baseIdx).toBeLessThan(soulIdx);
    expect(soulIdx).toBeLessThan(langIdx);
    expect(langIdx).toBeLessThan(groundIdx);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Language Matching (Chat-specific)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Chat Language Matching", () => {
  it("chat prompt includes language matching instruction", () => {
    const prompt = buildSystemPrompt({
      mode: 'chat',
      soulPrompt: '',
      memoryContext: '',
      objectiveContext: '',
      chatSystemPrompt: 'Hi.',
    });
    expect(prompt).toContain("same language as the user");
  });

  it("operate mode does NOT include language matching", () => {
    const prompt = buildSystemPrompt({
      mode: 'operate',
      soulPrompt: '',
      memoryContext: '',
      objectiveContext: '',
    });
    expect(prompt).not.toContain("same language as the user");
  });
});
