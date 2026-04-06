---
title: "ClawStack — From Theory to Swarm"
description: "How to spin up a swarm of autonomous agents on your own infrastructure in an afternoon, and connect Paperclip as the CEO that delegates to all of them."
order: 17
icon: "server"
---

# ClawStack — From Theory to Swarm

> *"The internet was the first acceleration. Generative AI was the second. Agentic autonomy is the third."*
> — ClawStack README

---

The handbook up to this point has described architecture. OpenClaw's 13-section system prompt. Flowwink's 4-tier memory. Heartbeat loops. A2A protocols. Governance frameworks.

Every reader at this point asks the same question: **"How do I actually start?"**

The jump from "I understand OpenClaw" to "I operate a production agentic organization" is large. Flowwink represents years of accumulated design decisions. You need something in between.

[ClawStack](https://github.com/magnusfroste/clawstack) is that bridge.

---

## The Problem ClawStack Solves

OpenClaw ships as a powerful blank-slate runtime. The project now has substantially better onboarding and configuration documentation, but many operators still hit a practical activation gap after first install: they see `SOUL.md`, `IDENTITY.md`, `TOOLS.md`, `BOOTSTRAP.md` and understand the pieces individually, yet struggle to turn them into a role-ready agent quickly. The persona setup remains conversational by design, which is flexible but can feel open-ended for first-time builders.

The swarm problem is worse. Running multiple agents that collaborate requires manually configuring A2A bearer tokens, peer lists, and Agent Cards for each instance pair. Before ClawStack, there was effectively no turnkey, operator-friendly tooling for this.

We did not start by designing an infrastructure product.

We started with exactly one OpenClaw QA agent helping FlowPilot via `/v1/responses` and A2A. It worked so well that we added more specialist Claws — SEO, Dev, Research. Very quickly, the problem stopped being "does the pattern work?" and became "how do we spin up and operate many OpenClaws without turning into a full-time infra team?".

ClawStack is the answer to that second problem. It exists because the FlowPilot ⇄ QA Claw loop proved the pattern in production, and scaling that pattern by hand was not sustainable.

ClawStack removes both barriers.

| Barrier | Before | With ClawStack |
|---|---|---|
| Infrastructure | Manual Docker, nginx, certbot, DNS | One form, automatic HTTPS, done |
| Configuration | Flexible workspace model that can feel abstract for newcomers | Role presets: pick a job, agent starts ready |
| Swarm | Manual token exchange per pair | Swarm templates: agents pre-wired and peering |

---

## The Architecture

```
Customer visits https://ai.customer.com
        ↓
Caddy (on-demand TLS — cert issued on first request)
        ↓
ClawStack portal (routes by hostname → container)
        ↓
OpenClaw container (isolated Docker network)
        ├── port 18789 → UI + OpenResponses API
        └── port 18800 → A2A gateway (if enabled)
```

**Caddy** handles the infrastructure problem entirely. Point a DNS CNAME at your ClawStack server, create an instance in the portal, and the TLS certificate issues automatically on first request. No wildcard certs. No nginx reloads. No certbot cron jobs.

Each OpenClaw instance runs as an isolated Docker container with its own domain and its own identity. One server. Unlimited agents. The portal is a single Node.js file — no build pipeline, no framework, no complexity.

---

## Role Presets — Agents That Start Ready

The biggest problem with a blank-slate agent is that you don't know what to write. ClawStack solves this with **role presets**: opinionated configurations that write the right `SOUL.md`, `TOOLS.md`, and `AGENTS.md` content at bootstrap time.

**Available roles:**

| Role | What it does | A2A skills |
|---|---|---|
| **Generalist** | Blank slate — full control | None pre-configured |
| **QA Agent** | Browses and tests web properties, grades findings by severity | Page audit, accessibility check, broken link scan |
| **SEO Agent** | Crawls content for search performance | Keyword analysis, meta audit, content gap analysis |
| **Dev Agent** | Code review, documentation, PR summaries | Review PR, generate docs, summarize diff |
| **Support Agent** | Customer-facing FAQ, escalation routing | Answer question, escalate, summarize conversation |
| **Research Agent** | Web search, source aggregation, summarization | Search web, extract facts, compare positions |

Pick a role at creation time. ClawStack writes the configuration. The container starts with an agent that already knows its job — no prompt archaeology required.

This is the same principle as OpenClaw's own SKILL.md system, applied to the bootstrapping problem: opinionated defaults that work immediately, full control for those who want to go deeper.

---

## Paperclip — The CEO Layer

So far we've been talking about infrastructure: how to spin up agents, how to configure their roles, how they expose communication channels. That's the floor of the building.

Now we need to talk about the organization that runs inside it. Provisioning ten agents with no coordination structure is not a company — it's noise. Someone needs to decide what gets done, delegate it to the right agent, and track that it was completed. That's Paperclip.

ClawStack provisions the swarm. But who delegates work to the swarm?

**Paperclip** is the orchestration layer that sits on top of ClawStack. It represents the organization — the CEO level — and delegates tasks downward to individual Claw instances the way a manager delegates to employees.

The mental model is explicit:

```
Paperclip (CEO / orchestrator)
    ├── Claw: QA Agent      (role: test and audit)
    ├── Claw: SEO Agent     (role: content and search)
    ├── Claw: Dev Agent     (role: code review)
    └── Claw: Research Agent (role: briefings)
```

Adding a Claw to Paperclip follows an onboarding process that mirrors (intentionally) how a human employee joins an organization:

1. Create an instance in ClawStack portal — pick a role
2. In Paperclip, generate an OpenClaw Invite Prompt
3. Paste the prompt into the Claw's chat — the agent runs its own onboarding
4. Approve the join request in Paperclip
5. The Claw appears as an agent and can receive delegated tasks

Once onboarded, Paperclip delegates work via **OpenResponses** — the top-down task channel:

```
POST https://claw-qa.yourdomain.com/v1/responses
{
  "input": "Audit the booking flow on demo.flowwink.com.
            Return { findings: [{ severity, location, description }] }",
  "model": "openclaw"
}
```

The Claw runs the task with its full agent context — workspace files, identity, tools, permissions — and returns structured findings.

---

## Two Communication Channels

Every A2A-enabled Claw exposes two channels. They serve different coordination patterns.

### Channel 1 — OpenResponses (top-down delegation)

`POST /v1/responses` on port 18789. The caller is the orchestrator; the Claw is the worker. The message goes directly to the agent's LLM with full context. The caller defines the expected output format in the prompt.

**Use this when:** Paperclip or Flowwink delegates a task with a clear expected output — a QA audit, a code review, a research brief.

### Channel 2 — A2A (peer-to-peer collaboration)

JSON-RPC on port 18800 via the A2A gateway plugin. Either side can initiate. Messages are serialized through the A2A protocol.

**Use this when:** Two Claws coordinate as peers — neither is the boss — or when the communication is exploratory or conversational.

| Scenario | Channel |
|---|---|
| Paperclip delegates a QA audit | OpenResponses |
| Claw asks peer for structured price quote | OpenResponses (caller-defined contract) |
| QA Claw notifies Dev Claw that work is complete | A2A |
| Research Claw and SEO Claw compare findings | A2A |

This dual-channel model maps exactly to how human organizations work: a manager assigns work through formal delegation (OpenResponses), while colleagues coordinate informally as peers (A2A).

---

## Swarm Templates

The goal — currently in progress — is **swarm templates**: pre-composed sets of agents wired together for a common use case. Create the swarm from a template; ClawStack provisions all the instances, generates A2A tokens, and configures peering automatically.

**Web quality swarm:**
- QA Agent + SEO Agent + Research Agent
- QA can delegate research tasks to Research Agent via A2A
- SEO Agent queries Research Agent for competitor context

**Product team swarm:**
- Dev Agent + QA Agent + Research Agent
- Dev Agent initiates QA runs via A2A after code changes
- Research Agent handles RFC summaries and dependency audits

**Customer operations swarm:**
- Support Agent + Research Agent
- Support Agent delegates knowledge lookups to Research Agent
- Support handles the customer; Research handles the facts

---

## The Governance Implication

ClawStack makes the governance model from chapter 14 concrete.

McKinsey's four-layer accountability model — Principal, Delegator, Operator, Agent — maps directly onto the ClawStack/Paperclip stack:

| McKinsey layer | ClawStack reality |
|---|---|
| Principal | Business owner, sets objectives |
| Delegator | Paperclip — delegates to agents, approves join requests |
| Operator | ClawStack — provisions infrastructure, manages lifecycle |
| Agent | Individual Claw instances — execute tasks |

The Agent Manager role HBR described in February 2026 is not abstract here. It's the person who manages the Paperclip organization: deciding which roles to spin up, reviewing completed tasks, adjusting SOUL.md files when agents drift, and approving join requests from new Claws. Concrete, learnable, necessary.

---

## Getting Started

```bash
git clone https://github.com/magnusfroste/clawstack.git
cd clawstack
cp .env.example .env
# Edit .env: BASE_DOMAIN, CADDY_EMAIL, ADMIN_USER, ADMIN_PASS
mkdir -p /opt/clawstack/instances
docker compose up -d
```

Open `https://clawstack.yourdomain.com`. Create an instance. Point a DNS CNAME. Done.

Prerequisites: Docker on a VPS, ports 80 and 443 open, DNS pointing to your server.

The entire stack — Caddy, portal, OpenClaw containers, A2A gateway — runs on a single VPS. The portal is a single Node.js file with no build step. There is nothing to operate beyond `docker compose up`.

---

## Why This Matters Beyond Getting Started

ClawStack is more than a convenience layer. It demonstrates something the handbook has argued throughout: **the value is not in the agent, it's in the infrastructure around the agent.**

A single OpenClaw instance is a powerful but horizontal tool. It does nothing specific. ClawStack adds:
- Role specificity (what the agent knows and cares about)
- Organizational structure (how agents relate to each other)
- Delegation infrastructure (how work flows from top to bottom and peer to peer)
- Lifecycle management (provisioning, monitoring, decommissioning)

This is precisely what Flowwink added to OpenClaw at the B2B SaaS level. ClawStack adds it at the infrastructure level — accessible to anyone with a VPS and an afternoon.

The path from "I understand agentic AI" to "I operate an agentic organization" now has a practical on-ramp.

---

*ClawStack source: [github.com/magnusfroste/clawstack](https://github.com/magnusfroste/clawstack) — MIT license.*

*Paperclip integration: see `paperclip.sh` and `docs/` in the ClawStack repo.*

*Reference A2A peer: [Flowwink/FlowPilot](https://github.com/magnusfroste/flowwink) — the production implementation used during ClawStack's A2A development.*
