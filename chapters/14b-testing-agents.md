---
title: "Testing Agentic Systems"
description: "How to test agents — skills, memory, A2A, drift, and the QA practices that traditional software testing doesn't cover."
order: 27
icon: "beaker"
---

# Testing Agentic Systems

> **You wouldn't deploy a web app without tests. You shouldn't deploy an agent without them either. But testing an agent is fundamentally different from testing software — the output is non-deterministic, the state space is enormous, and "correct" is often a judgment call.**
>
> FlowWink validates FlowPilot through **OMATS** — the OpenClaw Multi-Agent Testing Standard. Six layers of testing, from pure functions to full behavioral validation, with OpenClaw itself serving as an external QA peer. This chapter describes that framework and how to apply it to any agentic system.

---

## 2026 Context: Evaluation Is Moving Fast

The field is converging on a new baseline: agent quality must be measured with agent-native methods, not only classic pass/fail tests.

Three visible trends in 2026:

1. **Trace-first evaluation** — systems score full agent traces (reasoning, tool calls, recovery), not only final outputs
2. **MCP tool-use benchmarks** — evaluations increasingly test real tool orchestration across MCP servers
3. **Runtime governance requirements** — teams now treat policy enforcement, auditability, and safety boundaries as part of test scope

Flowwink's approach aligns with this shift but adds a practical extension: **evaluation must close the loop into remediation.** Findings should become objectives, objectives should produce fixes, and fixes should be verified in subsequent cycles.

That is the difference between "we measured quality" and "we improved quality."

## Why Agent Testing Is Hard

Traditional software testing relies on determinism: given input X, the function returns Y. Always.

Agentic systems force a different mindset: quality is a system behavior over time, not a single test result. That is why testing and governance sit together in this handbook — one without the other does not hold in production.

An agent given the same input might:
- Choose different tools
- Reason through a different path
- Produce different (but equally valid) output
- Behave differently depending on what's in memory

This doesn't mean agents can't be tested. It means the testing strategy must shift from **exact output matching** to **behavioral contracts and invariant checking.**

---

## OMATS: The OpenClaw Multi-Agent Testing Standard

FlowWink's testing framework — developed in collaboration with the OpenClaw architecture — organizes tests into six layers of increasing realism and complexity. All tests run server-side via edge functions, meaning no local dev environment is needed.

| Layer | Name | What It Tests | Dependencies | Speed |
|-------|------|---------------|--------------|-------|
| **L1** | Unit | Pure functions from `agent-reason.ts` — prompt builders, token math, formatters | None | ⚡ Instant |
| **L2** | Integration | Edge function HTTP endpoints — skill routing, handler resolution, API contracts | `SUPABASE_SERVICE_ROLE_KEY` | 🚀 Fast |
| **L3** | Scenario | Database state, persistence, atomicity — RLS policies, locking, triggers | `SUPABASE_SERVICE_ROLE_KEY` | 🚀 Fast |
| **L4** | Autonomy Health | Live system: skills seeded, soul present, objectives reachable | `SUPABASE_SERVICE_ROLE_KEY` | ⏱️ Minutes |
| **L5** | Wiring | End-to-end data flow: soul→prompt, memory→context, skill→tools, lock→skip | `SUPABASE_SERVICE_ROLE_KEY` | ⏱️ Minutes |
| **L6** | Behavior | **OMATS Stage 3** — personality, idle discipline, task completion, grounding, prioritization, tool selection, context use, resource awareness, scope boundaries | AI API key + `SUPABASE_SERVICE_ROLE_KEY` | 🐢 Slow (AI calls) |

### Layer Philosophy

**L1-L3** are deterministic and run in CI. They catch regressions in logic, contracts, and data handling.

**L4-L5** verify that the system is "healthy" — the agent has all its parts and they connect correctly.

**L6** is where traditional software testing ends and **agent validation** begins. It requires real AI calls and evaluates behavioral properties like "does the agent stay grounded in its context" and "does it respect scope boundaries."

---

## From Evaluation to Improvement

Many teams now run strong evaluations but still miss the operational step: turning results into sustained improvement.

| Evaluation-Only Pattern | Continuous Improvement Pattern |
|-------------------------|-------------------------------|
| Run benchmark or test suite | Run benchmark + ingest findings |
| Publish report/dashboard | Create objectives from high-impact findings |
| Fix ad hoc issues | Classify: dismiss / runtime fix / source fix |
| Re-test occasionally | Re-verify in the next autonomous cycle |

