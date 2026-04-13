---
title: "Making Your SaaS Agent-Ready"
subtitle: "How to expose a business platform for external orchestration via MCP"
part: 3
chapter: 12
read_when: "Preparing a SaaS product for multi-agent federation and external orchestration"
prerequisites: ["Embedded vs. Orchestrated Autonomy", "The Three Pillars of Skill Interoperability"]
---

# Making Your SaaS Agent-Ready

> How to transform a closed business platform into an open, orchestratable node in an agentic network — without losing your competitive edge.

---

## The Problem

You have a SaaS platform. It runs business logic — CRM, e-commerce, content, bookings, accounting. Today, a human operates it through a GUI. Tomorrow, an external AI agent needs to operate it on the human's behalf.

The question isn't *whether* this will happen. It's whether your platform will be the one that gets orchestrated — or the one that gets replaced.

## The Mindset Shift

Traditional SaaS thinking: **protect everything, expose nothing**.

Agentic SaaS thinking: **expose operations, protect identity**.

```
OLD MODEL                          NEW MODEL
┌─────────────┐                    ┌─────────────┐
│  Closed API  │                    │  MCP Surface │ ← External agents
│  GUI only    │                    │  ───────────│
│  Human ops   │                    │  Embedded    │ ← Native agent
└─────────────┘                    │  Agent       │
                                   └─────────────┘
```

The new model has two access layers:
1. **MCP Surface** — what external agents can see and do
2. **Embedded Agent** — the native operator with deep context

Both operate on the same business data. The difference is depth, not access.

---

## Step 1: Audit Your Skills

Every operation your platform performs is a "skill." Before exposing anything, categorize every skill into one of two buckets:

### Business Skills (Expose)

These operate on **platform data** — the data that belongs to the customer, not the agent:

| Category | Examples |
|----------|----------|
| Content | `write_blog_post`, `manage_page`, `publish_newsletter` |
| CRM | `add_lead`, `qualify_lead`, `manage_deal` |
| Commerce | `check_order_status`, `manage_product`, `process_refund` |
| Booking | `check_availability`, `book_appointment` |
| Accounting | `create_invoice`, `record_expense` |
| Communication | `send_newsletter`, `manage_webinar` |

**Rule: If a human employee would need this tool to do their job, an external agent needs it too.**

### Agent-Internal Skills (Protect)

These operate on **agent state** — the cognitive infrastructure of your embedded agent:

| Category | Examples | Why Protected |
|----------|----------|---------------|
| Identity | `soul_update`, `identity_edit` | Cognitive sovereignty |
| Memory | `memory_write`, `memory_delete` | Prevents contamination |
| Reflection | `reflect`, `self_evaluate` | Internal process |
| Orchestration | `heartbeat_update`, `dispatch_mission` | Infrastructure |
| Federation | `a2a_handshake`, `peer_manage` | Security boundary |

**Rule: If it changes how the agent thinks rather than what the platform does, it stays internal.**

### The 90/10 Target

Aim for **~90% of business skills exposed**, **~0% of agent-internal skills exposed**. In our case: 110 of 126 skills (87%) are MCP-exposed, with 16 kept internal.

---

## Step 2: Enrich Tool Definitions

Exposing a skill isn't just flipping a boolean. External agents lack the institutional knowledge your embedded agent has. Every exposed skill needs three layers:

### The Three Pillars

```
┌──────────────────────────────────────────────────┐
│  PILLAR 1: Tool Definition                       │
│  JSON Schema — parameters, types, required       │
│  → Machine-readable. Enables execution.          │
├──────────────────────────────────────────────────┤
│  PILLAR 2: Description                           │
│  Natural language — what it does, when to use    │
│  → Enables intent routing and skill selection.   │
├──────────────────────────────────────────────────┤
│  PILLAR 3: Instructions                          │
│  Domain expertise — how to use it well           │
│  → Enables competent execution.                  │
└──────────────────────────────────────────────────┘
```

**Pillar 1** is table stakes — every API has a schema.

**Pillar 2** is what most people miss. A good description includes:
- What the tool does (one sentence)
- `Use when:` — explicit trigger conditions
- `NOT for:` — disambiguation from similar tools

Example:
```
"Browse published blog posts (visitor-facing).
 Use when: a user asks to see latest blog articles;
 you need to find existing blog content to link to.
 NOT for: managing blog post drafts (manage_blog_posts);
 listing blog categories (manage_blog_categories)."
```

