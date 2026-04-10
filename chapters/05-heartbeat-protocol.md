---
title: "The Heartbeat Protocol"
description: "The 7-step autonomous loop — self-heal, propose, plan, advance, automate, reflect, remember."
order: 9
icon: "heart"
---

# The Heartbeat Protocol — How FlowPilot Operates Autonomously

> **The heartbeat is the agent's autonomous operating cycle. It's what separates a tool from an employee. OpenClaw proved the concept with a simple HEARTBEAT.md checklist. Flowwink evolved it into a structured 7-step protocol.**

---

## What Is a Heartbeat?

A heartbeat is a scheduled, self-directed execution cycle. Unlike a cron job that runs a fixed script, a heartbeat triggers a reasoning loop that decides what to do based on current state.

**OpenClaw's approach** (verified from source): The agent reads `HEARTBEAT.md` — a simple checklist file in the workspace. The prompt is: *"Read HEARTBEAT.md if it exists. Follow it strictly. If nothing needs attention, reply HEARTBEAT_OK."* Default interval: 30 minutes. The model decides autonomously what to do based on the checklist.

**Flowwink's evolution**: FlowPilot replaces the freeform checklist with a structured 7-step protocol, backed by a PostgreSQL objective/plan system. The heartbeat is no longer just a checklist — it's an autonomous operating cycle with self-healing, proactive planning, execution, and reflection.

```
Traditional Cron:    Schedule → Script → Result
Agent Heartbeat:     Schedule → Reason → Decide → Act → Learn → Repeat
```

The agent wakes up, looks at the current state of the business, decides what needs attention, and acts. Then it reflects on what happened and saves what it learned.

---

## Heartbeat in Action — A Day with FlowPilot

To make this concrete, here's what an actual heartbeat cycle looks like for a mid-size B2B company:

### 00:00 — FlowPilot wakes up

The `flowpilot-heartbeat` edge function fires. The agent loads context in parallel:

```
Context loaded:
├── Soul: "Growth-focused B2B marketing agent"
├── Memories: 30 most recent (including: "Blog posts with data viz get 3x engagement")
├── Objectives: 3 active (1 in-progress, 2 pending)
├── Site stats (7d): 2,140 page views, 12 new leads, 3 bookings
├── Recent activity: Newsletter sent 2 days ago (34% open rate)
├── Automations: 4 enabled (2 due now)
└── Self-heal report: 0 skills quarantined
```

### Step 1: Self-Heal

No failing skills. Clean bill of health.

### Step 2: Propose

The agent analyzes the stats:
- Blog output dropped to 1 post this month (target: 4)
- Lead conversion rate is 3.2% (down from 4.1% last month)
- Newsletter engagement is strong (34% open rate)

New objective created: **"Publish 2 more blog posts this month"**

### Step 3: Plan

The agent decomposes the new objective into steps:

```
Objective: "Publish 2 more blog posts this month"
├── Step 1: research_content (topic: "AI trends in B2B marketing")
├── Step 2: write_blog_post (draft)
├── Step 3: seo_audit_page (optimize)
└── Step 4: publish_scheduled_content (schedule for Thursday)
```

### Step 4: Advance

The agent executes the first step: `research_content`. It searches the web for trending topics, analyzes competitor content, and saves a content brief. The plan is now 25% complete — it will pick up at Step 2 in the next heartbeat.

### Step 5: Automate

Two automations are due:
1. **Daily lead qualification**: Scans the 2 new leads from today, scores them, generates qualification summaries. Lead #1 scores 78 (high — suggests creating a deal). Lead #2 scores 34 (low — personal email, no company domain).
2. **Weekly analytics digest**: Compiles 7-day stats into a summary for the admin.

### Step 6: Reflect

The agent looks at its last 7 days:
- 14 actions executed, 12 succeeded, 2 failed (both were API timeouts on web search)
- Blog posts published last week got 450 views — above average
- Lead qualification accuracy: "Scores > 70 had 60% conversion rate"

Learning persisted: *"API timeouts on web search are common between 02:00-04:00 UTC. Avoid scheduling research-heavy tasks during this window."*

### Step 7: Remember

Three new memories saved:
- `fact:blog_performance`: "Posts with data visualizations get 3x engagement"
- `context:scheduling`: "Avoid web search between 02:00-04:00 UTC"
- `preference:lead_threshold`: "Score > 70 = suggest deal creation"

### 00:47 — Heartbeat complete

```
HEARTBEAT REPORT (fp_m2x7k9_abc123):
- Self-heal: 0 skills quarantined
- Proposed: 1 new objective ("Publish 2 more blog posts")
- Planned: 1 objective decomposed (4 steps)
- Advanced: 1 step executed (research_content — content brief saved)
- Automated: 2 automations executed (daily lead qual, weekly digest)
- Reflected: 7-day performance analyzed, 1 learning persisted
- Remembered: 3 new memories saved
- Duration: 45s | Tokens: 12,400 | Status: HEARTBEAT_OK
```

