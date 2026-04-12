---
title: Presence (Heartbeat Protocol)
summary: How Pilot maintains autonomous presence through scheduled heartbeat loops
read_when: Working on heartbeat, cron jobs, or autonomous agent behavior
---

# Presence — The Heartbeat Protocol

> **OpenClaw pattern:** Continuous presence via timer-based heartbeat (every 30 min)
> **Pilot implementation:** Cron-triggered edge function `flowpilot-heartbeat` (every 12h) with a 7-step protocol

---

## Overview

Presence is how the agent stays active without human interaction. While OpenClaw uses a 30-minute timer on a long-lived daemon, Pilot uses a serverless cron job that scales to zero between beats.

```
┌─────────────────────────────────────────────────────┐
│  pg_cron (every 12h)                                │
│  └── HTTP POST → flowpilot-heartbeat edge function  │
│       └── tryAcquireLock('heartbeat', ttl=15min)    │
│            └── reason(config) with heartbeat mode   │
│                 └── 7-step protocol execution       │
│                      └── saveHeartbeatState()        │
│                           └── releaseLock()          │
└─────────────────────────────────────────────────────┘
```

## The 7-Step Protocol

The heartbeat protocol is stored in `agent_memory` (key: `heartbeat_protocol`) and is **editable by the agent itself** via `heartbeat_protocol_update`.

Default protocol:

```
1. EVALUATE  — Call evaluate_outcomes for unevaluated past actions.
               Score each with record_outcome.

2. PLAN      — For active objectives WITHOUT a plan, call decompose_objective.

3. ADVANCE   — Execute objective steps IN PRIORITY ORDER (highest score first).
               Use advance_plan with chain=true.

4. AUTOMATIONS — Execute DUE (⏰) automations via execute_automation.

5. PROPOSE   — If data warrants it, propose max 1 new objective via propose_objective.

6. REFLECT   — Call reflect to analyze the past 7 days. Save learnings to memory.

7. REMEMBER  — Persist key insights via memory_write.
```

### Priority Scoring

Objectives are sorted by a composite priority score before step 3:

| Factor | Points |
|--------|--------|
| Deadline overdue | +50 |
| Deadline < 1 day | +40 |
| Deadline < 3 days | +25 |
| Deadline < 7 days | +10 |
| Priority: critical | +35 |
| Priority: high | +20 |
| Priority: medium | +10 |
| Partial progress (0-100%) | +15 |
| Near completion (≥70%) | +10 |
| No updates > 3 days | +8 |
| No updates > 7 days | +12 |
| Has failures | +10 |
| No plan yet | +5 |

## Concurrency Guard

The heartbeat uses lane-based locking to prevent overlapping runs:

```typescript
const acquired = await tryAcquireLock(supabase, 'heartbeat', 'heartbeat', 900);
if (!acquired) {
  return { skippedDueToLock: true };
}
```

- Lane: `heartbeat`
- TTL: 15 minutes (auto-expires — no zombie locks)
- If a previous heartbeat is still running, the new one exits silently

### Stale Lock Recovery

Objectives can also be locked by heartbeat runs:

```typescript
// locked_by and locked_at on agent_objectives
const staleThreshold = new Date(Date.now() - 30 * 60_000); // 30 minutes
// Objectives with stale locks are treated as unlocked
```

## Heartbeat State

After each run, state is persisted to `agent_memory` (key: `heartbeat_state`):

```typescript
interface HeartbeatState {
  last_run: string;              // ISO timestamp
  objectives_advanced: string[]; // Objective IDs touched
  next_priorities: string[];     // Flagged for next run
  pending_actions: string[];     // Incomplete tasks
  token_usage: TokenUsage;       // Tokens consumed
  iteration_count: number;       // Tool iterations used
}
```

This state is injected into the **next** heartbeat's prompt (Layer 6), giving the agent continuity between autonomous runs.

## Safety Guards

| Guard | Threshold | Behavior |
|-------|-----------|----------|
| Wall-clock timeout | 120 seconds | Hard abort |
| Token budget | Configurable (default 80k) | Stop reasoning |
| Pre-budget flush | 80% budget used | Extract facts, focus on completion |
| Iteration cap | 8 iterations | Stop after N tool rounds |
| Anti-runaway | 2+ consecutive tool errors | Session abort |
| Same action limit | 3 consecutive identical calls | Skip (except batch tools) |

### Batch Tool Exceptions

Some tools are legitimately called consecutively during heartbeats:
- `record_outcome` (scoring multiple activities)
- `memory_write` (persisting multiple facts)
- `objective_update_progress` (updating multiple objectives)

These are exempted from the `SAME_ACTION_LIMIT` check.

## Self-Healing (Step 0)

Before the 7-step protocol, `runSelfHealing()` runs:

```
runSelfHealing(supabase)
  │
  ├── Query agent_activity for recent failures per skill
  ├── For each skill with ≥ 3 consecutive errors:
  │   ├── Disable the skill (quarantine)
  │   ├── Disable linked automations
  │   └── Log quarantine event
  └── Return healing report string
```

The healing report is injected into the prompt so the agent is aware of quarantined skills.

## High-Priority Signals

The heartbeat isn't the only way to trigger autonomous behavior. External signals can bypass the 12h schedule:

```
signal-ingest edge function
  │
  ├── Receives external signal (webhook, event)
  ├── Matches against agent_automations.trigger_config
  └── Routes to automation-dispatcher for immediate execution
```

## Trace IDs

Each heartbeat generates a unique trace ID:

```typescript
generateTraceId('hb') → 'hb_m2x7k9_abc123'
```

This trace ID flows through: heartbeat → reason loop → tool calls → handler execution → agent_activity logs. Query `agent_activity` by trace ID to reconstruct the full heartbeat execution.

## Customization

The agent can modify its own heartbeat protocol:

```typescript
heartbeat_protocol_update({
  protocol: "HEARTBEAT PROTOCOL:\n1. ADVANCE — Focus only on high-priority objectives\n2. REFLECT — Quick 3-day window\n..."
})
```

This updates the `heartbeat_protocol` key in `agent_memory`. The change takes effect on the next heartbeat run.

## Comparison with OpenClaw

| Aspect | OpenClaw | Pilot |
|--------|----------|-------|
| Trigger | 30-minute timer | 12-hour cron |
| Runtime | Always-on Node.js daemon | Stateless Deno edge function |
| Concurrency | Process-level | PostgreSQL lane locks |
| State | In-memory + disk | `agent_memory` table |
| Protocol | Hardcoded steps | Editable via `heartbeat_protocol_update` |
| Timeout | Configurable | 120s wall-clock |
| Rationale | Real-time responsiveness | CMS operations are less time-sensitive |

---

*See also: [Dreaming](./dreaming.md) · [Memory](./memory.md) · [Architecture](./architecture.md)*