**Pillar 3** is your embedded agent's secret advantage. Instructions contain domain expertise that external agents don't receive:
- Business rules ("always check stock before confirming orders")
- Workflow sequences ("after qualifying a lead, check for existing deals")
- Edge case handling ("if the customer is in EU, apply VAT rules")

> **Strategic note:** MCP currently has no `instructions` field. You can stuff instructions into the description, serve them as MCP resources, or keep them as your embedded agent's competitive advantage.

---

## Step 3: Implement Concurrency Controls

When two agents operate on the same platform, they will collide. The same lead gets contacted twice. The same order gets processed twice.

### The Lock Pattern

```
Agent A → acquire_lock("lead_xyz", ttl=60s)
  → Lock granted
  → Agent A works on lead_xyz
  → release_lock("lead_xyz")

Agent B → acquire_lock("lead_xyz", ttl=60s)
  → Lock denied (Agent A holds it)
  → Agent B moves to next task
```

Implementation: a `locks` table with lane-based advisory locks and automatic TTL expiry.

```sql
CREATE TABLE agent_locks (
  lane TEXT PRIMARY KEY,
  locked_by TEXT NOT NULL,
  locked_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + interval '60 seconds'
);

CREATE FUNCTION try_acquire_agent_lock(p_lane TEXT, p_agent TEXT, p_ttl INT DEFAULT 60)
RETURNS BOOLEAN AS $$
  -- Delete expired locks first
  DELETE FROM agent_locks WHERE expires_at < now();
  -- Try to insert
  INSERT INTO agent_locks (lane, locked_by, expires_at)
  VALUES (p_lane, p_agent, now() + (p_ttl || ' seconds')::interval)
  ON CONFLICT (lane) DO NOTHING;
  -- Check if we got it
  RETURN EXISTS (
    SELECT 1 FROM agent_locks
    WHERE lane = p_lane AND locked_by = p_agent
  );
$$ LANGUAGE sql;
```

**Expose `acquire_lock` and `release_lock` as MCP tools.** Without this, multi-agent operation is unsafe.

---

## Step 4: Add Observability Resources

External agents need to understand the platform's current state without polling every table. MCP Resources provide read-only snapshots:

| Resource URI | Content | Purpose |
|-------------|---------|---------|
| `platform://health` | Module status, error rates, uptime | Situational awareness |
| `platform://activity` | Recent operations (last 20) | Coordination |
| `platform://identity` | Platform personality, brand voice | Consistency |
| `platform://objectives` | Active goals, progress, lock status | **Strategic alignment** — prevents duplicate work |
| `platform://automations` | Scheduled tasks, triggers, run history | **Avoids duplication** — external agent sees what's automated |
| `platform://heartbeat` | Last run timing, state, token usage | **Operational timing** — know when the embedded agent last acted |

### Why Each Resource Matters for External Orchestrators

**Objectives:** Without visibility into active goals, an external agent operates blind. It might invest effort advancing a goal that FlowPilot already completed, or miss that a critical objective is blocked. The objectives resource provides the strategic context that a vertically integrated agent gets for free from its database access.

**Automations:** FlowPilot schedules recurring work — weekly newsletters, daily lead scoring, hourly content checks. An external orchestrator without this visibility will duplicate work that's already handled. The automations resource is essentially a "don't touch this, it's already running" signal.

**Heartbeat:** The embedded agent's proactive loop runs on a schedule. An external agent needs to know: Did it just run? Is it mid-execution? When will it next run? Without this, the orchestrator can't time its own operations to complement rather than collide with the embedded agent.

**Rule: Resources are read-only. They inform, they don't mutate.**

---

## Step 5: Define the Trust Boundary

Not all external agents are equal. Implement trust tiers:

| Tier | Access | Example |
|------|--------|---------|
| **Trusted Peer** | Full business skills + lock tools | OpenClaw with verified credentials |
| **Limited Peer** | Read-only resources + subset of skills | Analytics agent, monitoring bot |
| **Untrusted** | Public resources only | Discovery, capability queries |

Gate access through:
- **API key validation** — hash-verified keys with scopes
- **Skill-level flags** — `requires_approval: true` for destructive operations
- **Rate limiting** — prevent runaway agents from overwhelming the system

---

## The Result: A Federated Business Node

After these five steps, your SaaS is no longer a closed application. It's a **node in an agentic network**:

