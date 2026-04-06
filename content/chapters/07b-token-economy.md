---
title: "The Token Economy"
description: "Context budget management — how to run 100+ skills without hitting the context ceiling. Prompt compilation, lazy loading, and graceful degradation."
order: 10.3
icon: "calculator"
---

# The Token Economy — Managing the Scarcest Resource

> **An agent with 100 skills and a 128K context window sounds limitless. It isn't. Without active budget management, you'll burn 40% of your context before the first user message. The token economy is the discipline of spending wisely.**

---

## The Problem No One Talks About

Every tutorial about AI agents focuses on what the agent *can* do. Nobody talks about the math that determines what it *will* do in practice.

Here's the uncomfortable truth: context windows are not as large as they seem. A 128K token window sounds enormous until you stack up everything an autonomous agent needs:

```
System prompt + grounding rules     ~3,000 tokens
Soul + Identity + Agents            ~2,000 tokens
Domain context (CMS schema)         ~2,000 tokens
Skill metadata (100 skills)         ~10,000 tokens
Skill instructions (if loaded)      ~50,000 tokens  ← THIS IS THE KILLER
Working memory (30 entries)         ~3,000 tokens
Objectives + progress               ~2,000 tokens
Conversation history                ~5-15,000 tokens
────────────────────────────────────────────────────
Total without instructions:         ~27,000 tokens (21% of budget)
Total WITH all instructions:        ~77,000 tokens (60% of budget)
```

If you naively load everything, you've consumed 60% of your context before the agent even starts reasoning. The remaining 40% must handle the actual conversation, tool call results, and the agent's chain of thought.

This is why the Token Economy exists: **the art of spending context tokens where they create the most value.**

---

## The Prompt Compiler

An autonomous agent doesn't have a "prompt." It has a **prompt compiler** — a system that assembles the optimal prompt for each reasoning cycle based on current state, budget, and intent.

FlowPilot's prompt compiler builds a 6-layer stack:

```
┌──────────────────────────────────────────┐
│  Layer 1: GROUNDING_RULES                │  ~800 tokens
│  Response format, safety constraints,    │  Static, always present
│  tool-use conventions                    │
├──────────────────────────────────────────┤
│  Layer 2: MODE IDENTITY                  │  ~400 tokens
│  "You are FlowPilot, operating in       │  Varies by surface
│  [heartbeat|operate|chat] mode"          │
├──────────────────────────────────────────┤
│  Layer 3: WORKSPACE FILES                │  ~2,000 tokens
│  Soul, Identity, Agents memory keys     │  Loaded from agent_memory
│  (personality, boundaries, rules)        │
├──────────────────────────────────────────┤
│  Layer 4: DOMAIN CONTEXT                 │  ~2,000 tokens
│  CMS page schema, active modules,       │  Dynamic, filtered by
│  site configuration awareness            │  relevance
├──────────────────────────────────────────┤
│  Layer 5: MEMORIES & OBJECTIVES          │  ~3,000 tokens
│  Working memory (top 30), active        │  Semantic search +
│  objectives with progress               │  recency sort
├──────────────────────────────────────────┤
│  Layer 6: REPLY DIRECTIVES              │  ~300 tokens
│  Mode-specific output instructions      │  Static per surface
└──────────────────────────────────────────┘

Total system prompt: ~8,500 tokens (6.6% of 128K)
```

The key insight: **the system prompt is only 6.6% of the budget.** This leaves 93% for skills, conversation, and reasoning. The prompt compiler achieves this through aggressive filtering and lazy loading.

---

## Lazy Instruction Loading (Law 3 in Practice)

This is the single most impactful optimization in the entire system. It's the difference between a 77K token prompt and a 27K token prompt.

### The Problem

Each skill has two parts:
1. **Metadata** — name, description, JSON schema (~100 tokens)
2. **Instructions** — detailed usage guide, edge cases, decision tables (~500-2,000 tokens)

With 100+ skills, loading all instructions costs 50K+ tokens. That's nearly half the context window consumed by information the agent *might* need.

### The Solution

```
Phase 1 — STARTUP (always):
  Load metadata only for all eligible skills
  Cost: ~100 tokens × 80 skills = 8,000 tokens

Phase 2 — ON-CALL (on demand):
  When the LLM selects a skill, fetch its full instructions
  Cost: ~500-2,000 tokens per skill actually used
  Typical: 2-4 skills per turn = 1,000-8,000 tokens

Phase 3 — BUDGET PRESSURE (when needed):
  Compress metadata, drop low-priority skills
  See: Skill Budget Degradation below
```

