---
title: "Resilience Patterns"
description: "Circuit breakers, exponential backoff, and the five-layer safety stack that keeps autonomous agents from cascading into failure."
order: 16.9
icon: "shield-exclamation"
---

# Resilience Patterns — Building Agents That Fail Gracefully

> **An agent that never fails is not robust — it's untested. A robust agent fails predictably, recovers automatically, and escalates when it can't recover. The difference between a toy and a production system is the failure path.**

---

## The Five-Layer Safety Stack

FlowPilot implements resilience as a stack of five layers. Each layer handles a different class of failure:

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: PREVENTION                                         │
│  Circuit breakers stop cascading failures before they start  │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: RECOVERY                                          │
│  Self-repair retries with exponential backoff               │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: ESCALATION                                        │
│  Auto-disable unstable skills after threshold               │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: EVALUATION                                        │
│  Hard gates for technical errors vs. soft failures          │
├─────────────────────────────────────────────────────────────┤
│  Layer 5: BACKOFF                                           │
│  Exponential backoff for heartbeat on repeated failures     │
└─────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Circuit Breakers

A circuit breaker prevents a failing skill from taking down the whole agent. The pattern comes from electrical engineering: when too much current flows, a breaker trips and protects the circuit.

In agentic systems, the "current" is repeated failures. The breaker opens when a skill fails too many times in a row.

### States

```
CLOSED (normal)    → Skill executes normally
       │
       ├── 3+ consecutive failures in 1h window
       ▼
OPEN (tripped)     → Skill is blocked, returns error immediately
       │
       ├── After 30 min cooldown
       ▼
HALF-OPEN (testing)→ One test request allowed
       │
       ├── Success → back to CLOSED
       └── Failure → back to OPEN
```

### Implementation

```typescript
async function executeWithCircuitBreaker(
  supabase: SupabaseClient,
  skillName: string,
  execute: () => Promise<SkillResult>
): Promise<SkillResult> {
  const breaker = await getCircuitBreakerState(supabase, skillName);

  if (breaker.state === 'OPEN') {
    if (Date.now() < breaker.resetAt) {
      return { error: 'CIRCUIT_OPEN', message: `Skill '${skillName}' is temporarily disabled` };
    }
    // Transition to HALF-OPEN for test
    await setCircuitBreakerState(supabase, skillName, 'HALF-OPEN');
  }

  try {
    const result = await execute();
    await resetCircuitBreaker(supabase, skillName); // Success → CLOSED
    return result;
  } catch (err) {
    await recordFailure(supabase, skillName);

    const failures = await getRecentFailureCount(supabase, skillName, '1 hour');
    if (failures >= 3) {
      await openCircuitBreaker(supabase, skillName, 30 * 60 * 1000); // 30 min
    }
    throw err;
  }
}
```

### Why Not Just Disable?

Disabling is permanent until a human re-enables. A circuit breaker is temporary and self-healing. The distinction matters for transient failures:

- **API rate limit hit** → circuit trips for 30 min → tries again → succeeds → resets automatically
- **Skill logic bug** → circuit trips → tries again → fails again → escalates to human

The circuit breaker handles the first case without human intervention. The escalation layer handles the second.

---

## Layer 2: Exponential Backoff

When a skill fails, the agent doesn't retry immediately. It waits, and each retry waits longer.

```
Attempt 1: Fail → Wait 1s
Attempt 2: Fail → Wait 2s
Attempt 3: Fail → Wait 4s
Attempt 4: Fail → Wait 8s
Attempt 5: Fail → Give up, log, escalate
```

### With Jitter

Pure exponential backoff causes "thundering herd" problems when multiple agents retry simultaneously. Jitter spreads retries across time:

```typescript
function backoffDelay(attempt: number, baseMs = 1000, maxMs = 30000): number {
  const exponential = Math.min(baseMs * Math.pow(2, attempt), maxMs);
  const jitter = Math.random() * 0.3 * exponential; // ±30% randomness
  return exponential + jitter;
}

// Usage
for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
  try {
    return await executeSkill(skillName, params);
  } catch (err) {
    if (attempt === MAX_RETRIES - 1) throw err;
    await sleep(backoffDelay(attempt));
  }
}
```

### When to Retry vs. When to Fail Fast

Not every error should be retried:

| Error Type | Retry? | Reason |
|------------|--------|--------|
| Network timeout | Yes | Transient |
| Rate limit (429) | Yes (with delay) | Quota resets |
| Invalid params (400) | No | Retrying won't help |
| Auth failure (401) | No | Credential issue |
| Not found (404) | No | Resource doesn't exist |
| Server error (500) | Yes (limited) | May be transient |

```typescript
function shouldRetry(error: SkillError): boolean {
  if (error.status === 429) return true;  // Rate limit
  if (error.status >= 500) return true;   // Server errors
  if (error.type === 'NETWORK_TIMEOUT') return true;
  return false; // Don't retry client errors
}
```

---

## Layer 3: Skill Escalation

After 3+ consecutive failures, a skill is automatically quarantined. This happens in the `SELF-HEAL` phase of every heartbeat:

```typescript
// Self-heal: find unstable skills
const unstableSkills = await supabase
  .from('agent_activity')
  .select('skill_name, status')
  .eq('status', 'error')
  .gte('created_at', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString())
  .order('created_at', { ascending: false });

// Group and count consecutive failures
const streaks = getConsecutiveFailureStreaks(unstableSkills);

for (const [skillName, streak] of streaks) {
  if (streak >= 3) {
    // Quarantine the skill
    await supabase.from('agent_skills')
      .update({ enabled: false, quarantine_reason: `${streak} consecutive failures` })
      .eq('name', skillName);

    // Disable dependent automations
    await disableAutomationsUsingSkill(supabase, skillName);

    // Notify admin
    await createActivityEntry(supabase, 'skill_quarantined', {
      skill_name: skillName,
      failure_streak: streak
    });
  }
}
```

The admin sees quarantined skills in the Activity Feed and can investigate before re-enabling.

---

## Layer 4: Hard Gates vs. Soft Failures

Not all errors are equal. FlowPilot distinguishes:

| Type | Examples | Behavior |
|------|----------|----------|
| **Hard failure** | Auth error, schema violation, missing required field | Abort immediately, log with full context |
| **Soft failure** | Partial result, empty response, low-confidence output | Continue with warning, log for review |
| **Expected failure** | "No leads to qualify", "No content to publish" | Treat as success, no escalation |

```typescript
function classifyFailure(error: SkillError): FailureClass {
  if (error.status === 401 || error.status === 403) return 'HARD';
  if (error.type === 'SCHEMA_VIOLATION') return 'HARD';
  if (error.type === 'EMPTY_RESULT') return 'EXPECTED';
  if (error.confidence < 0.5) return 'SOFT';
  return 'SOFT';
}
```

Hard failures abort the current operation immediately. Soft failures are logged but don't stop the heartbeat from completing other steps. Expected failures are effectively no-ops.

Without this distinction, a single "no leads to qualify today" result would abort the entire heartbeat, skip the blog planning, and miss the newsletter review. That's incorrect behavior — the agent should be resilient to empty queues.

---

## Layer 5: Heartbeat Backoff

When the heartbeat itself fails repeatedly, the system backs off the schedule:

```
Normal schedule:   Every 12 hours
1st failure:       Next run in 12h (unchanged)
2nd failure:       Next run in 24h
3rd failure:       Next run in 48h + admin notification
4th+ failure:      Heartbeat paused, admin must manually resume
```

This prevents a broken heartbeat from hammering the infrastructure:

```typescript
async function scheduleNextHeartbeat(
  supabase: SupabaseClient,
  lastResult: HeartbeatResult
): Promise<void> {
  const consecutiveFailures = await getConsecutiveHeartbeatFailures(supabase);

  const baseInterval = 12 * 60 * 60 * 1000; // 12 hours
  const multiplier = Math.min(Math.pow(2, consecutiveFailures - 1), 4); // Max 4x
  const nextInterval = baseInterval * multiplier;

  if (consecutiveFailures >= 4) {
    await pauseHeartbeat(supabase, 'Too many consecutive failures');
    await notifyAdmin(supabase, 'Heartbeat paused — manual review required');
    return;
  }

  await scheduleAt(supabase, Date.now() + nextInterval);
}
```

---

## The Anti-Patterns

| Anti-Pattern | Consequence | Fix |
|---|---|---|
| No circuit breaker | One flaky API takes down all skills | Circuit breaker with OPEN/HALF-OPEN states |
| Immediate retry | Thundering herd, rate limit death spiral | Exponential backoff with jitter |
| No failure classification | Empty queue = abort everything | Hard/soft/expected failure types |
| Permanent disable on failure | Human required for every transient error | Circuit breaker auto-resets after cooldown |
| No heartbeat backoff | Broken heartbeat hammers infrastructure | Exponential backoff on heartbeat schedule |
| No admin notification | Silent failures accumulate unnoticed | Escalation creates activity log entries |

---

## Putting It Together

A robust agent run looks like this when everything goes right:

```
Heartbeat starts → Circuit breakers all CLOSED
→ Skills execute → Some succeed, one rate-limited
→ Rate-limited skill: retry with backoff → succeeds on attempt 2
→ Heartbeat completes → Schedule next run in 12h
```

When things go wrong:

```
Heartbeat starts → One skill: circuit OPEN (3 failures yesterday)
→ Skip that skill, log as quarantined
→ Other skills execute normally
→ One skill: hard failure (auth error)
→ Abort that skill immediately, log full context
→ Other skills continue
→ Heartbeat completes (partial success)
→ Admin sees quarantine + auth error in Activity Feed
→ Schedule next run in 12h (no failure increment, partial success counts)
```

The agent doesn't give up. It doesn't fail silently. It does what it can, logs what it couldn't, and gives the admin the information to fix what needs fixing.

---

*Resilience is not about preventing failure. It's about making failure cheap, visible, and recoverable. An agent that handles failure gracefully is more trustworthy than an agent that never fails — because you know exactly what will happen when things go wrong.*

*Next: running a swarm of autonomous agents on your own infrastructure. [ClawStack →](17-clawstack.md)*