```
┌──────────────────────────────────────────────────────┐
│                   YOUR SAAS PLATFORM                  │
│                                                      │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Embedded   │  │ MCP Surface  │  │ Observability│ │
│  │ Agent      │  │ ~90% skills  │  │ Resources    │ │
│  │ (deep)     │  │ + lock tools │  │ (read-only)  │ │
│  └────────────┘  └──────┬───────┘  └──────────────┘ │
│                         │                            │
└─────────────────────────┼────────────────────────────┘
                          │
            ┌─────────────┼─────────────┐
            │             │             │
       ┌────┴────┐  ┌────┴────┐  ┌────┴────┐
       │OpenClaw │  │ Partner │  │Analytics│
       │Orchestr.│  │  Agent  │  │  Agent  │
       └─────────┘  └─────────┘  └─────────┘
```

### The Moat Paradox

By opening up, you don't lose your competitive advantage — you **shift** it:

- **Old moat:** Locked-down API, forced GUI usage → easily replaceable
- **New moat:** Deep domain logic, proactive embedded agent, institutional memory → indispensable

The platform that's easiest to orchestrate becomes the hardest to replace. Every external agent that integrates with your MCP surface creates a dependency. Every workflow that relies on your business rules makes switching costs higher.

**Openness is the new lock-in.**

---

## The Three Scenarios: A → B → C

Making a SaaS agent-ready isn't one thing — it's three distinct scenarios with increasing complexity:

### Scenario A: Embedded Agent (Vertical Integration)

```
┌─────────────────────────┐
│  SaaS Platform          │
│  ┌───────────────────┐  │
│  │ Embedded Agent    │  │
│  │ (FlowPilot)       │  │
│  │ Skills + Memory   │  │
│  │ + Objectives      │  │
│  └───────────────────┘  │
└─────────────────────────┘
```

The agent lives inside the platform. It has direct database access, deep context, institutional memory, and a proactive heartbeat. **No MCP surface needed** — the agent *is* the platform.

**What you need:** Steps 1-2 (Skill audit + Three Pillars) for internal quality. Steps 3-5 are irrelevant — there's no external agent to coordinate with.

### Scenario B: External Orchestrator (Horizontal)

```
┌─────────────────────────┐
│  SaaS Platform          │
│  ┌───────────────────┐  │
│  │ MCP Surface       │  │
│  │ ~90% skills       │  │
│  │ + health/identity │  │
│  └────────┬──────────┘  │
└───────────┼─────────────┘
            │
       ┌────┴────┐
       │External │
       │Agent    │
       └─────────┘
```

No embedded agent. An external orchestrator (like OpenClaw) operates the platform via MCP tools. **The platform is a "dumb shell"** that the external agent brings to life.

**What you need:** Steps 1-2 (Skill audit + Three Pillars) + Step 5 (Trust boundaries). Locks and agent-state resources (heartbeat, objectives) are unnecessary — there's only one operator.

### Scenario C: Hybrid Multi-Agent (The Hard One)

```
┌─────────────────────────────────────────┐
│  SaaS Platform                          │
│  ┌──────────┐  ┌──────────┐  ┌───────┐ │
│  │Embedded  │  │MCP       │  │Observ.│ │
│  │Agent     │  │Surface   │  │Resourc│ │
│  │(deep)    │  │+ locks   │  │es     │ │
│  └──────────┘  └────┬─────┘  └───────┘ │
└─────────────────────┼──────────────────┘
                      │
                 ┌────┴────┐
                 │External │
                 │Agent    │
                 └─────────┘
```

Both an embedded agent AND an external orchestrator operate simultaneously. **This is where concurrency locks, objective visibility, and heartbeat status become critical.** Two agents sharing one workspace must coordinate to avoid collisions.

**What you need:** All five steps. This is the full architecture.

### Implementation Roadmap

| Phase | Scenario | Focus | Complexity |
|-------|----------|-------|------------|
| **Phase 1** | A — Embedded only | Prove the vertical model works | ★★☆ |
| **Phase 2** | B — External only | Prove MCP surface is sufficient | ★★★ |
| **Phase 3** | C — Hybrid | Multi-agent coordination | ★★★★★ |

**Rule: Don't build C until you've proven A and B independently.** The hardest problem in multi-agent systems isn't giving agents tools — it's making them collaborate without stepping on each other.

---

## Checklist

### Always Required (A, B, C)
- [x] Audit all skills → categorize as Business vs Agent-Internal
- [x] Set `mcp_exposed = true` on all business skills (110/126 = 87%)
- [x] Enrich descriptions with `Use when:` / `NOT for:` markers
- [x] Keep agent-internal skills (soul, memory, reflection) private (16 skills)