### Implementation

```typescript
// Phase 1: Load lightweight tool definitions
const tools = await loadSkillTools(supabase, scope, budget);
// Returns: { name, description, parameters } — NO instructions

// Phase 2: After LLM picks a skill
const instructions = await fetchSkillInstructions(supabase, skillName);
// Returns: full instructions text, injected as system message
// before re-entering the reasoning loop
```

The agent sees 80 skill *summaries* (8K tokens) and only loads the 2-4 skill *manuals* it actually needs (2-8K tokens). Total skill cost: **10-16K tokens** instead of 58K.

---

## Skill Budget Degradation

When token usage climbs, the system progressively reduces skill richness:

```
Budget usage     Action                              Savings
─────────────────────────────────────────────────────────────
0-50%            Full metadata (name + description    Baseline
                 + full JSON schema)

50-75%           Compact metadata (name +             ~40% reduction
                 one-line description, simplified     in skill tokens
                 schema)

75-90%           Drop low-priority skills entirely.   ~60% reduction
                 Keep only skills matching current
                 intent category.

90%+             Emergency: flush working state,      Graceful exit
                 save progress to memory, end turn
                 with summary.
```

### Intent-Based Filtering

Before degradation even kicks in, the system filters skills by relevance. Not every skill is offered to every request:

```typescript
// agent-operate analyzes the user's message
const intent = classifyIntent(userMessage);
// Returns: ['content', 'crm'] or ['booking'] or ['accounting']

// Only skills matching the intent categories are loaded
const relevantSkills = allSkills.filter(s =>
  intent.includes(s.category) || s.category === 'core'
);
// 100+ skills → typically 30-50 per request
```

This means the agent never sees 100 skills simultaneously. It sees 30-50 relevant skills plus core utilities, keeping the metadata cost around 5-8K tokens.

---

## The Token Budget Object

Every reasoning cycle carries a budget tracker:

```typescript
interface TokenBudget {
  limit: number;          // Max tokens for this run (e.g., 80,000)
  used: number;           // Accumulated across all turns
  remaining: number;      // limit - used
  turnCount: number;      // Number of reasoning turns so far
  maxTurns: number;       // Hard limit on reasoning iterations
}
```

The budget serves two purposes:

1. **Cost control** — An autonomous heartbeat that runs 48 times/day must not burn unlimited API credits. Each run has a token ceiling.

2. **Graceful degradation** — When the budget runs low, the agent saves its progress and exits cleanly rather than crashing mid-task.

```typescript
// In the reasoning loop
if (isOverBudget(usage, budget.limit)) {
  // Save partial progress
  await saveProgressToMemory(supabase, currentState);
  // Exit with summary of what was accomplished
  return { status: 'budget_exhausted', completed: stepsDone, remaining: stepsLeft };
}
```

---

## Cost Tiers: Free First, Paid When Necessary

Not all reasoning requires the same model. FlowPilot uses a tiered approach:

| Tier | Model | Cost | Use Case |
|------|-------|------|----------|
| `fast` | gpt-4.1-mini | ~$0.40/M tokens | Default for most operations: tool selection, simple Q&A, data lookups |
| `reasoning` | gpt-4.1 / gemini-2.5-pro | ~$10/M tokens | Complex planning, multi-step reasoning, content generation |

The default is always `fast`. Skills can specify a `preferred_provider` to override:

```json
{
  "name": "plan_quarterly_strategy",
  "preferred_provider": "reasoning",
  "instructions": "This skill requires deep analysis..."
}
```

### The Math

A heartbeat running 48 times/day with the `fast` tier:
- ~10K tokens per run × 48 runs = 480K tokens/day
- Cost: ~$0.19/day = **$5.70/month**

The same heartbeat with `reasoning` for everything:
- Cost: ~$4.80/day = **$144/month**

That's a 25x cost difference. The tier system isn't optional — it's existential for sustainable autonomy.

---

## Memory as Context Extension

When information doesn't fit in the context window, it lives in memory and gets retrieved on demand:

```
Context Window (fast, expensive):
  └── Working memory: top 30 entries, always loaded
  └── Conversation history: recent messages

Memory Tiers (slow, cheap):
  └── L3 Long-term: full-text search via pg_trgm
  └── L4 Semantic: vector similarity via pgvector
```

The agent doesn't need everything in context. It needs to *know that it can find things*. The skill instructions tell it when to search memory:

