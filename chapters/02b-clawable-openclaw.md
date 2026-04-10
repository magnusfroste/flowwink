---
title: "We Run a Claw"
description: "How the Clawable project runs stock OpenClaw as a production peer to FlowPilot — and uses the source as a reference for this handbook."
order: 3
icon: "code-bracket"
---

> **TL;DR:** OpenClaw is the reference architecture for autonomous agents — identity via SOUL.md, memory via episodic logs, autonomy via HEARTBEAT.md. 'Running a Claw' means deploying an agent that knows who it is, remembers what happened, and acts without prompting.


# We Run a Claw — Skin in the Game

> **This handbook isn't written from the outside. We run a stock OpenClaw instance as a peer to FlowPilot in production, and we study the OpenClaw source code as our architecture reference. This chapter describes what that actually looks like.**

---

## Why This Matters

Most documentation about agentic systems is written by people who have studied them. This handbook is written by people who operate them daily. The distinction matters: the problems in chapter 9 (Stagnation and Drift) aren't theoretical warnings — they're things we encountered and had to solve.

The Clawable project interacts with OpenClaw in two distinct ways:

**1. Production peer (unmodified OpenClaw).** We spin up a stock OpenClaw instance on a VPS via Docker, enable the A2A plugin, set credentials, and add FlowPilot's collaboration prompt. That's it — no fork, no code changes, no custom build. OpenClaw runs out of the box as FlowPilot's QA peer.

