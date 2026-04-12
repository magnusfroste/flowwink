---
title: Dreaming (Reflection & Learning)
summary: How Pilot reflects on past actions, evaluates outcomes, and evolves its own behavior
read_when: Working on agent self-improvement, outcome evaluation, or the reflect tool
---

# Dreaming — Reflection & Learning

> **OpenClaw pattern:** Dreaming phase where the agent reviews past actions and extracts learnings
> **Pilot implementation:** `reflect` + `evaluate_outcomes` + `record_outcome` tools, triggered during heartbeat step 6

---

## Overview

"Dreaming" is the process where the agent steps back from execution and reflects on what happened. In Pilot, this happens through three complementary mechanisms:

1. **Outcome Evaluation** — Score past actions (success/partial/negative)
2. **Reflection** — Self-assessment with auto-persisted learnings
3. **Memory Consolidation** — Extract and persist patterns from experience

## Outcome Evaluation

### `evaluate_outcomes`

Reviews recent `agent_activity` entries that haven't been evaluated yet:

```
evaluate_outcomes()
  │
  ├── Query agent_activity WHERE outcome_status IS NULL
  │   └── AND created_at > 7 days ago
  │
  ├── For each activity:
  │   ├── Examine input, output, error_message, duration_ms
  │   └── Present to agent for scoring
  │
  └── Agent calls record_outcome for each
```

### `record_outcome`

Scores an individual activity:

```typescript
record_outcome({
  activity_id: "uuid",
  status: "success" | "partial" | "neutral" | "negative" | "too_early",
  outcome_data: {
    evidence: "Blog post published, 45 views in first hour",
    confidence: 0.8
  }
})
```

**Scoring rules:**
- `success` — Action achieved its goal with evidence
- `partial` — Some progress but not fully achieved
- `neutral` — No measurable impact yet
- `negative` — Action caused problems or failed
- `too_early` — Less than 24 hours since execution, too soon to judge

**Hard gates** (automatic `negative` scoring):
- `auth_failed`, `quota_hit`, `rate_limited`
- `budget_exceeded`, `circuit_broken`, `timeout`

## Reflection

### `reflect`

The most powerful self-improvement tool. Analyzes the last 7 days of activity:

```
reflect()
  │
  ├── 1. Load recent agent_activity (last 7 days)
  │
  ├── 2. Load recent outcome evaluations
  │
  ├── 3. Generate self-assessment:
  │     ├── What went well?
  │     ├── What failed or underperformed?
  │     ├── What patterns emerge?
  │     └── What should change?
  │
  ├── 4. Auto-persist learnings:
  │     └── memory_write('reflection_YYYY-MM-DD', findings, 'context')
  │
  └── 5. Return reflection text to conversation
```

**Key behaviors:**
- Reflections are **automatically persisted** as memory entries — the agent doesn't need to explicitly save them
- Memory key format: `reflection_YYYY-MM-DD`
- These memories are then available via `memory_read` in future sessions
- The agent can act on reflections immediately (e.g., disable a poorly performing skill)

## The Dreaming Cycle in Heartbeat

Dreaming is embedded in the heartbeat protocol (steps 1 and 6):

```
HEARTBEAT PROTOCOL:
1. EVALUATE     ← Score past actions (dreaming: input)
2. PLAN
3. ADVANCE
4. AUTOMATIONS
5. PROPOSE
6. REFLECT      ← Self-assessment (dreaming: synthesis)
7. REMEMBER     ← Persist insights (dreaming: output)
```

### Step 1: Evaluate

The agent reviews unevaluated activities and scores them. This creates the raw data for reflection.

### Step 6: Reflect

The agent synthesizes patterns from its scored activities. It identifies:
- Skill effectiveness trends
- Common failure modes
- Opportunities for automation
- Skills that should be improved or disabled

### Step 7: Remember

The agent persists key insights to long-term memory. These inform future heartbeats.

## Self-Healing Connection

Reflection feeds into self-healing. When the agent notices a skill failing repeatedly:

```
reflect() identifies pattern
  │
  └── runSelfHealing() in next heartbeat
        │
        ├── Query agent_activity for consecutive failures
        ├── If skill has ≥ 3 consecutive errors:
        │   ├── Disable the skill (quarantine)
        │   ├── Disable linked automations
        │   └── Log quarantine event
        └── Return healing report
```

## Self-Evolution

Reflection can trigger self-evolution via:

- **`soul_update`** — "I've learned I should be more concise" → update persona
- **`agents_update`** — "Always check stock before promising delivery" → update rules
- **`skill_instruct`** — "The Stripe API requires idempotency keys" → enrich skill knowledge
- **`skill_disable`** — "This skill keeps failing" → quarantine

All evolution actions are logged in `agent_activity` for full audit trail.

## Comparison with OpenClaw Dreaming

| Aspect | OpenClaw | Pilot |
|--------|----------|-------|
| Trigger | Timer-based (every 30 min) | Heartbeat protocol (step 6, every 12h) |
| Storage | Markdown dream journal on disk | `agent_memory` entries with embeddings |
| Scope | Recent actions review | 7-day activity window |
| Output | `.dream` files | Memory entries + immediate self-modification |
| Persistence | Git-versioned | PostgreSQL with RLS |

---

*See also: [Presence (Heartbeat)](./presence.md) · [Memory](./memory.md) · [Architecture](./architecture.md)*