This handbook's thesis is that agentic testing should be a **control loop**, not a reporting loop.

## The Key Insight: From "Does It Run?" to "Does It Govern Itself?"

Traditional software testing asks: *"Does the code produce the correct output at t=0?*

Autonomous agent testing must ask: *"Does the agent maintain correct behavior at t=∞ without human supervision?"*

This is the shift FlowWink discovered when building FlowPilot — and what forced the creation of OMATS L4-L7.

### OpenClaw (Tool) vs FlowPilot (Autonomous Agent)

| | OpenClaw | FlowPilot |
|---|---|---|
| **Runtime** | On-demand, human-triggered | 24/7 autonomous heartbeat |
| **State** | Ephemeral per session | Persistent, evolving |
| **Failure mode** | Crash or wrong output | Drift, stagnation, boundary violation |
| **Test focus** | Components (gateways, providers) | System health + behavior |

**OpenClaw tests infrastructure**: "Can we call GPT-4?" (live), "Does WebSocket pairing work?" (e2e), "Is the config valid?" (unit).

**FlowPilot tests autonomy**: "Does the agent have a soul?" (L4), "Does data flow: memory → context → decision?" (L5), "Does it respect scope when under pressure?" (L6), "Would a peer agent catch bugs we missed?" (L7).

### Why This Matters For Your Agent

If you build an autonomous agent (not just an AI-powered tool), you need three test layers OpenClaw doesn't have:

1. **Health tests (L4)**: "Are all the parts present and accounted for?" — skills, soul, objectives, memory systems.
2. **Wiring tests (L5)**: "Do the parts connect correctly?" — data flows, token budgets, circuit breakers.
3. **Behavior tests (L6)**: "Does the agent act correctly when unsupervised?" — prioritization, grounding, idle discipline.
4. **Peer validation (L7)**: "Would another agent catch what I missed?" — external QA audit.

> **The concrete takeaway**: If your agent runs while you sleep, you cannot rely on manual QA. You need automated tests that verify the agent remains healthy, wired correctly, and behaves well — because no human will be watching when it drifts.

---

## The Testing Pyramid for Agents

```
                    ┌──────────┐
                    │  E2E     │  Full cycles: heartbeat, A2A, multi-agent
                    │  Flows   │  Slow, expensive, run weekly
                   ┌┴──────────┴┐
                   │  Integration │  Skill + handler + DB round-trips
                   │  Tests      │  Medium speed, run on deploy
                  ┌┴──────────────┴┐
                  │  Contract Tests │  Schema validation, API compliance
                  │                │  Fast, run on every commit
                 ┌┴────────────────┴┐
                 │   Unit Tests      │  Individual functions, handlers,
                 │                   │  prompt assembly, memory operations
                 │                   │  Very fast, run on every save
                 └───────────────────┘
```

---

## Level 1: Unit Tests

### Skill Definition Tests

Every skill has a JSON schema, handler, and instructions. Test each independently:

```typescript
// Test: skill schema is valid OpenAI function calling format
test('qualify_lead skill has valid schema', () => {
  const skill = getSkill('qualify_lead');
  expect(skill.name).toBeDefined();
  expect(skill.parameters).toHaveProperty('type', 'object');
  expect(skill.parameters.properties).toBeDefined();
  // Verify required fields are actually in properties
  for (const req of skill.parameters.required || []) {
    expect(skill.parameters.properties).toHaveProperty(req);
  }
});

// Test: handler routing resolves correctly
test('qualify_lead routes to module handler', () => {
  const skill = getSkill('qualify_lead');
  expect(skill.handler).toMatch(/^module:/);
});
```

### Prompt Assembly Tests

The system prompt is the foundation of agent behavior. Test that it assembles correctly:

```typescript
test('system prompt includes grounding rules in layer 1', () => {
  const prompt = assembleSystemPrompt(testConfig);
  const firstSection = prompt.split('---')[0];
  expect(firstSection).toContain('never exfiltrate');
  expect(firstSection).toContain('never bypass approval');
});

test('skill list respects scope for public surface', () => {
  const skills = loadSkillsForSurface('external');
  const internalSkills = skills.filter(s => s.scope === 'internal');
  expect(internalSkills).toHaveLength(0);
});
```

### Memory Operation Tests

Test that memory creation, retrieval, compression, and categorization work correctly:

