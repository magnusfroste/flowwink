---
title: "Testing Agentic Systems"
description: "How to test agents — skills, memory, A2A, drift, and the QA practices that traditional software testing doesn't cover."
order: 16.7
icon: "beaker"
---

# Testing Agentic Systems

> **You wouldn't deploy a web app without tests. You shouldn't deploy an agent without them either. But testing an agent is fundamentally different from testing software — the output is non-deterministic, the state space is enormous, and "correct" is often a judgment call.**

---

## Why Agent Testing Is Hard

Traditional software testing relies on determinism: given input X, the function returns Y. Always.

An agent given the same input might:
- Choose different tools
- Reason through a different path
- Produce different (but equally valid) output
- Behave differently depending on what's in memory

This doesn't mean agents can't be tested. It means the testing strategy must shift from **exact output matching** to **behavioral contracts and invariant checking.**

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

If you build nothing else, build these five tests:

| # | Test | What it catches |
|---|------|----------------|
| 1 | All skills have valid schemas and resolvable handlers | Broken skills that crash on invocation |
| 2 | Scope isolation: external surface cannot access internal skills | Security boundary violations |
| 3 | Approval gates fire for all `requires_approval` skills | Unauthorized high-risk actions |
| 4 | Heartbeat completes within token budget | Runaway costs |
| 5 | Agent Card matches active external skill set | A2A contract violations |

These five tests catch the most common production failures. Start here, expand as you learn what breaks.

---

*Testing agents is not about proving they always do the right thing. It is about proving they never do the dangerous thing — and building confidence that the most common paths work as designed. The rest is monitoring, logging, and human review.*

*Next: ClawStack — running agent swarms on real infrastructure. [ClawStack →](17-clawstack.md)*
