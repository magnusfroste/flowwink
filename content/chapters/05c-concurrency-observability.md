---
title: "Concurrency & Observability"
description: "Lane-based locking, trace IDs, and production debugging — the infrastructure that keeps autonomous agents from colliding."
order: 8.5
icon: "eye"
---

# Concurrency & Observability — Running Agents in Production

> **A demo agent runs alone. A production agent shares infrastructure with other agents, cron jobs, user sessions, and webhooks. Without concurrency control, they will collide. Without observability, you won't know why.**

---

## The Collision Problem

An autonomous agent isn't a single process. It's multiple surfaces sharing the same database, the same skills, and the same memory:

```
Surface 1: HEARTBEAT        (cron, every 30 min)
Surface 2: AGENT-OPERATE    (admin interaction)
Surface 3: CHAT-COMPLETION  (visitor chat)
Surface 4: WEBHOOKS          (external triggers)
```

What happens when a heartbeat fires while the admin is mid-conversation with the agent? Both try to:
- Read and write to `agent_memory`
- Execute skills that modify state
- Update `agent_objectives` progress
- Log to `agent_activity`

Without coordination, you get:
- **Race conditions** — heartbeat overwrites memory that operate just wrote
- **Duplicate work** — both surfaces execute the same pending automation
- **Corrupted state** — partial writes from interrupted operations
- **Billing surprises** — parallel API calls double your token spend

---

## Lane-Based Locking

FlowPilot uses a simple, effective concurrency model: **lane-based advisory locks** stored in the `agent_locks` table.

### The Model

Each agent surface claims a "lane" before operating. Only one process can hold a lane at a time.

```sql
CREATE TABLE agent_locks (
  lane        TEXT PRIMARY KEY,
  locked_by   TEXT NOT NULL,
  locked_at   TIMESTAMPTZ DEFAULT now(),
  expires_at  TIMESTAMPTZ DEFAULT now() + interval '5 minutes'
);
```

### Acquiring a Lock

```typescript
import { tryAcquireLock, releaseLock } from '../_shared/concurrency.ts';

// In heartbeat
const acquired = await tryAcquireLock(supabase, 'heartbeat', 'heartbeat-cron', 300);
if (!acquired) {
  console.log('[heartbeat] Another instance is running, skipping');
  return; // Graceful exit, no error
}

try {
  // ... run heartbeat logic ...
} finally {
  await releaseLock(supabase, 'heartbeat');
}
```

### Lock Lanes

| Lane | Holder | Purpose |
|------|--------|---------|
| `heartbeat` | Cron trigger | Prevents overlapping heartbeat cycles |
| `operate` | Admin session | Prevents heartbeat from interfering with interactive use |
| `automation:{id}` | Heartbeat | Prevents duplicate automation execution |
| `objective:{id}` | Any surface | Prevents parallel progress on same objective |

### TTL-Based Expiry

Locks auto-expire after 5 minutes (configurable). This prevents deadlocks from crashed processes:

```sql
-- The RPC function checks expiry atomically
CREATE OR REPLACE FUNCTION try_acquire_agent_lock(
  p_lane TEXT, p_locked_by TEXT, p_ttl_seconds INT DEFAULT 300
) RETURNS BOOLEAN AS $$
BEGIN
  -- Delete expired locks
  DELETE FROM agent_locks WHERE lane = p_lane AND expires_at < now();
  -- Try to insert
  INSERT INTO agent_locks (lane, locked_by, expires_at)
  VALUES (p_lane, p_locked_by, now() + (p_ttl_seconds || ' seconds')::interval)
  ON CONFLICT (lane) DO NOTHING;
  -- Check if we got it
  RETURN EXISTS (
    SELECT 1 FROM agent_locks
    WHERE lane = p_lane AND locked_by = p_locked_by
  );
END;
$$ LANGUAGE plpgsql;
```

### Why Not Redis?

For a self-hosted system running on a single Supabase instance, PostgreSQL advisory locks are:
- **Simpler** — no additional infrastructure
- **Sufficient** — agent concurrency is low (max 4-5 concurrent surfaces)
- **Persistent** — lock state survives edge function cold starts
- **Auditable** — you can query `agent_locks` to see current state

Redis would be overkill. If you're running hundreds of agent instances, you need Redis (or something equivalent). For a single-tenant self-hosted deployment, PostgreSQL is the right tool.

---

## Trace IDs: Following the Thread

When a heartbeat runs, it might:
1. Self-heal 2 skills
2. Advance 3 objective steps
3. Execute 2 automations
4. Reflect on 7 days of performance
5. Save 4 memories

That's 11+ operations across multiple tables. Without a correlation ID, debugging is archaeology — piecing together timestamps and hoping they align.

