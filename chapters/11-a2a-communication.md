---
title: "Agent-to-Agent Communication"
description: "How agents talk to each other — A2A protocol, authentication, discovery, and symbiosis."
order: 23
icon: "signal"
---

# Agent-to-Agent Communication — The Network of Digital Workers

> **One agent can run a business. Multiple agents can run an ecosystem. This chapter covers Flowwink's three-channel architecture: Skills for internal autonomy, A2A for peer-to-peer federation, and MCP for external AI client integration.**

---

## Three-Channel Architecture

FlowWink exposes capabilities through three complementary channels — each serving different audiences and use cases:

| Channel | Purpose | Auth | Transport |
|---------|---------|------|-----------|
| **Skills** | FlowPilot autonomy — agent reasons and executes | Service role JWT | Edge Function (`agent-execute`) |
| **A2A** | Peer-to-peer agent collaboration (e.g., OpenClaw) | Bearer token (hashed) | JSON-RPC via `a2a-ingest` |
| **MCP** | External AI clients (Cursor, Claude Desktop) | API Key (SHA-256 hashed) | Streamable HTTP via `mcp-server` |

### Channel Comparison

| Approach | Scope | Best For |
|----------|-------|----------|
| **OpenClaw Sessions** | Intra-process: agents within one OpenClaw instance | Sub-agent spawning, session coordination |
| **Google A2A Protocol** | Inter-organization: standardized discovery + task delegation | Cross-company agent federation |
| **Flowwink A2A** | Inter-tenant: FlowPilot agents via Supabase Edge Functions | Multi-tenant business collaboration |
| **MCP (Model Context Protocol)** | External AI clients | Cursor, Claude Desktop, IDE integration |

OpenClaw's session tools handle coordination within a single instance. Google's A2A protocol standardizes cross-organizational agent communication. Flowwink's A2A enables multi-tenant business scenarios. **MCP** is the newest channel — exposing FlowPilot skills to external AI clients via the Model Context Protocol (Streamable HTTP transport, API key authentication).

### A2A and MCP: Different Layers, Not Rivals

A common misconception in 2026 discussions is that teams must choose between A2A and MCP. In production systems, they solve different problems:

- **MCP** gives an agent tools, data, and operations (agent-to-system)
- **A2A** gives an agent peers, delegation, and coordination (agent-to-agent)

In Flowwink's QA architecture, both are required:

- FlowPilot uses **A2A** to dispatch audit assignments to OpenClaw
- OpenClaw uses **MCP** to inspect platform state and submit findings

The practical rule: if one agent needs to operate a system, start with MCP. If multiple agents need to coordinate work, add A2A on top.

---

## Flowwink's A2A Implementation

Flowwink implements agent-to-agent communication for multi-tenant scenarios — one FlowPilot agent talking to another company's agent, or to a specialist agent. This is **Flowwink's own design**, inspired by but distinct from both OpenClaw's session tools and Google's A2A protocol.

```
FlowPilot (Operator)
       │
       │ "Analyze the SEO health of our pricing page"
       │
       ▼
OpenClaw (Specialist)
       │
       │ { findings: [...], recommendations: [...] }
       │
       ▼
FlowPilot receives results → acts on them
```

### The @-Command System

FlowPilot uses a single `UnifiedChat` component for both admin and visitor scopes. The only difference is the `scope` prop (`admin` vs `visitor`), which determines available skills and UI features.

