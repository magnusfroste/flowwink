# FlowWink A2A Communication Model

> **Status:** Production Ready | **Protocol:** JSON-RPC 2.0 / A2A v0.3.0 | **Audience:** Developers/Architects

---

## Table of Contents

1. [Philosophy](#philosophy)
2. [Architecture Overview](#architecture-overview)
3. [The Five Edge Functions](#the-five-edge-functions)
4. [Dual-Mode Protocol](#dual-mode-protocol)
5. [OpenClaw Integration](#openclaw-integration)
6. [Configuration Guide](#configuration-guide)
7. [Peer Setup](#peer-setup)
8. [Dual-Channel Architecture](#dual-channel-architecture)
9. [Authentication](#authentication)
10. [Troubleshooting](#troubleshooting)

---

## Philosophy

**The caller defines the game. The responder plays or declines.**

Inspired by Postel's Law: *"Be conservative in what you send, be liberal in what you accept."*

This is the digital equivalent of a Request for Quote (RFQ): the buyer specifies what they need, and the seller either delivers structured compliance or declines. No negotiation on format — only on substance.

---

## Architecture Overview

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

---

## Dual-Mode Protocol

### Mode 1: Skill Execution (Structured)

Deterministic, schema-bound, machine-to-machine.

```
Client → { skill: "get_quote", arguments: { product: "flashlight", qty: 1000 } }
Server → { price_cents: 4500, currency: "SEK", lead_days: 14 }
```

- **When to use**: Known capabilities, repeatable operations, data exchange
- **Contract**: Defined by `agent-card` (Agent Card) with `inputSchema`/`outputSchema`
- **Routing**: `a2a-ingest` → `agent-execute` → skill handler → structured response

### Mode 2: Chat (Conversational)

Flexible, natural language, LLM-mediated. **With per-peer conversation memory** — FlowPilot remembers every exchange.

```
Client → { text: "Can you deliver 1000 branded flashlights in 2 weeks?" }
Server → { result: "Yes. 1000 units, 2-week lead time, 45 000 SEK ex VAT." }
```

The caller can also suggest a response format (Postel's Law):

```
Client → { text: "Give me a site health summary", responseSchema: { pages: "number", leads: "number", issues: "string[]" } }
Server → { result: { pages: 12, leads: 34, issues: ["Missing meta on /about"] } }
```

- **When to use**: Exploratory questions, unknown capabilities, nuanced requests
- **Contract**: Best-effort — the caller can *suggest* a response format, the server's LLM tries to comply
- **Routing**: `a2a-ingest` → `a2a-chat` → `chat-completion` → free-text response

### How the router decides

In `a2a-ingest/index.ts`:

```
if body has { skill, arguments }     → Mode 1 (structured)
if body has JSON-RPC message/send    → extract skill: prefix or fallback to Mode 2
else                                 → Mode 2 (chat)
```

---

## The Five Edge Functions

| Function | Direction | Purpose |
|---|---|---|
| `agent-card` | Inbound (GET) | Publishes our Agent Card — who we are, what skills we expose |
| `a2a-ingest` | Inbound (POST) | Gateway — authenticates peer, routes to skill or chat |
| `a2a-chat` | Inbound (internal) | Handles conversational messages through FlowPilot's LLM |
| `a2a-outbound` | Outbound (POST) | Calls external peers — auto-detects their protocol |
| `a2a-discover` | Outbound (GET) | Fetches and parses remote Agent Cards (CORS proxy) |

---

## Authentication

### Inbound (peers calling us)

```
Peer → Authorization: Bearer <token>
       ↓
a2a-ingest → SHA-256(token) → lookup in a2a_peers.inbound_token_hash
       ↓
Match + status=active → proceed
No match → 403
```

### Outbound (us calling peers)

```
a2a-outbound → lookup peer in a2a_peers
            → Authorization: Bearer <peer.outbound_token>
            → POST to peer.url + endpoint
```

---

## Data Flow

### Inbound request lifecycle

```
1. Peer sends request to a2a-ingest
2. Token validated against a2a_peers
3. Activity logged as 'pending' in a2a_activity
4. Request routed:
   - Skill mode → agent-execute → handler → result
   - Chat mode → a2a-chat → chat-completion → text
5. Activity updated with output, status, duration_ms
6. Peer stats updated (last_seen_at, request_count)
7. Response returned (JSON-RPC or native format)
```

### Outbound request lifecycle

```
1. FlowPilot's reason() loop decides to call a peer
2. agent-execute sees a2a: handler prefix
3. a2a-outbound resolves peer from a2a_peers
4. Protocol auto-detected from peer.capabilities:
   - jsonrpc → JSON-RPC 2.0 envelope
   - native  → { skill, arguments }
   - legacy  → { type: "task", skill_id, input }
5. 55s timeout, activity logged
6. Response parsed and returned to reason() loop
```

---

## Agent Card (Discovery)

Published at `/functions/v1/agent-card`:

```json
{
  "protocolVersion": "0.3.0",
  "name": "FlowPilot",
  "description": "Autonomous CMS operator for FlowWink",
  "url": "https://.../functions/v1/a2a-ingest",
  "capabilities": { "streaming": false },
  "skills": [
    { "id": "manage_blog_posts", "name": "manage_blog_posts", "tags": ["content"] },
    { "id": "get_quote", "name": "get_quote", "tags": ["commerce"] }
  ],
  "security": [{ "bearer": [] }]
}
```

Skills are loaded dynamically from `agent_skills` where `scope = 'external'` or `'both'`.

---

## Context Enrichment

When `a2a-ingest` receives a request, it auto-injects peer context:

```typescript
const enrichedArgs = {
  ...args,
  peer_name: peer.name,      // Who is calling
  _a2a_peer_id: peer.id,     // Internal reference
  _site_url: 'https://demo.flowwink.com',  // Our identity
};
```

This means skills like `a2a_chat` automatically know who they're talking to without the caller specifying it.

---

## Design Principles

### 1. Caller defines the contract

The requesting agent specifies what data it needs and in what format. The responding agent either complies or declines. There is no negotiation on schema.

### 2. Skills for systems, chat for humans (and LLMs)

If both sides know the operation → use a skill with strict schema.
If either side is exploring → use chat with suggested format.

### 3. Fail forward

Network errors, timeouts, and peer unavailability are expected states, not exceptions. The system logs `peer_unavailable` and continues operating.

### 4. Everything is audited

Every inbound and outbound interaction is logged in `a2a_activity` with:
- `peer_id`, `direction`, `skill_name`
- `input`, `output`, `status`, `duration_ms`, `error_message`

### 5. Protocol agnostic outbound

`a2a-outbound` auto-detects the peer's protocol from their `capabilities` field. No configuration needed per peer — just register URL and token.

---

## Database Schema

### a2a_peers

| Column | Purpose |
|---|---|
| `name` | Human-readable peer name |
| `url` | Base URL for outbound calls |
| `outbound_token` | Token we send when calling this peer |
| `inbound_token_hash` | SHA-256 of token this peer uses to call us |
| `capabilities` | JSON: protocol, endpoint, features |
| `status` | active / inactive |
| `last_seen_at` | Last successful interaction |
| `request_count` | Total requests served |

### a2a_activity

| Column | Purpose |
|---|---|
| `peer_id` | Which peer |
| `direction` | inbound / outbound |
| `skill_name` | What was requested |
| `input` / `output` | Request and response payloads |
| `status` | pending / success / error |
| `duration_ms` | Round-trip time |
| `error_message` | If failed |

---

## Adding a New Peer

1. Register in `a2a_peers` with `name`, `url`, `outbound_token`
2. Generate an inbound token, hash it, store in `inbound_token_hash`
3. Set `capabilities`: `{ "protocol": "jsonrpc", "endpoint": "/a2a/ingest" }`
4. Set `status: "active"`

The peer can now call us and we can call them. No code changes needed.

## Adding a New Skill for Peers

1. Insert into `agent_skills` with `scope: "external"` or `"both"`
2. Set `handler` (e.g., `edge:my-function`, `module:crm`, `db:products`)
3. The skill auto-appears in our Agent Card
4. Peers can discover it and call it immediately

---

## OpenClaw Integration

> OpenClaw (v2026.3+) supports A2A via the **`openclaw-a2a-gateway`** plugin, which implements Google's **A2A v0.3.0 protocol**.

### How OpenClaw ↔ FlowPilot Works

```
OpenClaw Instance                          FlowPilot (FlowWink)
┌─────────────────────┐                   ┌─────────────────────┐
│  Gateway + A2A      │   JSON-RPC/REST   │  a2a-ingest         │
│  Plugin             │ ◄───────────────► │  (edge function)    │
│                     │   Bearer Token    │                     │
│  /.well-known/      │                   │  /functions/v1/     │
│   agent-card.json   │                   │   a2a-ingest        │
│                     │                   │                     │
│  Skills:           │                   │  Skills:            │
│  - chat             │                   │  - beta_test_*      │
│  - code_review      │                   │  - site_audit       │
│  - test_scenario    │                   │  - content_review   │
└─────────────────────┘                   └─────────────────────┘
```

### OpenClaw's A2A Plugin Features

| Feature | Status | Relevance |
|---------|--------|-----------|
| **Agent Card** (`/.well-known/agent-card.json`) | ✅ Stable | FlowPilot should expose one |
| **JSON-RPC + REST transports** | ✅ v0.3.0 | Our `a2a-ingest` already speaks REST |
| **Bearer token auth** | ✅ Production | Matches our `inbound_token_hash` model |
| **DNS-SD / mDNS discovery** | ✅ v1.2.0 | Not relevant for cloud (Supabase) |
| **SSE streaming** | ✅ v1.0.0 | Future: live progress |
| **Peer skills caching** | ✅ v1.1.0 | OpenClaw caches FlowPilot's skill list |
| **HMAC push notifications** | ✅ v0.5.0 | Webhook callbacks on task completion |
| **Rule-based routing** | ✅ v1.1.0 | Route by pattern to right FlowPilot skill |

### Symbiosis Model: Architect ↔ Operator

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

---

## Configuration Guide

### Prerequisites

- OpenClaw ≥ 2026.3.0 with `openclaw-a2a-gateway` v1.2.0+ installed
- FlowPilot peer registered in Federation admin (gives you an **Inbound Token**)
- FlowPilot endpoint: `https://demo.flowwink.com/functions/v1/a2a-ingest`
- Agent Card: `https://demo.flowwink.com/functions/v1/agent-card`

### 1. Add FlowPilot as Peer

```bash
openclaw config set plugins.entries.a2a-gateway.config.peers '[
  {
    "name": "FlowPilot",
    "agentCardUrl": "https://demo.flowwink.com/functions/v1/agent-card",
    "auth": {
      "type": "bearer",
      "token": "<FLOWPILOT_INBOUND_TOKEN>"
    }
  }
]'
```

### 2. Configure Routing Rules (Optional but Recommended)

```bash
openclaw config set plugins.entries.a2a-gateway.config.routing.rules '[
  {
    "name": "site-audit-to-flowpilot",
    "match": { "pattern": "(audit|review|analyze|check).*(site|page|seo|content)" },
    "target": { "peer": "FlowPilot" },
    "priority": 10
  },
  {
    "name": "booking-to-flowpilot",
    "match": { "pattern": "(book|appointment|schedule|availability)" },
    "target": { "peer": "FlowPilot" },
    "priority": 10
  }
]'
```

### 3. Configure Timeouts

FlowPilot's AI skills can take 10-30 seconds:

```bash
openclaw config set plugins.entries.a2a-gateway.config.timeouts.agentResponseTimeoutMs 120000
```

### 4. Add A2A Section to TOOLS.md

Add to `~/.openclaw/workspace/TOOLS.md`:

````markdown
## A2A Gateway — FlowPilot Peer

You have an A2A peer called **FlowPilot** — an autonomous CMS operator.

### What FlowPilot Can Do
- **Site audit**: SEO analysis, content quality, broken links
- **Booking management**: Check availability, manage appointments
- **CMS operations**: Publish pages, manage blog posts, handle leads
- **Beta testing**: Run structured test scenarios

### How to Send a Message

```bash
node ~/.openclaw/workspace/plugins/a2a-gateway/skill/scripts/a2a-send.mjs \
  --peer-url https://demo.flowwink.com/functions/v1/a2a-ingest \
  --token <FLOWPILOT_TOKEN> \
  --message "YOUR MESSAGE HERE"
```
````

---

## Peer Setup

### What FlowPilot Exposes

### Agent Card
```
GET https://rzhjotxffjfsdlhrdkpj.supabase.co/functions/v1/agent-card
```

Returns A2A v0.3.0 compliant Agent Card with:
- 13+ external skills (booking, CRM, content, search, etc.)
- Bearer token auth
- JSON-RPC + REST support

### A2A Ingest Endpoint
```
POST https://rzhjotxffjfsdlhrdkpj.supabase.co/functions/v1/a2a-ingest
Authorization: Bearer <inbound_token>
```

Supports:
1. **Native**: `{ "skill": "skill_name", "arguments": { ... } }`
2. **A2A v0.3.0 JSON-RPC**: `{ "jsonrpc": "2.0", "method": "message/send", "params": { ... } }`

### OpenClaw's Confirmed Skills (4 registered)

| Skill | Description | Handler | Trust |
|-------|-------------|---------|-------|
| `openclaw_test` | Run autonomous tests on a URL | `a2a:openclaw` | notify |
| `openclaw_audit` | Code/architecture audit | `a2a:openclaw` | notify |
| `openclaw_browse` | Browse and interact with web pages | `a2a:openclaw` | auto |
| `openclaw_report` | Create structured bug reports | `a2a:openclaw` | auto |

### Next Steps

1. **OpenClaw configures their Agent Card endpoint** → gives us URL
2. **OpenClaw generates a bearer token for FlowPilot** → we store as `outbound_token`
3. **We register OpenClaw as peer** in Federation panel with their URL + token
4. **Test bidirectional communication**

---

## Dual-Channel Architecture

> FlowPilot communicates with OpenClaw peers through two complementary channels,
> selected automatically based on the skill's `handler` prefix.

### Architecture

```
FlowPilot agent-execute
    │
    ├── handler: "responses:openclaw"
    │   └── openclaw-responses edge function
    │       └── POST /v1/responses (port 18789)
    │           └── OpenClaw's LLM processes directly
    │           └── Synchronous structured response
    │
    └── handler: "a2a:openclaw"
        └── a2a-outbound edge function
            └── JSON-RPC message/send
                └── A2A gateway plugin
                └── Async task lifecycle
```

### When to Use Which

| Aspect | OpenResponses (`responses:`) | A2A (`a2a:`) |
|--------|------------------------------|---------------|
| **Pattern** | FlowPilot commands, OpenClaw executes | Peer-to-peer, bidirectional |
| **Format** | OpenAI Responses API | JSON-RPC 2.0 (A2A v0.3.0) |
| **Response** | Synchronous, single response | Async task lifecycle |
| **Best for** | QA testing, code audits, site browsing | Natural language chat, sharing findings |

### Comparison Summary

```
┌──────────────────┬────────────────────────┬─────────────────────────┐
│                  │ OpenResponses          │ A2A                     │
│                  │ (responses:)           │ (a2a:)                  │
├──────────────────┼────────────────────────┼─────────────────────────┤
│ Initiator        │ Always FlowPilot       │ Either side             │
│ LLM access       │ Direct (no middleman)  │ Via gateway serializer   │
│ Task lifecycle   │ Sync (req/res)         │ Async (state machine)   │
│ Agent Card       │ Not needed             │ Used for discovery       │
│ Config needed    │ Gateway token only     │ A2A gateway plugin      │
└──────────────────┴────────────────────────┴─────────────────────────┘
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `401 Unauthorized` | Wrong token | Verify token matches FlowPilot's Federation admin inbound token |
| Timeout errors | FlowPilot skill takes too long | Increase `agentResponseTimeoutMs` or use `--non-blocking --wait` |
| Free-text responses instead of JSON | OpenClaw's LLM ignores responseSchema | Use `skill:` prefix for structured calls |
| Agent doesn't call FlowPilot | Missing TOOLS.md section | Add the A2A section to TOOLS.md |
| `peer_unavailable` | Peer is offline | Graceful degradation — system continues operating |

---

*Last updated: March 2026*