### The Solution

Every autonomous run generates a **trace ID** that flows through the entire operation chain:

```typescript
import { generateTraceId } from '../_shared/trace.ts';

const traceId = generateTraceId('hb'); // hb_m3k9f2_a7x2p1
```

The trace ID is:
- **Human-readable** — prefix tells you the surface (`hb` = heartbeat, `op` = operate)
- **Sortable** — timestamp component enables chronological ordering
- **Unique** — random suffix prevents collisions

### Propagation

The trace ID is passed through every function call and stored in every activity log:

```typescript
// Heartbeat creates trace
const traceId = generateTraceId('hb');

// Passed to reasoning engine
const result = await reason({
  ...config,
  metadata: { traceId },
});

// Stored in activity logs
await supabase.from('agent_activity').insert({
  skill_name: 'advance_plan',
  conversation_id: traceId,  // Reuses conversation_id for trace correlation
  status: 'success',
  token_usage: usage,
});
```

### Querying by Trace

"Show me everything that happened in the last heartbeat":

```sql
SELECT skill_name, status, duration_ms, token_usage, created_at
FROM agent_activity
WHERE conversation_id = 'hb_m3k9f2_a7x2p1'
ORDER BY created_at;
```

This returns the complete story of a single autonomous run — every skill called, every result, every failure — in chronological order.

---

## The Activity Log: Structured Observability

Every agent action is logged to `agent_activity` with a consistent schema:

```typescript
{
  id: uuid,
  agent: 'flowpilot' | 'visitor_chat',
  skill_name: string,           // What was attempted
  skill_id: uuid | null,        // Link to skill definition
  status: 'success' | 'error' | 'pending_approval' | 'skipped',
  input: json,                  // What was sent (sanitized)
  output: json,                 // What came back
  error_message: string | null, // If failed, why
  token_usage: {                // Cost tracking
    prompt_tokens: number,
    completion_tokens: number,
    total_tokens: number
  },
  duration_ms: number,          // Performance tracking
  conversation_id: string,      // Trace ID for correlation
  created_at: timestamptz
}
```

### What This Enables

1. **Cost attribution** — Which skills consume the most tokens?
2. **Performance monitoring** — Which skills are slowest?
3. **Failure tracking** — Which skills fail most often? (feeds self-healing)
4. **Audit trail** — What did the agent do, when, and why?
5. **Trace reconstruction** — Follow a single autonomous run end-to-end

---

## Self-Healing: Observability as Input

The activity log isn't just for humans. The agent reads its own logs during the self-healing phase of every heartbeat:

```
SELF-HEAL phase:
  1. Query agent_activity for last 3 days
  2. Group by skill_name
  3. Find skills with 3+ consecutive failures
  4. Auto-disable failing skills
  5. Disable linked automations
  6. Inject healing report into prompt
```

This closes the observability loop: **the agent monitors itself and acts on what it sees.** A failing skill doesn't just generate alerts — it gets quarantined automatically.

---

## The Engine Room Dashboard

All observability data surfaces in the admin UI through the "Engine Room" — a real-time view of agent operations:

| Panel | Data Source | Shows |
|-------|------------|-------|
| Activity Feed | `agent_activity` | Recent actions with status, duration, tokens |
| Token Spend | `agent_activity.token_usage` | Cumulative cost by skill and time period |
| Skill Health | `agent_activity` aggregated | Success rates, failure streaks |
| Active Locks | `agent_locks` | Currently held lanes |
| Memory Usage | `agent_memory` count | Total memories by category |
| Objectives | `agent_objectives` | Progress on active goals |

The Engine Room answers the operator's core question: **"What is my agent doing right now, and is it working?"**

---

## The Anti-Patterns

| Anti-Pattern | Consequence | Fix |
|---|---|---|
| No concurrency control | Race conditions, duplicate work | Lane-based locking |
| No trace IDs | Can't debug autonomous runs | Generate and propagate trace IDs |
| Unstructured logs | `console.log` everywhere, no queryable data | Structured activity log |
| Logs for humans only | Agent can't learn from its failures | Self-healing reads activity log |
| No TTL on locks | Crashed process holds lock forever | Auto-expiry with TTL |
| Over-engineering (Redis, Kafka) | Complexity without benefit for single-tenant | PostgreSQL is sufficient |

---

*Concurrency and observability aren't glamorous. They're plumbing. But plumbing is what separates a demo from a product. Without it, your agent works in the lab and fails in production. With it, you can sleep while your agent runs — and know exactly what it did when you wake up.*

*Next: the skills ecosystem and how capabilities are organized. [Skills Ecosystem →](06-skills-ecosystem.md)*
