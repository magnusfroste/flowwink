# Dual-Channel Communication: A2A + OpenResponses

> FlowPilot communicates with OpenClaw peers through two complementary channels,
> selected automatically based on the skill's `handler` prefix.

---

## Architecture Overview

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

## Shared Infrastructure

Both channels use the **same peer record** in `a2a_peers`:

| Field | Used by A2A | Used by OpenResponses |
|-------|:-----------:|:---------------------:|
| `url` | ✅ base URL for A2A gateway | ✅ base URL for /v1/responses |
| `outbound_token` | ✅ as Bearer token | ✅ as x-openclaw-token |
| `capabilities` | ✅ protocol detection | — |
| `status` | ✅ must be 'active' | ✅ must be 'active' |

Both channels log to `a2a_activity` for unified observability.

## When to Use Which

### OpenResponses (`responses:`) — Boss → Worker

| Aspect | Detail |
|--------|--------|
| **Pattern** | FlowPilot commands, OpenClaw executes |
| **Endpoint** | `POST {peer_url}/v1/responses` |
| **Auth** | `x-openclaw-token` header |
| **Format** | OpenAI Responses API |
| **Response** | Synchronous, single response |
| **Strength** | Direct LLM access — no serialization loss |

Best for:
- QA testing (`openclaw_test`)
- Code audits (`openclaw_audit`)
- Site browsing (`openclaw_browse`)
- Any task where FlowPilot defines the contract

### A2A (`a2a:`) — Colleague ↔ Colleague

| Aspect | Detail |
|--------|--------|
| **Pattern** | Peer-to-peer, bidirectional |
| **Endpoint** | A2A gateway (configurable) |
| **Auth** | Bearer token |
| **Format** | JSON-RPC 2.0 (A2A v0.3.0) |
| **Response** | Async task lifecycle |
| **Strength** | Discovery, mutual initiation |

Best for:
- Natural language chat (`openclaw_chat`)
- Sharing findings/reports
- Situations where OpenClaw initiates

## Skill Registration

The `handler` field in `agent_skills` determines the channel:

```sql
-- QA skills → OpenResponses (structured, deterministic)
UPDATE agent_skills SET handler = 'responses:openclaw'
WHERE name IN ('openclaw_test', 'openclaw_audit', 'openclaw_browse');

-- Chat skills → A2A (peer conversation)
UPDATE agent_skills SET handler = 'a2a:openclaw'
WHERE name IN ('openclaw_chat', 'openclaw_report');
```

## OpenClaw Configuration

### Required on OpenClaw side

The `/v1/responses` endpoint is **enabled by default** in OpenClaw. Verify:

```json5
// ~/.openclaw/openclaw.json
{
  gateway: {
    http: {
      endpoints: {
        responses: { enabled: true }  // default: true
      }
    }
  }
}
```

### Gateway token

The same gateway token used for the web UI (port 18789) authenticates
OpenResponses calls. This token is stored as `outbound_token` in the
peer's `a2a_peers` record.

```bash
# Get the token from OpenClaw
openclaw config get gateway.auth.token
```

## Example: FlowPilot requesting a QA test

```typescript
// In agent-execute, when FlowPilot calls openclaw_test:
// handler = "responses:openclaw" → routes to executeOpenResponsesRequest()

// Which calls openclaw-responses edge function with:
{
  peer_name: "openclaw",
  prompt: "Test the booking flow on https://demo.flowwink.com. Visit the booking page, select a service, pick a date, and report any issues.",
  system: "You are a QA tester. Report findings as JSON: { findings: [{ severity, location, description }] }",
  response_format: "json"
}
```

## Comparison Summary

```
┌──────────────────┬────────────────────────┬─────────────────────────┐
│                  │ OpenResponses          │ A2A                     │
│                  │ (responses:)           │ (a2a:)                  │
├──────────────────┼────────────────────────┼─────────────────────────┤
│ Initiator        │ Always FlowPilot       │ Either side             │
│ LLM access       │ Direct (no middleman)  │ Via gateway serializer  │
│ responseSchema   │ Honored (instructions) │ May be lost             │
│ Task lifecycle   │ Sync (req/res)         │ Async (state machine)   │
│ Agent Card       │ Not needed             │ Used for discovery      │
│ Config needed    │ Gateway token only     │ A2A gateway plugin      │
│ Complexity       │ Low                    │ Higher                  │
└──────────────────┴────────────────────────┴─────────────────────────┘
```

---

*Updated: 2026-03-28*
