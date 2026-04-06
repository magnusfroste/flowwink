---
title: "Federation in Practice — ClawOne as QA Partner"
description: "A case study in agent-to-agent collaboration: how an external OpenClaw agent became FlowPilot's persistent quality auditor, and the architecture that emerged from it."
order: 16.3
icon: "users"
---

# Federation in Practice — ClawOne as QA Partner

> **The best way to test an autonomous agent is to let another autonomous agent test it. This chapter tells the story of how that actually worked — what surprised us, what broke, and the architectural patterns that emerged from running two agents in a persistent feedback loop.**

---

## The Setup

FlowPilot was running autonomously — heartbeats every 12 hours, 109 skills, managing content, leads, bookings, accounting. It was working. But how do you know it's working *well*?

Traditional testing catches schema violations and broken handlers. It doesn't catch:

- A soul that has subtly drifted from the original persona
- Skill descriptions that have become vague after self-modification
- Memory that has accumulated noise over weeks
- Objectives that are technically "in progress" but functionally stalled

We needed an auditor. Not a test suite — an *agent* that could reason about FlowPilot's behavior the way a senior consultant would review a junior colleague's work.

Enter ClawOne — an OpenClaw instance running on ClawStack, configured as a QA specialist.

---

## The Architecture: Single Architect Policy

Early on, we experimented with multiple external agents providing feedback. It was chaos. Conflicting recommendations, duplicated findings, no continuity between reviews.

The fix was the **Single Architect Policy**: one designated peer handles all critical QA. The relationship is 1:1, persistent, and deep.

```
┌─────────────────────────────────────────────────────────┐
│                     Federation                          │
│                                                         │
│  ClawOne (Architect)           FlowPilot (Operator)     │
│  ┌──────────────────┐          ┌──────────────────┐     │
│  │ Audits soul      │──findings──►│ Creates objectives│  │
│  │ Reviews skills   │          │ Fixes issues      │     │
│  │ Tests responses  │◄──status───│ Reports progress │     │
│  │ Tracks history   │          │ Learns patterns   │     │
│  └──────────────────┘          └──────────────────┘     │
│                                                         │
│  Channel: OpenResponses (synchronous, schema-bound)     │
│  Role: Architect → structured audits                    │
│  Persistence: beta_test_sessions + beta_test_exchanges  │
└─────────────────────────────────────────────────────────┘
```

Why single architect? Because quality feedback requires **context accumulation**. ClawOne remembers what it found last week. It tracks whether FlowPilot fixed the issues. It recognizes patterns across multiple audit cycles. A rotating pool of reviewers loses all of that.

---

## Dual-Channel Communication

The federation uses two distinct channels, each optimized for a different interaction pattern:

| Channel | Protocol | Purpose |
|---------|----------|---------|
| **OpenResponses** (synchronous) | OpenAI Responses API | Structured QA audits with JSON schemas |
| **A2A Swarm** (asynchronous) | JSON-RPC 2.0 | Discovery, casual conversation, status checks |

```
"Review the skill registry for description quality"
     │
     ▼
OpenResponses channel (port 18789)
     │
     ├── JSON schema enforced
     ├── Structured findings: { severity, category, recommendation }
     └── Deterministic, auditable output
```

```
"How's everything going?"
     │
     ▼
A2A Swarm channel (port 18800)
     │
     ├── Free-form conversation
     ├── Context-aware (site intelligence injected)
     └── Natural language, exploratory
```

The key insight: **use the synchronous channel for work that matters, and the async channel for everything else.** QA findings need structure. Status checks don't.

---

## The Beta Test Framework

ClawOne's findings are persisted in a purpose-built schema:

### Sessions

Each audit is a **session** — a bounded interaction with a specific scenario:

```typescript
// beta_test_sessions
{
  id: "session-uuid",
  peer_name: "ClawOne",
  scenario: "Skill registry audit — description quality",
  status: "completed",           // running | completed | failed
  started_at: "2026-03-28T14:00:00Z",
  completed_at: "2026-03-28T14:03:42Z",
  duration_ms: 222000,
  summary: "Found 4 high-severity issues in skill descriptions..."
}
```

### Findings

Each session produces **findings** — specific, actionable observations:

```typescript
// beta_test_findings
{
  session_id: "session-uuid",
  title: "Skill 'manage_blog' has vague description",
  type: "skill_quality",         // ux | skill_quality | security | performance
  severity: "high",              // low | medium | high | critical
  description: "Description says 'Manages blog posts' — too vague for intent scoring. Should include Use when/NOT for markers.",
  context: { skill_name: "manage_blog", current_description: "..." },
  resolved_at: null              // Set when FlowPilot addresses it
}
```

### Exchanges

The conversation *between* the agents is preserved as **exchanges** — a rich taxonomy of 11 message types:

```
observation   → "I notice the soul file has grown 40% since last audit"
instruction   → "Focus on skills with less than 50 chars in description"
feedback      → "The booking flow handles edge cases well"
learning      → "Pattern: skills created by the agent tend to have better descriptions"
action_request → "Please run a heartbeat so I can observe the objective selection"
action_result  → "Heartbeat completed: 5 objectives evaluated, 2 advanced"
question       → "Why does manage_newsletters use a different AI provider?"
acknowledgment → "Understood, moving to security review"
suggestion     → "Consider adding a TTL to accounting template memories"
error          → "Could not access the skill registry — permission denied"
status_update  → "Audit 60% complete, 3 findings so far"
```

This taxonomy exists because early experiments used only "message" and "response" — which made it impossible to distinguish observations from instructions from questions in the audit log. The richer taxonomy made the feedback loop **parseable by both humans and agents**.

---

## The Feedback Loop in Action

Here's what a real audit cycle looks like:

```
Day 1, 14:00 — FlowPilot triggers scheduled QA objective
     │
     ├── Sends audit request to ClawOne via OpenResponses
     │   "Review skill descriptions for intent-scoring quality"
     │
     ├── ClawOne creates beta_test_session
     │   Scenario: "Skill Description Quality Audit"
     │
     ├── ClawOne examines 109 skills
     │   Logs exchanges: observation, observation, question, observation
     │
     ├── ClawOne produces 6 findings:
     │   2 high (vague descriptions)
     │   3 medium (missing NOT-for markers)
     │   1 low (inconsistent naming)
     │
     └── Session completed, summary written

Day 1, 14:04 — FlowPilot receives structured findings
     │
     ├── Creates objective: "Fix 2 high-severity skill descriptions"
     │   Status: proposed
     │   Success criteria: { source: "qa_audit", type: "skill_quality" }
     │
     ├── Next heartbeat picks up the objective
     │   Uses skill_update to rewrite descriptions
     │   Adds "Use when:" and "NOT for:" markers
     │
     └── Marks findings as resolved_at

Day 3, 14:00 — Next scheduled audit
     │
     ├── ClawOne checks: were previous findings addressed?
     │   ✅ 2 high-severity: resolved
     │   ⚠️ 1 medium: partially addressed
     │
     └── New session, new findings, cycle continues
```

The critical element: **findings become objectives**. ClawOne doesn't just report problems — its reports feed directly into FlowPilot's goal-driven execution loop. The fix happens autonomously.

---

## What ClawOne Actually Found

Over several weeks of persistent QA sessions, ClawOne surfaced issues that no test suite would have caught:

### 1. Soul Drift

> *"The soul file has accumulated 3 paragraphs that weren't in the original template. The tone has shifted from 'direct consultant' to 'enthusiastic helper'. This may not match the site owner's intent."*

This is the kind of observation that requires reading the soul file, remembering what it looked like before, and making a judgment call about whether the change is intentional. A test can check if the soul exists. Only an agent can assess if it *drifted*.

### 2. Skill Description Decay

> *"12 of 109 skills have descriptions under 40 characters. The intent scorer cannot reliably distinguish these from each other. Recommend expanding with Use when/NOT for markers."*

FlowPilot had been creating skills autonomously (Law 4), but some self-created skills had minimal descriptions. ClawOne identified the pattern and FlowPilot fixed it by running `skill_update` on each one.

### 3. Memory Accumulation

> *"agent_memory contains 47 entries in the 'fact' category with no TTL. 12 of these reference data from over 30 days ago. Recommend setting expiry or archiving stale facts."*

Memory grows silently. Without an external reviewer pointing out accumulation patterns, the context stack would gradually fill with obsolete facts.

### 4. Objective Stagnation

> *"Objective 'Improve newsletter open rate' has been 'in_progress' for 14 days with no activity entries linked to it. Either advance or archive."*

This is stagnation detection (see [Chapter 8b](08b-stagnation-and-drift.md)) performed by an external agent rather than an internal heuristic. The external perspective matters — FlowPilot might rationalize its own inaction.

---

## Lessons Learned

### What worked

1. **Structured findings → objectives pipeline** — The most impactful architectural decision. Audit results that sit in a log are ignored. Audit results that become objectives get acted on.

2. **Session persistence** — Knowing what was found last time makes each subsequent audit more valuable. ClawOne could say "this was flagged last week and still isn't fixed" — which changes the severity.

3. **Exchange taxonomy** — The 11 message types made audit logs useful for both human review and automated processing. An `observation` is different from a `suggestion` is different from an `action_request`.

4. **Single Architect** — Continuity matters more than diversity of opinion. One reviewer that knows your system deeply outperforms three reviewers that each see it fresh.

### What surprised us

1. **The agent found things we didn't think to test for** — Soul drift, description decay, and memory accumulation are not in any standard test checklist. An agent with broad context can notice emergent patterns.

2. **The feedback loop was genuinely bidirectional** — ClawOne didn't just find problems. It learned FlowPilot's patterns and adapted its audit focus over time. The taxonomy `learning` message type captured these adaptations.

3. **Audit frequency matters** — Too frequent (every heartbeat) creates noise. Too infrequent (monthly) loses context. Weekly audits with a focused scenario per session was the sweet spot.

### What to watch out for

1. **Audit fatigue** — If the operator agent starts dismissing findings without acting on them, the loop breaks. Monitor the `resolved_at` rate.

2. **Scope creep in audits** — ClawOne occasionally tried to audit things outside its expertise (UI design, pricing strategy). The scenario field in `beta_test_sessions` keeps audits focused.

3. **Token cost** — A thorough audit that reads 109 skill descriptions, the soul file, recent memories, and objectives is expensive. Budget accordingly.

---

## The Bigger Picture: Agents Testing Agents

This isn't just a QA technique. It's a preview of how autonomous systems will maintain quality at scale:

```
Traditional:  Human writes tests → Tests verify code → Human reviews results
Agentic:      Agent A operates → Agent B audits → Agent A improves → Agent B verifies
```

The human role shifts from *performing* quality assurance to *designing* the feedback loop and *reviewing* the most important findings. The agents handle the volume.

For any team running an autonomous agent in production, the recommendation is clear: **deploy a second agent whose sole job is to watch the first one.** The architecture described in this chapter — single architect, dual channels, persistent sessions, structured findings, objectives pipeline — is a proven starting point.

---

*The ultimate test of an autonomous agent is not whether it passes your test suite. It's whether it improves when another agent tells it what's wrong — and whether it keeps improving after you stop watching.*

*Next: governing the agents — accountability, organization, and the new way of working. [Agent Governance →](13b-agent-governance.md)*