```typescript
test('memory compression preserves key facts', () => {
  const original = 'Customer John Smith from Acme Corp called about enterprise pricing...';
  const compressed = compressMemory(original);
  expect(compressed).toContain('John Smith');
  expect(compressed).toContain('Acme Corp');
  expect(compressed).toContain('enterprise pricing');
  expect(compressed.length).toBeLessThan(original.length);
});
```

---

## Level 2: Contract Tests

Contract tests verify that interfaces between components are honored. In an agentic system, the key contracts are:

### Skill ↔ Handler Contract

Every skill's `handler` field must resolve to a real handler. Every handler must accept the parameters the skill schema defines:

```typescript
test('all skills have resolvable handlers', async () => {
  const skills = await getAllActiveSkills();
  for (const skill of skills) {
    const handler = resolveHandler(skill.handler);
    expect(handler).toBeDefined();
    expect(typeof handler).toBe('function');
  }
});
```

### A2A ↔ Agent Card Contract

Your Agent Card claims certain skills. Verify they actually exist and respond:

```typescript
test('agent card skills match active skill set', async () => {
  const card = await getAgentCard();
  const activeSkills = await getActiveSkills({ scope: 'external' });
  const activeNames = activeSkills.map(s => s.name);
  
  for (const cardSkill of card.skills) {
    expect(activeNames).toContain(cardSkill.name);
  }
});
```

### responseSchema Contract

When you request a specific schema from a peer, validate that your code can handle both the ideal response AND degraded responses:

```typescript
test('procurement response parser handles valid response', () => {
  const valid = { offers: [{ supplier: 'Acme', price: 100, currency: 'SEK' }] };
  const result = parseProcurementResponse(valid);
  expect(result.offers).toHaveLength(1);
});

test('procurement response parser handles free text fallback', () => {
  const freeText = 'We can offer 100 SEK per unit for delivery in 3 weeks.';
  const result = parseProcurementResponse(freeText);
  expect(result.raw).toBe(freeText);
  expect(result.offers).toHaveLength(0);
  expect(result.fallback).toBe(true);
});
```

---

## Level 3: Integration Tests

### Skill Execution Round-Trip

Test that a skill executes end-to-end: parameters in → handler runs → database changes → response out:

```typescript
test('create_blog_post skill creates post and returns slug', async () => {
  const result = await executeSkill('create_blog_post', {
    title: 'Test Post',
    content: 'Test content',
    status: 'draft'
  }, { surface: 'internal', siteId: testSiteId });
  
  expect(result.success).toBe(true);
  expect(result.data.slug).toBe('test-post');
  
  // Verify in database
  const post = await db.from('blog_posts').select().eq('slug', 'test-post').single();
  expect(post.data).toBeDefined();
  expect(post.data.status).toBe('draft');
});
```

### Approval Gate Integration

Test that approval-gated skills actually pause and require approval:

```typescript
test('send_newsletter skill triggers approval gate', async () => {
  const result = await executeSkill('send_newsletter', {
    campaign_id: testCampaignId
  }, { surface: 'internal', siteId: testSiteId });
  
  expect(result.requires_approval).toBe(true);
  expect(result.approval_request).toBeDefined();
  expect(result.executed).toBe(false);
});
```

### Self-Healing Integration

Test that the quarantine mechanism works:

```typescript
test('skill is quarantined after 3 consecutive failures', async () => {
  // Simulate 3 failures
  for (let i = 0; i < 3; i++) {
    await executeSkill('broken_skill', {}, { surface: 'internal', siteId: testSiteId });
  }
  
  const skill = await getSkill('broken_skill');
  expect(skill.status).toBe('quarantined');
  expect(skill.quarantine_reason).toContain('consecutive failures');
});
```

---

## Level 4: End-to-End Agent Tests

### Heartbeat Cycle Test

Run a complete heartbeat and verify the agent behaves correctly:

```typescript
test('heartbeat cycle completes within budget', async () => {
  // Set up: create an objective the agent should work on
  await createObjective({
    title: 'Write a draft blog post about pricing',
    status: 'active',
    siteId: testSiteId
  });
  
  const result = await runHeartbeat(testSiteId, { maxTokens: 50000 });
  
  // Verify: heartbeat completed
  expect(result.status).toBe('completed');
  expect(result.tokensUsed).toBeLessThan(50000);
  
  // Verify: heartbeat report was generated
  expect(result.report).toBeDefined();
  expect(result.report.steps_completed).toBeGreaterThan(0);
  
  // Verify: some objective progress was made
  const objective = await getObjective(testObjectiveId);
  expect(objective.last_activity).toBeDefined();
});
```