The admin sees this in the Activity Feed the next morning. No action needed — FlowPilot handled it.

---

## The 7-Step Protocol

Every heartbeat follows the same 7-step protocol:

```
┌─────────────┐
│  1. HEAL    │ ← Quarantine failing skills
└──────┬──────┘
       ▼
┌─────────────┐
│  2. PROPOSE │ ← Create objectives from patterns
└──────┬──────┘
       ▼
┌─────────────┐
│  3. PLAN    │ ← AI decomposes objectives into steps
└──────┬──────┘
       ▼
┌─────────────┐
│  4. ADVANCE │ ← Execute plan steps (highest priority)
└──────┬──────┘
       ▼
┌─────────────┐
│ 5. AUTOMATE │ ← Run DUE cron/event/signal automations
└──────┬──────┘
       ▼
┌─────────────┐
│ 6. REFLECT  │ ← Analyze performance, persist learnings
└──────┬──────┘
       ▼
┌─────────────┐
│ 7. REMEMBER │ ← Save insights to memory
└──────┬──────┘
       │
       └──▶ (repeat on schedule)
```

### Step 1: Self-Heal

Before doing anything new, the agent checks for problems:

```
runSelfHealing(supabase)
  │
  ├── Query agent_activity for recent failures per skill
  ├── Skills with 3+ consecutive failures → quarantine (disable)
  ├── Disable linked automations
  └── Return healing report
```

**Why first?** Because a broken skill will cause cascading failures. Better to quarantine it before the agent tries to use it.

### Step 2: Propose

The agent analyzes current state and creates new objectives if gaps are found:

```
Input: Site stats (7 days), recent activity, current objectives
  │
  ├── Low blog output? → propose_objective("Increase blog output")
  ├── Lead conversion dropping? → propose_objective("Improve lead qualification")
  ├── New competitor detected? → propose_objective("Competitive analysis")
  └── No action in 3+ days? → propose_objective("Re-engage audience")
```

**This is proactive reasoning.** The agent identifies problems before being told about them.

### Step 3: Plan

For objectives without plans, the AI decomposes them into executable steps:

```
decompose_objective("Increase blog output to 4 posts/month")
  │
  ├── Step 1: Research trending topics (search_web)
  ├── Step 2: Draft first blog post (write_blog_post)
  ├── Step 3: SEO optimization (seo_audit_page)
  ├── Step 4: Schedule publication (publish_scheduled_content)
  └── Step 5: Share on social (generate_social_post)
```

Plans are stored in the objective's `progress.plan` JSON. Steps persist between heartbeats — the agent picks up where it left off.

### Step 4: Advance

The agent executes the highest-priority plan steps:

```
advance_plan(objective_id, chain=true)
  │
  ├── Load current plan state
  ├── Find next pending step
  ├── Execute via agent-execute (up to 4 steps per call)
  ├── Update step status (done/pending/failed)
  └── Continue to next objective if time permits
```

**Priority scoring** determines which objectives get advanced first:

| Factor | Score |
|--------|-------|
| Overdue deadline | +50 |
| Deadline < 1 day | +40 |
| Priority: critical | +35 |
| In-progress plan (>0%, <100%) | +15 |
| Near completion (>70%) | +10 |

### Step 5: Automate

The agent executes any automations that are due:

```
automation-dispatcher
  │
  ├── Query agent_automations WHERE next_run_at <= now
  ├── For each DUE automation:
  │   ├── Execute linked skill with stored parameters
  │   ├── Update last_run_at, compute next_run_at
  │   └── Log result to agent_activity
  └── Signal dispatcher: evaluate conditions on recent signals
```

Automations can be triggered by:
- **Cron**: Fixed schedule (daily, weekly, hourly)
- **Event**: Database trigger (new lead, form submission)
- **Signal**: Condition evaluation (lead score ≥ 50)
- **External**: Webhook ingestion

### Step 6: Reflect

The agent analyzes its own performance:

```
reflect()
  │
  ├── Query agent_activity for last 7 days
  ├── Analyze: successful actions, failures, patterns
  ├── Identify: what worked, what didn't, what to try
  ├── Auto-persist top learnings to agent_memory
  └── Return reflection summary
```

**This is the learning loop.** The agent doesn't just execute — it evaluates its own execution and improves.

### Step 7: Remember

New insights are saved to persistent memory:

```
memory_write({
  key: "lesson:blog_engagement_2026-04",
  category: "fact",
  content: "Posts with data visualizations get 3x more engagement
            than text-only posts. Prioritize stats blocks.",
  importance: 0.8
})
```

These memories are loaded into future heartbeats and conversations. The agent literally gets smarter over time.

---

## Context Loading

Before reasoning, the heartbeat loads context in parallel:

```
Parallel Context Loading:
  ├── Soul & Identity (agent_memory)
  ├── Memories (30 most recent)
  ├── Objectives (priority-sorted)
  ├── Recent activity (24h)
  ├── Site stats (7 days)
  ├── Enabled automations (with DUE markers)
  └── Self-healing report
```

This context is injected into the system prompt via the 6-layer prompt compiler. The agent sees the full state of the business before it starts reasoning.

---

## Scheduling

The heartbeat frequency is admin-configurable:

| Job | Default Schedule | Configurable |
|-----|-----------------|--------------|
| `flowpilot-heartbeat` | Twice daily (00:00, 12:00) | Frequency + hours + timezone |
| `flowpilot-daily-briefing` | 07:00 local | Hour + timezone |
| `flowpilot-learn` | 03:00 local | Hour + timezone |
| `automation-dispatcher` | Every minute | Fixed |
| `publish-scheduled-pages` | Every minute | Fixed |

**Why twice daily?** CMS operations are less time-sensitive than personal assistant tasks. A blog post doesn't need to be published within 30 minutes. But a lead should be qualified within hours, not days.

---

## Safety Guards

The heartbeat has multiple safety mechanisms:

| Guard | Threshold | Behavior |
|-------|-----------|----------|
| Wall-clock timeout | 120s | Hard abort |
| Anti-runaway | 2+ consecutive tool errors | Session abort |
| Token budget | 80k tokens | Stop reasoning |
| Iteration cap | 8 tool rounds | Stop after N rounds |
| Pre-budget flush | 80% budget used | Extract facts, focus on completion |

These prevent the heartbeat from:
- Running forever (timeout)
- Cascading failures (anti-runaway)
- Burning through API credits (token budget)
- Getting stuck in loops (iteration cap)

### The Continuation Nudge

There's a fifth failure mode not covered by the table above: **the agent stalls mid-task** — it generates neither a tool call nor a final answer. This happens when the model produces a reasoning block without a conclusion, effectively going silent.

FlowPilot detects this and injects a **continuation nudge** — a system message inserted into the conversation that prompts the agent to either act or conclude:

```
System: "It looks like you paused mid-task. Please either:
1. Call the next appropriate tool to continue, or
2. Provide a summary of what you've accomplished and any blockers.
Do not leave the task incomplete without explanation."
```

The nudge fires after detecting N consecutive turns with no tool call and no `HEARTBEAT_OK` signal. Maximum 2 nudges per session — if the agent still doesn't respond meaningfully, the session aborts and logs a stall event.

Without the nudge, stalls are invisible: the heartbeat appears to have run, token costs are incurred, but nothing actually happened.

---

## The Heartbeat Report

After each heartbeat, a summary is logged:

```
HEARTBEAT REPORT (fp_m2x7k9_abc123):
- Self-heal: 0 skills quarantined
- Proposed: 1 new objective ("Competitive analysis for Q2")
- Planned: 2 objectives decomposed
- Advanced: 3 plan steps executed (blog post drafted, SEO audit completed)
- Automated: 2 automations executed (daily digest, lead qualification)
- Reflected: 7-day performance analyzed, 2 learnings persisted
- Remembered: 3 new memories saved
- Duration: 45s | Tokens: 12,400 | Status: HEARTBEAT_OK
```

This report is visible in the admin Activity Feed and feeds into the next heartbeat's context.

---

## Autonomous vs Automations — Two Different Things

A common source of confusion: **autonomous operation** and **automations** are not the same.

| | Autonomous (Heartbeat) | Automations |
|--|----------------------|-------------|
| **Who decides?** | The agent reasons about what to do | A predefined rule triggers execution |
| **What runs?** | The full ReAct loop (reason → plan → act) | A specific skill with stored parameters |
| **When?** | On schedule (12h cron) | When due (cron, event, signal) |
| **Example** | "I notice leads are dropping — let me research and write a blog post" | "Every day at 09:00, qualify new leads" |
| **Thinking** | Full LLM reasoning | None — deterministic execution |

**Autonomous** = the agent thinks. It looks at the current state, decides what needs attention, creates plans, and executes them. This is the heartbeat's Steps 2-4 (Propose, Plan, Advance).

**Automations** = the agent executes. Predefined rules that say "run skill X with parameters Y when condition Z is met." No reasoning, no planning — just execution. This is Step 5 (Automate).

**How they work together:**
- The **autonomous** cycle identifies patterns: "We should be publishing more blog posts"
- It creates an **automation**: "Every Monday, research trending topics"
- The **automation** runs on schedule, but the **agent** reviews results and adjusts

The agent can also create, modify, and disable automations. This is part of its self-evolution capability (Law 4).

---

*The heartbeat is the agent's metabolism. Just as a heartbeat sustains life by circulating blood, the agent's heartbeat sustains autonomous operation by cycling through healing, planning, executing, and learning.*

*Next: concurrency, trace IDs, and the observability layer that keeps agents from colliding. [Concurrency & Observability →](05c-concurrency-observability.md)*