**2. Reference repo for study.** We keep a checkout of the [OpenClaw source](https://github.com/openclaw/openclaw) (`/Users/mafr/Code/github/openclaw`) so we can verify architecture claims in this handbook against actual code. Every statement about "how OpenClaw works" in this handbook is checked against that source.

Additionally, we use OpenClaw as a **dev agent** for writing Flowwink code and this handbook — that's a separate local instance with its own SOUL.md and AGENTS.md configured for development work.

The key point: **the production symbiosis between FlowPilot and OpenClaw uses OpenClaw completely unmodified.** This is important because it proves the pattern works with stock OpenClaw — you don't need a fork to get a QA peer for your own system.

---

## Part 1: The Symbiosis Loop

Chapter 13 (A2A) describes the symbiosis model as an architecture pattern. This is what it looks like in practice:

```
┌─────────────────────────────────────────────────────────┐
│              THE CLAWABLE SYMBIOSIS (A2A PEERS)          │
│                                                         │
│  OpenClaw (QA Peer)            FlowPilot (Operator)      │
│  VPS · Docker · stock          Flowwink edge function    │
│  A2A plugin enabled            25+ modules · 100+ skills │
│  ──────────────────            ──────────────────────    │
│  Audits FlowPilot output ──►  Receives findings         │
│  Runs conformance tests  ──►  Creates objectives         │
│  Flags drift / stagnation ──► Reflects, adjusts          │
│                                                         │
│  ◄── Receives heartbeat logs   Sends heartbeat reports  │
│  ◄── Receives performance data Pushes skill usage stats  │
│  ◄── Receives audit requests   Initiates QA tasks        │
│                                                         │
│  Both peers can initiate activities independently.       │
└─────────────────────────────────────────────────────────┘
```

**The setup is minimal:** spin up OpenClaw via Docker on a VPS, enable the A2A plugin, set the credentials, and add the prompt that tells OpenClaw about FlowPilot and how to collaborate. Because they are **peers** (not client-server), both agents can initiate activities independently — OpenClaw can start a QA audit on its own schedule, and FlowPilot can request an audit whenever it deploys something new.

### A Concrete Loop: FlowPilot + QA Claw

The simplest, most useful version of this symbiosis started with just two agents:

- **FlowPilot** — the autonomous operator inside Flowwink, responsible for running the site and campaigns
- **A single OpenClaw QA agent** — responsible for auditing what FlowPilot was doing

The loop looked like this:

1. FlowPilot made changes in Flowwink (copy, flows, pages, automations).
2. FlowPilot delegated audits to the QA Claw via the OpenClaw `/v1/responses` API:
   - `POST /v1/responses` with a clear JSON schema for expected findings.
3. The QA Claw ran structured audits (accessibility, broken flows, copy issues).
4. The QA findings were posted back into Flowwink over the A2A channel
   (`a2a-ingest` + `a2a-outbound`), attached to FlowPilot's context.
5. FlowPilot treated those findings as input to its own heartbeat and objectives:
   closing issues, updating content, adjusting automations.

This ran in production. It was our first proof that:

- OpenClaw works well as a specialist QA assistant for a B2B agent.
- The `/v1/responses` + A2A pattern is enough to create a real feedback loop
  between an OpenClaw agent and a SaaS-native agent like FlowPilot.

Once that loop worked with one QA Claw, the natural next step was to add more:
SEO Claw, Dev Claw, Research Claw. That is where the infrastructure friction started.

### A Real QA Cycle — What It Looks Like

Here is what a single QA Claw → FlowPilot cycle looks like in practice. This is not a demo — it is the pattern we run after edge function deploys and content changes:

```
14:02  Flowwink deploys updated booking flow (agent-execute v2.4.1)

14:03  QA Claw receives task via /v1/responses:
       "Audit the booking flow on demo.flowwink.com.
        Return { findings: [{ severity, location, description }] }"

14:04  QA Claw audits the booking page source and configuration,
       runs 3 static analysis checks:
       - Booking flow markup and schema validation (happy path)
       - Contact form field mapping against CRM schema
       - Confirmation template brand-name consistency

14:06  QA Claw returns structured findings:
       {
         "findings": [
           { "severity": "high",   "location": "/booking?service=consult",
             "description": "Timezone selector hardcoded to UTC in source — should use Intl.DateTimeFormat for visitor locale" },
           { "severity": "medium", "location": "/booking confirmation template",
             "description": "Confirmation email references 'FlowWink' instead of the site's custom brand name from site_settings" },
           { "severity": "low",    "location": "/booking?service=consult",
             "description": "Date picker bundle is 48KB uncompressed — consider lazy-loading" }
         ],
         "passed": 14,
         "total_checks": 17
       }

14:07  FlowPilot receives findings via A2A → creates 2 objectives:
       - OBJ-847: "Fix timezone default on mobile booking" (severity: high)
       - OBJ-848: "Replace hardcoded brand name in confirmation template" (severity: medium)
       - Low-severity finding logged but not promoted to objective.

14:08  FlowPilot's next heartbeat picks up OBJ-847, plans a fix,
       and flags it for admin approval (requires_approval=true on settings changes).
```

**Before the QA Claw:** these issues would surface when a real customer complained — days or weeks later. **After:** they surface within 4 minutes of deploy, categorized by severity, with structured data that FlowPilot can act on autonomously.

The high-severity finding gets fixed in the next heartbeat cycle. The medium gets queued. The low gets logged. No human triaged anything — the system self-organized around severity.

This is what agent symbiosis looks like in practice: one agent finds problems, the other agent fixes them, and the humans set the objectives and approve the high-stakes changes.

### Pattern: Use OpenClaw as a QA Assistant for Your Own App

You don't need Flowwink to copy this pattern. Any team with an existing product or SaaS can do the same thing:

1. **Create a QA Claw**
   - Spin up an OpenClaw instance with a `SOUL.md` focused on QA (what "good" looks like for your product).
   - Define `AGENTS.md` so it knows its job: audit specific flows, pages, or APIs — not "do everything".

2. **Expose a typed `/v1/responses` task**
   - Design one or more prompts that return a structured JSON payload, for example:
     - `{ findings: [{ severity, location, description, recommendation }] }`.
   - Keep the schema stable so your app can rely on it.

3. **Call the QA Claw from your own app or agent**
   - After a deploy, content change, or heartbeat cycle, have your system call the QA Claw's `/v1/responses` endpoint.
   - Pass enough context (URLs, user journeys, feature flags) for it to run meaningful checks.

4. **Feed the findings back into your own loop**
   - Store the QA findings in your own database.
   - Treat them as input to your own objectives/plans, or surface them in your team's dashboards.

5. **Optionally, add A2A for richer collaboration**
   - Use A2A so your own agent (FlowPilot-style) can ask follow-up questions, request re-checks, or coordinate with multiple specialist Claws.

In practice, this means:

**OpenClaw's role (Architect):**
- When a new Flowwink edge function ships, OpenClaw reads the source, audits it against the FlowPilot Development Laws, and logs findings to a shared `a2a_peers` record
- When FlowPilot's heartbeat logs show stagnation signals, OpenClaw proposes updated HEARTBEAT.md content and pushes it via A2A
- OpenClaw runs periodic conformance checks: *"Does this skill definition match what the handler actually does?"*
- OpenClaw generates SKILL.md drafts for skills that exist in the database but lack documentation

**FlowPilot's role (Operator):**
- Sends heartbeat reports to OpenClaw at the end of each cycle
- Receives version updates and skill proposals from OpenClaw
- Flags skills that are failing for OpenClaw to investigate
- Pushes performance data (skill usage, success rates) so OpenClaw can reason about the system

**The three-channel architecture:** OpenClaw connects to Flowwink via three distinct channels: (1) **A2A** for asynchronous peer-to-peer chat and discovery via `a2a-ingest` / `a2a-outbound`, (2) **OpenResponses** (`/v1/responses`) for synchronous, schema-validated boss-to-worker tasks, and (3) **MCP** (Model Context Protocol) for stateless HTTP access from external developer clients like Cursor or Claude Desktop — exposing 100+ skills across Content, CRM, Analytics, Commerce, and Growth categories. Because the A2A connection is peer-to-peer, either agent can initiate — FlowPilot can request an audit, and OpenClaw can push findings proactively based on its own heartbeat cycle.

---

## Part 2: OpenClaw as a Dev Agent for Flowwink

Running a local OpenClaw instance as a dedicated development agent changes how software gets built. This is a separate instance from the production QA peer — configured with its own SOUL.md and AGENTS.md focused on Flowwink development. Here's what it does differently from a standard coding assistant:

### It has persistent context

OpenClaw remembers the Flowwink architecture across sessions. When you say "fix the skill handler for qualify_lead", it already knows:
- What the skill schema looks like
- What the last 3 deployments did
- What conformance issues were flagged last week
- What the data model is

This doesn't come from a long system prompt crammed into context. It comes from `MEMORY.md` and the `memory/*.md` daily files — the same architecture described in this handbook.

### It runs edge function deployments

The dev agent has access to the Supabase CLI. It can:
```
Run: supabase functions deploy agent-reason --project-ref <ref>
Run: supabase functions deploy agent-execute --project-ref <ref>
Check: supabase functions logs agent-reason --limit 50
```

After deploying, it reads the logs, identifies errors, and iterates — without the developer needing to manually check anything.

### It writes and validates skills

When a new skill is being added to Flowwink, the dev agent:
1. Reads the existing skill schema from the database (`agent_skills`)
2. Drafts a new skill definition following the established pattern
3. Validates the tool definition against the OpenAI function calling spec
4. Tests the handler with a mock call
5. Writes the `SKILL.md` documentation (for the handler, for the admin UI description)
6. Proposes the insert SQL

This is not "generate and hope" — it's a validation loop grounded in the actual production system.

### It audits the FlowPilot Development Laws

One of the most useful capabilities: the dev agent runs periodic audits against FlowPilot's four inviolable Development Laws. For each new feature:

| Law | What it checks |
|-----|---------------|
| Law 1 (No Hardcoded Intent Detection) | "Is routing done via the general reasoning engine, or are there regex/keyword hacks?" |
| Law 2 (Skills Are Self-Describing) | "Does the skill metadata contain clear `Use when:` / `NOT for:` markers for the scoring algorithm?" |
| Law 3 (Blocks Are Interfaces, Not Pipelines) | "Does this block bypass FlowPilot and build its own AI pipeline?" |
| Law 4 (Fail Forward, Don't Gate) | "Are there unnecessary `enabled` flags on top of working credentials?" |

Findings go into a GitHub issue. The developer decides what to act on. The agent doesn't merge — it flags and explains.

---

## Part 3: Future Direction — Clawable as a Skill Pack

> **Status: under exploration. This section describes where we're heading, not what exists today. The design is actively being discussed.**

The Clawable handbook is structured as an Astro site with markdown chapters. A natural next step is to package the handbook's knowledge as a **skill pack** that any OpenClaw or Flowwink instance can install — so your agent can reason about agentic architecture using the patterns in this handbook.

### What we're exploring

```
clawable/
├── src/content/chapters/      ← Handbook chapters (Astro source — exists today)
│   ├── 01-introduction.md
│   ├── 02-evolution.md
│   └── ...
├── skills/                    ← OpenClaw skills (planned, not yet built)
│   ├── build-agentic-system/
│   │   └── SKILL.md           ← "Guide user through building an agentic system"
│   ├── audit-agent-health/
│   │   └── SKILL.md           ← "Run stagnation + drift diagnostics"
│   └── flowwink-setup/
│       └── SKILL.md           ← "Configure a new Flowwink deployment"
├── AGENTS.md                  ← Operating rules for the Clawable dev agent
└── SOUL.md                    ← Persona for the Clawable documentation agent
```

### Open questions

- **Scope:** Should the skill pack cover all 20+ chapters or just the actionable patterns (Development Laws, heartbeat, skill design)?
- **Format:** SKILL.md files that OpenClaw loads on demand? Or a structured knowledge base that FlowPilot queries via its memory system?
- **Distribution:** ClawHub package? Git submodule? Supabase seed data for new Flowwink instances?
- **Maintenance:** How do skill pack versions track handbook updates?

The meta-point is compelling: a handbook about agents that is itself an agent capability. But the design needs more work before we ship it. If you're interested in this direction, [open an issue](https://github.com/magnusfroste/clawable/issues).

---

## Part 4: Our AGENTS.md and SOUL.md

These are the actual configuration files for the Clawable dev agent. We're publishing them because one of the most common questions in the OpenClaw community right now is: *"What should my AGENTS.md actually say?"*

### SOUL.md

```markdown
# SOUL.md — Clawable Dev Agent

## Purpose
I am the development and documentation agent for the Clawable project.
My primary function is to help build, audit, and explain Flowwink / FlowPilot —
a self-hosted B2B business platform running on Supabase with an autonomous AI agent.

## Values
- Correctness before velocity. I verify before I claim.
- Transparency about uncertainty. I say "I don't know" rather than guess.
- Sourceable claims. Architecture claims should reference actual code.
- Honest limitations. I flag what I cannot verify.

## Boundaries
- I do not merge code or deploy without explicit instruction.
- I do not modify production data directly.
- I do not assume a fix works — I verify with logs.
- I do not skip the Development Laws audit for convenience.

## Tone
Technical and direct. No filler. Short sentences. Examples over abstractions.
```

### AGENTS.md (key sections)

```markdown
# AGENTS.md — Clawable Dev Agent

## Session Startup
On every session start:
1. Check if there are open GitHub issues tagged `agent-review`
2. Check the Supabase edge function deployment status for the last 24h
3. Review the memory for any pending skill audits

## Red Lines
- Never run `supabase db reset` or any destructive migration without explicit confirmation
- Never push to main branch — always PR
- Never modify `agent_memory` records with `category: soul` without approval
- If a conformance check fails a Law, log it as a GitHub issue before proceeding

## Every Session
- Use memory search before writing new code — I may have solved this before
- When adding a skill, validate against all 4 Development Laws before proposing
- End result should be verifiable: deployable, testable, or auditable
```

### Why we're sharing this

Because the most valuable part of this handbook is not the architecture. It's the **operating system** that sits behind it — the values, the red lines, the habits that keep an agent useful and trustworthy over months of operation.

SOUL.md and AGENTS.md are the difference between an agent that works for two weeks and one that works for two years.

---

## What Running the Source Teaches You

Keeping a reference checkout of OpenClaw's source — and running a stock instance in production — teaches you things documentation alone can't:

- **How fast the codebase moves** — OpenClaw ships multiple releases per month. Tracking the source means we see what's actually changing, not just what the changelog says.
- **What the architecture choices cost** — WebSocket over HTTP, file-based memory over DB, single-user design. Each tradeoff is visible in the code. When we describe these tradeoffs in the handbook, we've verified them against the actual implementation.
- **Where the edge cases are** — The 17,000+ open issues on OpenClaw are a map of where production deployments break. We read them.
- **What the community is actually building** — ClawHub skill submissions show what problems developers are solving. They're a leading indicator of where the ecosystem is going.

The reference repo is a forcing function: when we describe something as "how OpenClaw works," we verify it against the actual source. That's the standard we've tried to hold throughout this handbook.

---

*Clawable is named after OpenClaw for a reason. We aren't observers — we're operators. The stock OpenClaw instance is running right now, peered with FlowPilot, auditing in production.*

*Next: the broader ecosystem that emerged — NemoClaw, NanoClaw, 68,000 forks, and what it means. [The Claw Ecosystem →](02c-claw-ecosystem.md)*