### A2A Round-Trip Test

Test a complete A2A cycle between two agents:

```typescript
test('QA Claw → FlowPilot A2A round-trip', async () => {
  // 1. Send a QA task to the QA Claw
  const qaResult = await callPeerAgent('qa-claw', {
    task: 'Audit the booking page',
    responseSchema: {
      type: 'object',
      properties: {
        findings: { type: 'array', items: { type: 'object' } },
        passed: { type: 'number' }
      }
    }
  });
  
  // 2. Verify QA Claw responded with valid schema
  expect(qaResult.findings).toBeDefined();
  expect(Array.isArray(qaResult.findings)).toBe(true);
  
  // 3. Feed findings into FlowPilot
  const objectives = await processQAFindings(qaResult.findings, testSiteId);
  
  // 4. Verify objectives were created for high-severity findings
  const highFindings = qaResult.findings.filter(f => f.severity === 'high');
  expect(objectives.length).toBeGreaterThanOrEqual(highFindings.length);
});
```

---

## The OpenClaw QA Symbiosis Pattern

The Clawable project validates FlowPilot not just through internal tests, but through **external QA peers** — OpenClaw instances that run as autonomous testers. This is **L7** in the OMATS philosophy: multi-agent validation where one agent audits another.

### The Symbiosis Loop

```
┌─────────────────────────────────────────────────────────┐
│              OPENCLAW QA SYMBIOSIS (A2A PEERS)            │
│                                                         │
│  OpenClaw (QA Peer)            FlowPilot (Operator)     │
│  VPS · Docker · stock          Flowwink edge function   │
│  A2A plugin enabled            A2A ingest/outbound      │
│  ──────────────────            ──────────────────────   │
│  Audits FlowPilot output ──►  Receives findings         │
│  Runs conformance tests  ──►  Creates objectives        │
│  Flags drift/stagnation  ──►  Reflects, adjusts           │
│                                                         │
│  ◄── Receives heartbeat logs   Sends heartbeat reports    │
│  ◄── Receives performance data Pushes skill usage stats │
│  ◄── Receives audit requests   Initiates QA tasks         │
│                                                         │
│  Both peers can initiate activities independently.        │
└─────────────────────────────────────────────────────────┘
```

### A Real QA Cycle

This pattern runs in production after every edge function deploy:

```
14:02  Flowwink deploys updated booking flow (agent-execute v2.4.1)

14:03  QA Claw receives task via /v1/responses:
       "Audit the booking flow on demo.flowwink.com.
        Return { findings: [{ severity, location, description }] }"

14:04  QA Claw browses the booking page, tests 3 user journeys:
       - New visitor books a consultation (happy path)
       - Returning visitor with existing contact record
       - Mobile viewport booking with timezone mismatch

14:06  QA Claw returns structured findings:
       {
         "findings": [
           { "severity": "high",   "location": "/booking?service=consult",
             "description": "Timezone selector defaults to UTC on mobile Safari" },
           { "severity": "medium", "location": "/booking confirmation page",
             "description": "Confirmation email references 'FlowWink' instead of custom brand" }
         ],
         "passed": 14,
         "total_checks": 17
       }

14:07  FlowPilot receives findings via A2A → creates 2 objectives:
       - OBJ-847: "Fix timezone default on mobile booking" (high)
       - OBJ-848: "Replace hardcoded brand name in confirmation template" (medium)

14:08  FlowPilot's next heartbeat picks up OBJ-847, plans a fix,
       and flags it for admin approval.
```

**The result:** Issues that would have taken days or weeks to surface (when a real customer complained) now surface within 4 minutes of deploy, categorized by severity, with structured data that FlowPilot can act on autonomously.

### OpenClaw's Testing Philosophy

OpenClaw itself follows a three-layer testing approach:

| Suite | Purpose | When to Run |
|-------|---------|-------------|
| **Unit/Integration** | Pure functions, in-process integration, gateway auth, routing | `pnpm test` — every commit |
| **E2E (Gateway)** | Multi-instance gateway, WebSocket/HTTP surfaces, node pairing | `pnpm test:e2e` — deploy gate |
| **Live (Real Providers)** | Actual models, providers, tool-calling quirks | `pnpm test:live` — debugging only |

The key insight: **live tests with real AI calls are not CI-stable by design** (real networks, provider policies, quotas, outages). They catch provider-specific failures but are too expensive and flaky for routine validation. OMATS L6 is the equivalent layer for FlowWink.