```
"When a user asks about past blog performance, use memory_read
to search for 'blog_engagement' in the 'fact' category before
making recommendations."
```

This pattern — **pointers in context, data in memory** — is how you scale beyond the context window without losing capability.

---

## The Anti-Patterns

| Anti-Pattern | Symptom | Fix |
|---|---|---|
| Loading all skill instructions | 50K+ tokens before first message | Lazy instruction loading |
| No intent filtering | 100 skills in every prompt | Category-based filtering |
| Single model tier | $144/month for heartbeats | Fast/reasoning tiers |
| No budget tracking | Runaway API costs | TokenBudget object |
| Everything in context | Context overflow, truncation | Memory tiers + search |
| No graceful degradation | Hard crashes at token limits | Progressive skill compression |

---

## Monitoring: Know Your Spend

Every agent activity log includes token usage:

```json
{
  "skill_name": "generate_blog_post",
  "token_usage": {
    "prompt_tokens": 12450,
    "completion_tokens": 2830,
    "total_tokens": 15280
  },
  "duration_ms": 3200,
  "model": "gpt-4.1-mini"
}
```

This data feeds the Engine Room dashboard, where operators can see:
- Token spend per skill (which skills are expensive?)
- Token spend per heartbeat cycle (is autonomy sustainable?)
- Budget utilization over time (are we trending up?)

Without monitoring, the token economy is theoretical. With it, it's a managed resource.

---

## Cost Modeling Worksheet

Before deploying an autonomous agent, estimate your monthly cost. The variables are predictable:

```
Monthly Cost = (heartbeat_runs/day × 30)
             × avg_tokens_per_run
             × model_cost_per_token
             + (operate_sessions/day × 30)
             × avg_tokens_per_session
             × model_cost_per_token
```

### The Variables

| Variable | How to Estimate | Typical Range |
|----------|----------------|--------------|
| `heartbeat_runs/day` | Admin-configured schedule | 2 (twice daily) |
| `avg_tokens_per_run` | From activity logs after first week | 8,000–15,000 |
| `operate_sessions/day` | How often admin interacts | 2–10 |
| `avg_tokens_per_session` | From activity logs | 3,000–8,000 |
| `model_cost_per_token` | Provider pricing page | See table below |

### Reference Pricing (2026)

| Model | Input $/M tokens | Output $/M tokens | Best for |
|-------|-----------------|-------------------|----------|
| gpt-4.1-mini | $0.40 | $1.60 | Heartbeat default, most operations |
| gpt-4.1 | $2.00 | $8.00 | Complex planning, content generation |
| gemini-2.5-pro | $1.25 | $10.00 | Long context, multimodal |
| claude-3-5-haiku | $0.80 | $4.00 | Fast, capable, good tool use |

*Prices change frequently — verify against current provider pricing.*

### Example: Small B2B Site

```
Heartbeat: 2/day × 30 = 60 runs/month
  @ 10,000 tokens avg × $0.40/M = $0.24/month

Operate: 5/day × 30 = 150 sessions/month
  @ 5,000 tokens avg × $0.40/M = $0.30/month

Reasoning tier (10% of runs for complex tasks):
  6 runs × 20,000 tokens × $2.00/M = $0.24/month

Total: ~$0.78/month on fast model + occasional reasoning
```

### Example: Active Marketing Agency

```
Heartbeat: 4/day × 30 = 120 runs/month
  @ 15,000 tokens avg × $0.40/M = $0.72/month

Operate: 20/day × 30 = 600 sessions/month
  @ 8,000 tokens avg × $0.40/M = $1.92/month

Reasoning tier (30% of runs):
  36 runs × 25,000 tokens × $2.00/M = $1.80/month

Total: ~$4.44/month
```

### The Ceiling Check

Before going live, calculate your worst-case scenario:

```
Worst case = max_heartbeat_frequency
           × max_tokens_per_run (128K limit)
           × most_expensive_model
           × 30 days
```

If the worst case is acceptable, deploy. If not, set lower `budget.limit` per run or reduce heartbeat frequency.

The numbers are almost always surprisingly small. The agent is not expensive — it's the *predictability* that matters. A $5/month agent that can't explain its costs is worse than a $50/month agent where every token is accounted for.

---

*The token economy is not about limits — it's about allocation. Every token spent on skill metadata is a token not available for reasoning. Every reasoning token spent on the wrong model is money wasted. The discipline is spending each token where it creates the most value.*

*Next: the three diverging inference APIs and how proxies preserve your freedom to switch. [The API Layer →](05b-api-layer.md)*