### Required for B and C (External Access)
- [x] Define trust tiers and API key scoping
- [x] Expose business skills via MCP + REST compatibility layer

### Required for C Only (Multi-Agent Coordination)
- [x] Implement advisory locks with TTL expiry (`agent_locks` table)
- [x] Expose lock/release as MCP tools + REST endpoints
- [x] Add observability resources (objectives, automations, heartbeat)

---

## FlowWink Implementation Status (April 2026)

| Component | Status | Scenario | Details |
|-----------|--------|----------|---------|
| **Skill Exposure** | ✅ Done | A, B, C | 110/126 skills (87%) exposed via MCP |
| **Three Pillars** | ⚠️ Partial | A, B, C | Definition + Description complete. Instructions kept as embedded agent advantage. |
| **Trust Boundaries** | ✅ Done | B, C | API key auth with scopes, 16 internal-only skills |
| **Concurrency Locks** | ✅ Built | C | `acquire_lock` + `release_lock` — ready but relevant for hybrid only |
| **Observability** | ✅ Built | C | objectives, automations, heartbeat resources — ready but relevant for hybrid only |

### Current Phase: B (External Orchestrator Validation)

Testing whether OpenClaw can effectively operate FlowWink via MCP tools alone, without FlowPilot's deep context and instruction layer.

### MCP Surface Summary

**Tools:** ~110 business skills + `acquire_lock` + `release_lock`
**Resources:** 10 read-only snapshots (health, skills, modules, activity, peers, identity, templates, objectives, automations, heartbeat)
**REST compatibility:** Full mirror at `/rest/tools`, `/rest/resources/:key`, `/rest/execute`, `/rest/lock/acquire`, `/rest/lock/release`

---

## Agent Governance: Who Drives?

The most consequential architectural decision in any agentic SaaS isn't which tools to expose — it's **where objectives live**. This determines who sets the agenda, who measures progress, and who course-corrects when things go wrong.

### The Two Models

#### Model 1: Objectives in the Orchestrator

The external agent (e.g., OpenClaw) owns all goals. The SaaS platform is pure "claws" — hands that execute, with no will of their own.

```
┌─────────────┐         ┌─────────────┐
│ Orchestrator │ ──────→ │  SaaS       │
│ (brain)      │  goals  │  (claws)    │
│ "Drive here" │         │  "Yes sir"  │
└─────────────┘         └─────────────┘
```

| Pros | Cons |
|------|------|
| One agent, one plan — no conflicts | Orchestrator lacks deep domain context |
| Orchestrator sees the full picture across systems | Every goal needs explicit instruction — no proactivity |
| SaaS stays simple — just skills, no "will" | If orchestrator goes down → nothing drives goals forward |
| Natural fit for Scenario B | "Dumb terminal" risk: the SaaS becomes replaceable |

#### Model 2: Objectives in the SaaS

The platform has its own agenda. The orchestrator acts as strategic advisor, not driver.

```
┌─────────────┐         ┌─────────────┐
│ Orchestrator │ ←read── │  SaaS       │
│ (advisor)    │         │  (operator) │
│ "I see gaps" │         │  "On it"    │
└─────────────┘         └─────────────┘
```

| Pros | Cons |
|------|------|
| Proactivity preserved — heartbeat drives goals autonomously | Two "wills" in Scenario C — requires governance protocol |
| Deep domain context informs goal selection | Orchestrator can't freely redefine priorities |
| Resilience — system works without orchestrator | More complex architecture |
| Orchestrator can read objectives and coordinate without owning them | |

### The Taxi Driver Insight

A pure orchestrator without domain context is a **taxi driver who doesn't know the city**. It can drive where you point, but it never suggests better routes.

That's *exactly* what an embedded agent does that an external orchestrator cannot: **proactively propose goals based on what it sees in the data.**

- The embedded agent notices "we have zero blog posts" and proposes a content objective
- The orchestrator only acts when explicitly told "write a blog post"

### Governance Per Scenario

| Scenario | Who owns objectives? | Why |
|----------|---------------------|-----|
| **A — Embedded only** | The SaaS (FlowPilot) | It's the only operator. Proactivity is the product. |
| **B — External only** | The Orchestrator | Clean separation. SaaS = claws. No competing wills. |
| **C — Hybrid** | Both — with protocol | Embedded agent proposes, orchestrator can override. Requires conflict resolution. |

### The Strategic Implication

> **Scenario B tests whether external control works operationally.**
> **But it also reveals what is lost without embedded intelligence — and that is proactivity.**