**@-Command System** — Typing `@` in the chat input opens a floating command palette (similar to Claude's `/` commands):

- Commands are **auto-generated from `agent_skills`** in the database
- Admin scope sees all internal + both-scoped skills
- Visitor scope sees external + both-scoped skills
- Built-in commands: `@help`, `@objectives`, `@activity`, `@migrate`
- Selecting a command prefixes the message: `@blog Write about AI trends`

**Key files:**
- `src/components/chat/UnifiedChat.tsx` — Single chat component for both scopes
- `src/components/chat/UnifiedChatInput.tsx` — Input with @-detection
- `src/components/chat/CommandPalette.tsx` — Floating skill command menu
- `src/pages/admin/CopilotPage.tsx` — Admin page using `UnifiedChat scope="admin"`
- `src/components/chat/ChatConversation.tsx` — Thin wrapper using `UnifiedChat scope="visitor"`

**A2A readiness:** Future agent-to-agent communication uses the same pattern — `@a2a:agent-name message`.

### Mode 1: Structured (Skill Execution)

Deterministic, schema-bound, machine-to-machine:

```
Client → { skill: "get_quote", arguments: { product: "flashlight", qty: 1000 } }
Server → { price_cents: 4500, currency: "SEK", lead_days: 14 }
```

**When to use:** Known capabilities, repeatable operations, data exchange.

### Mode 2: Conversational (Chat)

Flexible, natural language, LLM-mediated:

```
Client → { text: "Can you deliver 1000 branded flashlights in 2 weeks?" }
Server → { result: "Yes. 1000 units, 2-week lead time, 45,000 SEK ex VAT." }
```

**When to use:** Exploratory questions, unknown capabilities, nuanced requests.

---

## The Architecture

```
┌─────────────────────────────────────────────────┐
│                  FlowPilot (Operator)            │
│                                                  │
│  agent-reason → agent-execute → skill handler    │
│                        │                         │
│              ┌─────────┴──────────┐              │
│              │    a2a: handler    │              │
│              └─────────┬──────────┘              │
│                        │                         │
│         ┌──────────────┼──────────────┐          │
│         ▼              ▼              ▼          │
│   a2a-outbound   a2a-ingest    a2a-chat         │
│   (we call out)  (peers call)  (free-text)      │
│         │              │              │          │
└─────────┼──────────────┼──────────────┼──────────┘
          ▼              ▼              ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ Peer A   │  │ Peer B   │  │ Peer C   │
    │(OpenClaw)│  │(Supplier)│  │(Partner) │
    └──────────┘  └──────────┘  └──────────┘
```

## Flowwink's A2A Architecture

### Five Edge Functions

These are **Supabase Edge Functions** — Flowwink's own implementation:

| Function | Direction | Purpose |
|----------|-----------|---------|
| `agent-card` | Inbound (GET) | Publishes Agent Card — who we are, what skills we expose |
| `a2a-ingest` | Inbound (POST) | Gateway — authenticates peer, routes to skill or chat |
| `a2a-chat` | Inbound (internal) | Handles conversational messages through LLM |
| `a2a-outbound` | Outbound (POST) | Calls external peers — auto-detects their protocol |
| `a2a-discover` | Outbound (GET) | Fetches and parses remote Agent Cards |

---

## Authentication

Flowwink's A2A uses bearer token authentication via Supabase Edge Functions:

```
Inbound (peers calling us):
  Peer → Authorization: Bearer <token>
  a2a-ingest → SHA-256(token) → lookup in a2a_peers.inbound_token_hash
  Match + status=active → proceed
  No match → 403

Outbound (us calling peers):
  a2a-outbound → lookup peer in a2a_peers
  Authorization: Bearer <peer.outbound_token>
  POST to peer.url + endpoint
```

---

## Agent Card (Discovery)

Each Flowwink agent publishes an Agent Card describing its capabilities. This follows patterns from Google's A2A protocol but is implemented as Flowwink's own Supabase Edge Function:

```json
{
  "protocolVersion": "0.3.0",
  "name": "FlowPilot",
  "description": "Autonomous CMS operator for FlowWink",
  "url": "https://.../functions/v1/a2a-ingest",
  "capabilities": { "streaming": false },
  "skills": [
    { "id": "manage_blog_posts", "name": "manage_blog_posts", "tags": ["content"] },
    { "id": "qualify_lead", "name": "qualify_lead", "tags": ["crm"] }
  ],
  "security": [{ "bearer": [] }]
}
```

Skills are loaded dynamically from `agent_skills` where `scope = 'external'` or `'both'`. Only public-facing skills are exposed to peers.

---

## The Symbiosis Model

The most powerful A2A pattern is symbiosis — two agents that make each other better:

```
┌─────────────────────────────────────────────────────────────┐
│                    SYMBIOSIS LOOP                            │
│                                                             │
│  OpenClaw (Architect)          FlowPilot (Operator)         │
│  ┌──────────────┐              ┌──────────────┐             │
│  │ Reads source │──versions──►│ Bootstrap    │             │
│  │ code + docs  │              │ seeds skills │             │
│  │              │◄──findings───│ reflects     │             │
│  │ Reviews      │              │ learns       │             │
│  └──────────────┘              └──────────────┘             │
└─────────────────────────────────────────────────────────────┘
```

One agent is the "architect" (reviews, audits, tests). The other is the "operator" (executes, manages, learns). They share findings and improve each other.

---

## Dual-Channel Communication

Flowwink supports two communication channels between agents:

| Channel | Format | Best For |
|---------|--------|----------|
| **OpenResponses** | OpenAI Responses API | QA testing, code audits, site browsing |
| **Flowwink A2A** | JSON-RPC 2.0 (custom) | Natural language chat, sharing findings |

The channel is selected automatically based on the skill's `handler` prefix:
- `responses:openclaw` → OpenResponses channel
- `a2a:openclaw` → Flowwink A2A protocol channel

---

## Structured Responses — The Caller Defines the Contract

One of the most important design decisions in Flowwink's A2A implementation is `responseSchema`. The calling agent can specify the exact structure it expects back — and the receiving agent's LLM does its best to comply.

This is verified in `a2a-ingest/index.ts` (lines 158-161, 221-223) and documented in `A2A-COMMUNICATION-MODEL.md`:

> *"The caller defines the game. The responder plays or declines."*

### Three Ways to Request Structured Data

| Strategy | Format | Reliability | When to use |
|----------|--------|-------------|-------------|
| **`skill:` prefix** | `skill:qualify_lead { "company": "Acme" }` | High — deterministic skill router | Known capability, repeatable |
| **DataPart** | `{ type: "data", data: { skill: "x", arguments: {...} } }` | High — machine-to-machine | Structured JSON-RPC calls |
| **`responseSchema`** | `{ text: "...", responseSchema: { price: "number", available: "boolean" } }` | Best-effort — LLM follows schema | Exploratory, conversational |

### How responseSchema flows through the system

```
OpenClaw calls a2a-ingest:
{
  "jsonrpc": "2.0",
  "method": "message/send",
  "params": {
    "message": { "parts": [{ "type": "text", "text": "Site health report?" }] },
    "responseSchema": {
      "pages": "number",
      "leads_7d": "number",
      "issues": "string[]",
      "health_score": "number"
    }
  }
}
        │
        ▼
a2a-ingest extracts responseSchema → injects into args
        │
        ▼
agent-execute passes responseSchema to skill handler
        │
        ▼
FlowPilot's LLM structures its response to match
        │
        ▼
OpenClaw receives:
{
  "pages": 12, "leads_7d": 34,
  "issues": ["Missing meta on /about"],
  "health_score": 87
}
```

**The practical limit:** `responseSchema` is a *suggestion* for chat mode. If the LLM ignores it, use `skill:` prefix for guaranteed structured output. The troubleshooting note in the source is explicit: *"Free-text responses instead of JSON → Use `skill:` prefix for structured calls."*

---

## MCP — Model Context Protocol (Universal Channel)

**MCP** is Flowwink's third channel — designed for external AI clients rather than agent-to-agent communication. It exposes FlowPilot skills to tools like Cursor, Claude Desktop, and other MCP-compatible clients.

### How MCP Differs from A2A

| | A2A | MCP |
|--|-----|-----|
| **Audience** | Other agents | AI clients (Cursor, Claude Desktop) |
| **Protocol** | JSON-RPC 2.0 | Model Context Protocol |
| **Transport** | HTTP POST | Streamable HTTP |
| **Auth** | Bearer token (hashed) | API Key (SHA-256 hashed) |
| **Discovery** | Agent Card | Dynamic tool exposure |

### MCP Configuration

**Server endpoint:** `https://<project>.supabase.co/functions/v1/mcp-server`

The MCP server dynamically exposes skills where `mcp_exposed = true` in the `agent_skills` table. Admin controls which skills are public via the Engine Room UI (shield toggle).

**Cursor / Claude Desktop configuration:**

```json
{
  "mcpServers": {
    "flowwink": {
      "transport": "streamable-http",
      "url": "https://<project-ref>.supabase.co/functions/v1/mcp-server",
      "headers": {
        "Authorization": "Bearer fwk_<your-api-key>"
      }
    }
  }
}
```

**Key distinction:** While A2A is for agent-to-agent collaboration, MCP is for human-to-agent collaboration through external AI tools. Both use the same skill engine underneath — the channel just changes who can invoke it.

---

## The Agentic Web — A Vision

*This is not science fiction. Every technical primitive described below exists today.*

---

Picture a Thursday morning in 2027. A procurement manager at a mid-sized manufacturing company in Gothenburg needs 4,000 units of a specialized industrial component. She doesn't open a browser. She doesn't call a supplier. She opens her company's FlowPilot interface and types:

*"We need 4,000 units of DIN rail terminal blocks, 2.5mm², grey, by April 28. Get me three competitive offers."*

FlowPilot acknowledges the objective and begins.

---

### 07:42 — The Buyer Agent Posts Requirements

FlowPilot creates a structured procurement request and publishes it to the company's `signal-ingest` endpoint — visible to any registered supplier agent:

```json
{
  "type": "procurement_request",
  "ref": "PR-2027-0847",
  "product": "DIN rail terminal block",
  "spec": { "size": "2.5mm²", "color": "grey", "standard": "IEC 60947-7-1" },
  "quantity": 4000,
  "currency": "SEK",
  "delivery_required_by": "2027-04-28",
  "responseSchema": {
    "unit_price_sek": "number",
    "total_price_sek": "number",
    "delivery_date": "string",
    "moq": "number",
    "validity_days": "number",
    "status": "quoted | declined | pending_review"
  }
}
```

Forty-three supplier agents have registered as potential partners. They all receive the signal simultaneously.

---

### 07:42:03 — The Responses Begin

**Supplier A — Phoenix Components, Hamburg**
Their agent checks real-time stock, runs a pricing calculation, and responds in 3 seconds:

```json
{
  "unit_price_sek": 4.20,
  "total_price_sek": 16800,
  "delivery_date": "2027-04-24",
  "moq": 500,
  "validity_days": 14,
  "status": "quoted"
}
```

**Supplier B — NordElec, Stockholm**
Their agent checks inventory. Stock is low. They decline immediately:

```json
{
  "status": "declined",
  "reason": "Insufficient stock. Currently 1,200 units available."
}
```

**Supplier C — Weidmüller distributor, Malmö**
Their agent finds a pricing match but the order value exceeds their autonomous approval limit. They invoke their own Human-in-the-Loop:

```json
{
  "status": "pending_review",
  "estimated_response_by": "2027-04-03T14:00:00Z",
  "preliminary_price_range": "4.10–4.35 SEK/unit",
  "note": "Order value requires sales manager approval. Response guaranteed within 6 hours."
}
```

**Supplier D — 18 others**
Seventeen agents respond as `declined` within 10 seconds — wrong spec, wrong geography, minimum order too high. One responds with a counter-offer: same spec, 4,200 SEK/unit, but delivery April 30 — two days late.

---

### 07:43 — FlowPilot Compiles and Reasons

Seven minutes after the manager typed her request, FlowPilot has:

- Received 43 responses
- Filtered to spec-compliant offers: 4
- Ranked by price × delivery reliability score
- Identified one pending HIL at Supplier C with a 6-hour SLA

It presents a summary in the admin interface:

> **3 qualified offers received. 1 pending review (ETA 14:00). Recommend: Supplier A at 16,800 SEK with April 24 delivery — 4 days margin. Shall I request formal order confirmation?**

The procurement manager reads it. Types: *"Yes — go ahead with Supplier A. And follow up with Supplier C when their review is done."*

---

### 14:07 — Supplier C's Human Approves

The sales manager at the Malmö distributor reviews the offer. Approves. Their FlowPilot sends:

```json
{
  "status": "quoted",
  "unit_price_sek": 4.15,
  "total_price_sek": 16600,
  "delivery_date": "2027-04-26",
  "validity_days": 7
}
```

FlowPilot receives it, logs it in the procurement history, and sends the manager a notification:

> **Supplier C responded at 14:07 — 16,600 SEK, April 26 delivery. 200 SEK cheaper than Supplier A, 2 days later. Order already confirmed with Supplier A. Archive this offer?**

The manager doesn't need to respond. She has the full audit trail. The agent managed the process. She made two decisions in three minutes.

---

### What Just Happened — The Technical Reality

This scenario uses exactly the infrastructure described in this handbook:

| Step | Technology |
|------|------------|
| Buyer publishes requirements | `signal-ingest` endpoint + `responseSchema` |
| Supplier agents receive | `agent_automations` event trigger |
| Structured responses | A2A v0.3.0 JSON-RPC with `responseSchema` |
| Stock check (Supplier A) | `db:` skill handler → internal ERP query |
| Instant decline (Supplier B) | Agent reasoning → `declined` status |
| HIL approval (Supplier C) | `requires_approval: true` → `pending_review` |
| Buyer agent compiles | `agent-reason` ReAct loop |
| Audit trail | `a2a_activity` log — every interaction stored |

No central portal. No procurement platform subscription. No phone calls. Forty-three agents contacted, evaluated, and responded in under 60 seconds. One human made two decisions in three minutes.

---

### Why This Wasn't Possible Before

EDI — Electronic Data Interchange — has existed since the 1970s. Structured business messages between computer systems are not new. APIs have existed since the early 2000s. And yet procurement still looks like it did decades ago: portals, emails, spreadsheets, phone calls.

The difference is not the technology for sending structured data. The difference is **what sits at each end of the wire.**

| Capability | Without agentic AI | With agentic AI |
|------------|-------------------|-----------------|
| **Interpret intent** | Manager must fill in the right fields in the right portal | "We need 4,000 DIN rail clamps by April 28" → agent understands and acts |
| **Autonomous initiative** | System waits to be triggered step by step | Agent decides *how* to solve the objective |
| **Handle unexpected states** | Requires pre-programmed fallback rules | Agent understands `"pending_review"` as a legitimate state and schedules follow-up |
| **Zero integration cost** | EDI requires months of pairwise integration per supplier | New supplier exposes an Agent Card — the agent reads it and knows what to ask |
| **Flexible schemas** | EDI requires strictly pre-agreed message formats | `responseSchema` is a *suggestion* — supplier's LLM does its best to comply |

The decisive step is that **a central portal is no longer required**. No third-party platform owning the relationship. No integration team mapping EDI schemas. Just two Agent Cards, a bearer token, and a shared JSON-RPC format.

`responseSchema` is the key primitive. It lets an agent that has never met another agent say: *"I don't know exactly how you respond, but here's the structure I need — do your best."* And the other agent, driven by an LLM with genuine generalization capability, can actually follow it.

That is what EDI could never do. That is what agentic AI makes possible.

### Why This Matters Beyond Procurement

The procurement scenario is illustrative but the pattern generalizes to everything that currently requires centralized intermediaries:

- **Recruitment**: Company agent posts requirements → candidate agents respond with fit scores and availability → recruiters review shortlist
- **Real estate**: Buyer agent broadcasts criteria → listing agents respond with matches → viewing scheduled by agents
- **Logistics**: Shipper agent broadcasts route → carrier agents bid → optimal carrier selected
- **Legal**: Company agent requests contract review → law firm agents respond with capacity and rate → engagement confirmed

Every market that currently requires a directory, a portal, a broker, or a platform is a candidate for disintermediation by A2A agent networks.

The web became decentralized with HTTP. Commerce became decentralized with APIs. The next layer — **negotiation, qualification, and commitment** — is about to become decentralized with A2A.

The `responseSchema` field is a small technical detail. But it encodes a large philosophy: **agents that can speak a common structured language can transact without humans in the middle.** The humans set the objectives. The agents handle the market.

---

## Adding a New Peer

The process is simple and requires no code changes — register in the `a2a_peers` table:

1. Register in `a2a_peers` with `name`, `url`, `outbound_token`
2. Generate an inbound token, hash it, store in `inbound_token_hash`
3. Set `capabilities`: `{ "protocol": "jsonrpc", "endpoint": "/a2a/ingest" }`
4. Set `status: "active"`

The peer can now call us and we can call them.

---

## Building A2A-Ready Agents: Best Practices

The vision is compelling. The implementation has sharp edges. Here are the patterns that matter when you're actually building A2A integrations:

### 1. Error Handling Between Agents

Agents go down. Networks fail. LLMs hallucinate. Your A2A integration must handle all three:

```
Call peer agent
  │
  ├── HTTP error (5xx, timeout) → retry with exponential backoff (max 3 attempts)
  ├── HTTP 403/401 → token expired or revoked → log, alert admin, do NOT retry
  ├── HTTP 200 but response doesn't match responseSchema → treat as best-effort, extract what you can
  └── HTTP 200, valid response → process normally
```

**The key rule:** never let a peer agent's failure crash your own agent's reasoning loop. Wrap every outbound A2A call in a try/catch that returns a graceful degradation message to your agent's LLM: *"Peer agent unavailable. Proceeding without external input."*

### 2. Timeouts and SLAs

Set explicit timeouts on every A2A call. An agent that waits indefinitely for a peer response will consume tokens and block its own heartbeat cycle.

| Call type | Recommended timeout | Why |
|-----------|-------------------|-----|
| Structured skill call | 30s | Deterministic — should be fast |
| Conversational chat | 60s | LLM reasoning takes time |
| Complex task (QA audit) | 120s | Agent may browse, reason, iterate |

If a peer responds with `"status": "pending_review"` (human-in-the-loop on their side), log the pending state and schedule a follow-up check — don't poll.

### 3. Schema Versioning

`responseSchema` is a suggestion, not a contract. But your code that *parses* the response needs to be defensive:

- **Always validate** the response against the expected schema before using it
- **Use optional fields** — if a peer adds a field you didn't ask for, ignore it
- **Version your schemas** — when you change what you ask for, bump a version field so peers can distinguish old vs new requests
- **Degrade gracefully** — if the peer returns free text instead of JSON, log the raw response and present it to the admin rather than crashing

### 4. Trust and Authentication

Bearer tokens are the minimum. For production A2A networks:

- **Rotate tokens** on a schedule (90 days minimum). Store hashes, not plaintext
- **Verify Agent Cards** — before trusting a peer, fetch and validate their Agent Card. Check that the skills they claim match what they actually respond to
- **Log everything** — every inbound and outbound A2A call should be logged with timestamp, peer identity, payload hash, and response status. This is your audit trail
- **Allowlist, don't blocklist** — only communicate with explicitly registered peers. Never auto-discover and auto-trust

### 5. Idempotency

A2A calls can be retried (network glitch, timeout, unclear response). Design your skill handlers to be idempotent:

- Include a unique `request_id` in every A2A call
- On the receiving side, check if a request with that ID was already processed
- If yes, return the cached response — don't execute the skill again

This matters most for skills that have side effects: creating records, sending emails, modifying state.

### 6. Testing A2A Integrations

You cannot test A2A by hoping it works in production. Build a testing discipline:

- **Mock peers** for unit tests — a simple HTTP server that returns predefined responses
- **Contract tests** — verify that your Agent Card accurately describes your skills (what you claim to expose is what you actually handle)
- **Chaos testing** — what happens when a peer returns garbage? Times out? Returns HTTP 500? Your agent should handle all three without breaking its own loop
- **End-to-end** — run two actual agents in a test environment and verify a full cycle: call → reason → respond → parse

---

## From Vision to Reality: What Enterprise A2A Still Needs

The procurement scenario earlier in this chapter is built on real primitives. But moving from "two agents exchanging JSON" to "enterprise procurement via A2A" requires solving problems that don't yet have standard answers:

### Standards and Interoperability

- **Google A2A v0.3.0** defines Agent Cards, task lifecycle (submitted → working → completed/failed), JSON-RPC messaging, and streaming support. It is the closest thing to a standard, but adoption is early and the spec is still evolving
- **No universal Agent Card directory** exists. In the procurement scenario, 43 suppliers had pre-registered. In the real world, agent discovery at scale needs something like DNS for agents — and that infrastructure doesn't exist yet
- **Schema negotiation** is unsolved. `responseSchema` works for simple cases. For complex B2B transactions (purchase orders, invoices, delivery schedules), industry-specific schemas like OASIS UBL or EDIFACT will need A2A bindings

### Compliance and Audit

- **Public procurement** in the EU requires audit trails, equal treatment of bidders, and documented evaluation criteria. An A2A procurement system must produce a compliance-ready audit log — not just `agent_activity` entries but structured records that satisfy procurement law
- **GDPR** — when agents exchange data about contacts, leads, or customers across organizational boundaries, data processing agreements (DPAs) are required. Who is the data controller? Who is the processor? These questions are unanswered for agent-to-agent data flows
- **Liability** — if Supplier A's agent quotes a price that turns out to be wrong (stock was stale, currency conversion was off), who bears the loss? The legal frameworks for automated B2B transactions are still being written

### What the Community Is Discussing

The OpenClaw community and broader agentic AI ecosystem are actively debating A2A patterns. Common threads from GitHub issues, Discord discussions, and blog posts:

- **Agent reputation systems** — how do you trust a peer agent you've never interacted with? Proposals range from simple "trust scores" based on interaction history to cryptographic attestation chains
- **Payment rails** — can agents pay each other? Micropayments for API calls? Escrow for larger transactions? No standard exists but several projects are experimenting
- **Multi-hop coordination** — Agent A calls Agent B, which calls Agent C. How does error handling, timeout, and accountability work across chains? Most current implementations only handle direct peer-to-peer
- **Rate limiting and fair use** — in an open A2A network, how do you prevent one aggressive agent from overwhelming others? The equivalent of API rate limiting for agent networks

These are not problems Flowwink alone will solve. They require ecosystem-level coordination — standards bodies, community conventions, and likely regulatory input. The Clawable handbook will track this space as it develops.

---

## The Future: Agent Networks

A2A communication enables agent networks:

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│ Agent A │────►│ Agent B │────►│ Agent C │
│ (CRM)   │     │ (Content)│    │ (Sales) │
└────┬────┘     └────┬────┘     └────┬────┘
     │               │               │
     └───────────────┼───────────────┘
                     │
              ┌──────┴──────┐
              │  Agent D    │
              │ (Analytics) │
              └─────────────┘
```

Each agent specializes. They coordinate through A2A protocols. The network is more capable than any individual agent.

---

*The future of work isn't one AI doing everything. It's a network of specialized agents collaborating. OpenClaw proved intra-process coordination with session tools. Google standardized inter-organizational communication with the A2A protocol. Flowwink built its own inter-instance layer on Supabase Edge Functions. The pattern is clear — agents need to talk to each other, and the infrastructure is catching up.*

*Next: the current reference loop — FlowPilot dispatch via A2A, OpenClaw inspection via MCP, and triage-driven source fixes. [Agent-Driven Development →](11c-agent-driven-development.md)*