### Pattern: Use OpenClaw as QA for Any System

You don't need FlowWink to copy this pattern:

1. **Create a QA Claw** with `SOUL.md` focused on your product's definition of "good"
2. **Expose `/v1/responses` tasks** with stable JSON schemas for findings
3. **Call the QA Claw after deploys** — pass URLs, user journeys, feature flags
4. **Feed findings back into your loop** — store in database, create objectives, surface in dashboards
5. **Add A2A for richer collaboration** — follow-up questions, re-checks, coordination with multiple specialist Claws

**Key principle:** The QA Claw is a **peer**, not a service. Both agents can initiate — FlowPilot can request an audit, and OpenClaw can push findings proactively based on its own heartbeat cycle.

---

## Testing for Drift and Stagnation

These are the hardest tests to write because they require observing behavior over time:

### Drift Detection

```typescript
test('agent soul has not mutated from baseline', async () => {
  const currentSoul = await getSoulContent(testSiteId);
  const baselineSoul = await getBaselineSoul(testSiteId);
  
  // Compare key sections (values, boundaries, tone)
  expect(currentSoul.values).toEqual(baselineSoul.values);
  expect(currentSoul.boundaries).toEqual(baselineSoul.boundaries);
  
  // Tone can evolve, but should not contradict baseline
  if (currentSoul.tone !== baselineSoul.tone) {
    console.warn('Soul tone has changed — review manually');
  }
});
```

### Stagnation Detection

```typescript
test('heartbeat proposals show variety over time', async () => {
  const recentReports = await getHeartbeatReports(testSiteId, { limit: 10 });
  const proposalTexts = recentReports.map(r => r.proposals).flat();
  
  // Check that proposals aren't all identical
  const uniqueProposals = new Set(proposalTexts);
  const diversityRatio = uniqueProposals.size / proposalTexts.length;
  
  expect(diversityRatio).toBeGreaterThan(0.5); // At least 50% unique proposals
});
```

---

## What You Can't Test (Yet)

Honest about the limits:

- **Reasoning quality** — you can test that the agent chose the right tool, but testing that it reasoned well about *why* is still subjective
- **Prompt injection resistance** — you can test known injection patterns, but novel attacks will always exist
- **Long-term behavioral stability** — drift happens over weeks and months. No test suite runs that long
- **Multi-agent emergent behavior** — when 5 agents interact, the system behavior is not the sum of individual behaviors. Testing the emergent properties is an open research problem

The pragmatic approach: **test what you can automate, monitor what you can't, and review what matters most manually.**

---

## A Minimal Test Suite for Any Agent

If you build nothing else, build these tests mapped to OMATS layers:

### Internal Tests (OMATS L1-L5)

| Layer | Test | What it catches |
|-------|------|----------------|
| L1 | All skills have valid schemas and resolvable handlers | Broken skills that crash on invocation |
| L2 | Scope isolation: external surface cannot access internal skills | Security boundary violations |
| L3 | Approval gates fire for all `requires_approval` skills | Unauthorized high-risk actions |
| L4 | Skills seeded, soul present, objectives reachable | System health at startup |
| L5 | Heartbeat completes within token budget | Runaway costs, wiring failures |

### External Validation (OMATS L6-L7)

| Layer | Test | What it catches |
|-------|------|----------------|
| L6 | Agent behavior: grounding, prioritization, tool selection | Behavioral drift, reasoning degradation |
| L7 | OpenClaw QA peer audits | Issues internal tests miss — real user journeys, cross-system integration |

**The L7 OpenClaw pattern is the secret weapon:** an external agent auditing your agent catches the problems you didn't think to test for. The 4-minute QA cycle (deploy → audit → findings → objectives) prevents issues from reaching customers.

Start with L1-L3 in CI. Add L4-L5 for health checks. Use L6 sparingly (expensive AI calls). Run L7 continuously in production.

---

*Testing agents is not about proving they always do the right thing. It is about proving they never do the dangerous thing — and building confidence that the most common paths work as designed. The rest is monitoring, logging, and human review.*

**OMATS (OpenClaw Multi-Agent Testing Standard)** provides the framework: six layers from unit tests to behavioral validation, plus the L7 symbiosis pattern where external agents audit your agents. FlowWink runs all seven layers. Start with what you can automate, add peer validation when you're ready, and never stop monitoring.

*Next: circuit breakers, exponential backoff, and the five-layer safety stack. [Resilience Patterns →](14c-resilience-patterns.md)*