This is the real "moat" of an agentic SaaS platform: not the API surface (which is open), but the **embedded operator that knows the domain deeply enough to act without being asked.**

An orchestrator can replace the *execution layer*. It cannot replace the *initiative layer* — unless it builds the same depth of domain context, at which point it's no longer external. It has become embedded.

---

## The Plugin Thesis — From Polling to Residency (2027–2030)

The convenience gradient described above isn't a permanent moat — it's a **challenge that the industry will solve**. Here's how.

### The Real Cost of MCP Polling (It's Not Latency)

A common first instinct is that the embedded agent's advantage is **network latency** — fewer hops, faster response. But this argument collapses under scrutiny:

> **If the orchestrator and the SaaS run in the same cloud region (or even the same datacenter), each MCP hop is <5ms. Twelve calls = 60ms. That's noise compared to AI inference time (2–8 seconds).**

Critics are right to dismiss latency. Cloud AI models like Anthropic, OpenAI, and Gemini all run in remote datacenters — nobody worries about the round-trip to the model. Why would the round-trip to an MCP resource be different?

**It wouldn't.** The real costs are elsewhere:

#### 1. Token Economics (The Actual Moat)

Every MCP resource call returns serialized data that the orchestrator must include in its prompt. A native agent uses a **prompt compiler** that selects and compresses only what's relevant:

```
Native agent:       DB query → compiler picks 800 relevant tokens → prompt
External agent:     12 MCP calls → 12 full JSON payloads → ~6,000 tokens of raw context
```

At scale (heartbeat every 30 minutes, 48 cycles/day), the token difference compounds:

| | Native (Compiled) | External (MCP) |
|---|---|---|
| Context tokens per cycle | ~800 | ~6,000 |
| Daily token cost (48 cycles) | ~38,400 | ~288,000 |
| Monthly overhead | ~1.15M tokens | ~8.64M tokens |
| **Cost multiplier** | **1×** | **~7.5×** |

This isn't about speed — it's about **cost per decision**. The native agent makes cheaper decisions because it never serializes data it doesn't need.

#### 2. Orchestration Complexity

The native agent runs **one function** that reads the database and builds a prompt. The external orchestrator must:

- Manage 12+ MCP tool/resource calls per context assembly
- Handle partial failures (what if `resource://objectives` times out but `resource://health` succeeds?)
- Maintain session state across calls
- Deduplicate overlapping context from different resources
- Handle schema evolution when the SaaS updates its MCP interface

This is solvable engineering — but it's engineering that the native agent simply doesn't need.

#### 3. Proactivity Gap (The Heartbeat Problem)

The most significant difference isn't speed or cost — it's **who initiates**. The native agent has a heartbeat cron that triggers automatically. The external orchestrator must either:

- **Poll continuously** — expensive in tokens and API calls
- **React to webhooks** — loses the "check the pulse" proactivity that catches problems before they're visible
- **Run its own scheduler** — adding infrastructure that replicates what the SaaS already has

### The Inevitable Evolution: Orchestrator Plugins

The solution is predictable: orchestrators will deploy **local plugins** (call them "Residents", "Envoys", or "Nerves") inside each SaaS system they manage.

```
2026 (Today):    Orchestrator ──MCP──→ SaaS (12 calls per session)
2028 (Near):     Orchestrator ──owns──→ Plugin-in-SaaS (1 briefing per session)
2030 (Mature):   Orchestrator ──owns──→ Resident (continuous local awareness)
```

A plugin is essentially the orchestrator's **local prompt compiler**:

| Capability | MCP Polling (Today) | Resident Plugin (Tomorrow) |
|------------|--------------------|-----------------------------|
| Context assembly | 12 calls, ~6,000 tokens | Single compiled briefing, ~800 tokens |
| Proactive triggers | External scheduler/polling | Native heartbeat inside SaaS |
| Domain awareness | Cold-start every session | Persistent, always warm |
| Token cost per cycle | ~6,000 | ~800 (same as native agent) |
| Network latency | ~60ms (negligible) | ~5ms (also negligible) |

### What This Means for SaaS Platforms

The plugin becomes the orchestrator's **prompt compiler** — the exact same component that gives embedded agents their token efficiency today. The key insight:

> **The moat isn't network latency (that's a red herring). It's token economics and proactivity. The convenience gradient collapses when the orchestrator can install a local resident that compiles context instead of fetching it.**

This means the *real* moat for a SaaS platform isn't the embedded agent's speed advantage. It's:

1. **Domain logic depth** — the scoring models, business rules, and compliance logic that the plugin still needs to call
2. **Data gravity** — years of operational data that can't be replicated
3. **Module ecosystem** — the breadth of integrated capabilities (CRM + CMS + Commerce + Booking + Accounting in one system)

### FlowWink's Position

FlowWink is already architecturally prepared for this future:

- The **prompt compiler** exists and could be exposed as a plugin API
- **Heartbeat protocol** is stored as editable config in `agent_memory` — a plugin could run the same loop
- **MCP resources** (`resource://health`, `resource://objectives`) provide the observation layer
- **Module manifests** describe every capability in machine-readable format

A future "Orchestrator Plugin SDK" is essentially: *package what FlowPilot already does, but let the orchestrator own the reasoning loop*.

```
FlowPilot today:     Reasoning + Context + Execution = one agent
Plugin future:       Context + Execution = plugin (in SaaS)
                     Reasoning = orchestrator (external)
```

### The Data Locality Law

There is a deeper principle at work here — one that transcends agent architecture and touches computer science fundamentals:

> **The closer computation sits to data, the cheaper each decision becomes.**

This is the same principle that drives CPU caches, CDN edge nodes, and database read replicas. It applies to agents with equal force:

```
L1 cache:     CPU register          →  <1ns     (instant)
L2 cache:     Local agent in SaaS   →  ~5ms     (direct DB query, compiled prompt)
L3 cache:     MCP resource call     →  ~10ms    (serialized, schema-bound)
Main memory:  Full MCP polling      →  ~60ms    (12 calls, 6,000 tokens)
Disk:         Screen-scraping GUI   →  seconds  (fragile, lossy)
```

#### Where Depth Always Wins: Inside the System

A local agent can execute `SELECT ... JOIN ... JOIN ... WHERE ...` across 10 tables in 5ms and extract exactly the 12 data points it needs. No MCP resource will ever match this — serialization always loses dimensions. The local agent sees the **full relational graph**; the external agent sees **pre-selected projections**.

This is why embedded agents will always have a depth advantage for **intra-system reasoning**: lead scoring that combines CRM history + website behavior + email engagement + booking patterns + payment history in a single query.

#### Where Breadth Wins: Above the Systems

But the Data Locality Law has a critical exception:

> **Breadth wins when the insight requires cross-system correlation.**

An orchestrator sitting *above* 15 SaaS systems sees patterns that no individual local agent can detect:

- "Your leads are dropping" (CRM) + "employee turnover spiked" (HR/Workday) → correlation: understaffed sales team
- "Support tickets rising" (Helpdesk) + "deployment frequency doubled" (DevOps) → correlation: quality regression
- "Content engagement down" (CMS) + "competitor launched campaign" (Market Intel) → correlation: market shift

No single SaaS agent — no matter how deeply embedded — can see these cross-boundary patterns. This is the orchestrator's **irreducible advantage**.

#### The Architectural Implication

This creates a natural division of labor that neither side can fully subsume:

```
┌─────────────────────────────────────────────┐
│  ORCHESTRATOR (Cross-System Breadth)        │
│  Sees: correlations across 15 systems       │
│  Strength: strategic planning, reallocation │
│  Weakness: shallow per-system understanding │
├─────────────────────────────────────────────┤
│  LOCAL AGENT (Intra-System Depth)           │
│  Sees: full relational graph of one system  │
│  Strength: domain expertise, proactivity    │
│  Weakness: blind to external context        │
└─────────────────────────────────────────────┘
```

Neither the "driver" (orchestrator) nor the "domain expert" (local agent) is complete alone. The orchestrator needs the local agent's depth to make good decisions *within* each system. The local agent needs the orchestrator's breadth to understand *why* its local metrics are changing.

This isn't a temporary architectural limitation — it's a **fundamental property of distributed information systems**. It will persist regardless of protocol improvements, plugin architectures, or model capabilities.

### The Strategic Question for SaaS Builders

> Will your platform be the one where orchestrators **want** to install their plugin?
> Or will it be the one they route around?

The answer depends on the same factors as any API economy: **richness of capabilities**, **quality of domain logic**, and **ease of integration**. Platforms that expose their full skill surface via MCP today are building the foundation for plugin residency tomorrow.

---

*This chapter documents FlowWink's actual implementation of MCP skill exposure, agent governance analysis, and forward-looking plugin architecture (April 2026), serving as both a guide and a reference architecture for agentic SaaS platforms.*
