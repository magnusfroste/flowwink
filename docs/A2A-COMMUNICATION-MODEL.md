# FlowWink A2A Communication Model

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
