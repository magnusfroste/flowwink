# OpenClaw ↔ FlowPilot: A2A Symbiosis Strategy

> Research findings and integration roadmap for using OpenClaw as a development/testing partner for FlowPilot.

---

## Key Finding: OpenClaw's A2A Model

OpenClaw (v2026.3+) supports A2A via the **`openclaw-a2a-gateway`** plugin ([win4r/openclaw-a2a-gateway](https://github.com/win4r/openclaw-a2a-gateway)), which implements Google's **A2A v0.3.0 protocol**.

### How OpenClaw A2A Works

```
OpenClaw Instance                          FlowWink (FlowPilot)
┌─────────────────────┐                   ┌─────────────────────┐
│  Gateway + A2A      │   JSON-RPC/REST   │  a2a-ingest         │
│  Plugin             │ ◄───────────────► │  (edge function)    │
│                     │   Bearer Token    │                     │
│  /.well-known/      │                   │  /functions/v1/     │
│   agent-card.json   │                   │   a2a-ingest        │
│                     │                   │                     │
│  Skills:            │                   │  Skills:            │
│  - chat             │                   │  - beta_test_*      │
│  - code_review      │                   │  - site_audit       │
│  - test_scenario    │                   │  - content_review   │
└─────────────────────┘                   └─────────────────────┘
```

### Agent Card (Discovery Protocol)

Every A2A agent publishes a **Agent Card** at `/.well-known/agent-card.json`:

```json
{
  "agent_id": "flowwink-pilot",
  "name": "FlowPilot",
  "description": "Autonomous CMS operator for FlowWink",
  "capabilities": {
    "streaming": false,
    "push_notifications": false
  },
  "skills": [
    { "id": "beta_test", "name": "Beta Test Session", "description": "Run structured test scenarios" },
    { "id": "site_audit", "name": "Site Audit", "description": "Audit SEO, content, and UX" },
    { "id": "report_finding", "name": "Report Finding", "description": "Submit a bug or improvement" }
  ],
  "service_endpoints": [
    { "url": "https://demo.flowwink.com/functions/v1/a2a-ingest", "transport": "http" }
  ],
  "security_schemes": {
    "bearer": { "type": "http", "scheme": "bearer" }
  }
}
```

### OpenClaw's A2A Plugin Features

| Feature | Status | Relevance |
|---------|--------|-----------|
| **Agent Card** (`/.well-known/agent-card.json`) | ✅ Stable | FlowWink should expose one too |
| **JSON-RPC + REST transports** | ✅ v0.3.0 | Our `a2a-ingest` already speaks REST |
| **Bearer token auth** | ✅ Production | Matches our `inbound_token_hash` model |
| **DNS-SD / mDNS discovery** | ✅ v1.2.0 | Not relevant for cloud (Supabase) |
| **SSE streaming** | ✅ v1.0.0 | Future: live test progress |
| **Peer skills caching** | ✅ v1.1.0 | OpenClaw caches our skill list |
| **HMAC push notifications** | ✅ v0.5.0 | Webhook callbacks on task completion |
| **Rule-based routing** | ✅ v1.1.0 | Route by pattern to right FlowPilot skill |

---

## Symbiosis Model: Architect ↔ Operator

```
┌─────────────────────────────────────────────────────────┐
│                    SYMBIOSIS LOOP                        │
│                                                          │
│  OpenClaw (Architect)          FlowPilot (Operator)      │
│  ┌──────────────┐              ┌──────────────┐          │
│  │ Reads source │──versions──►│ Bootstrap     │          │
│  │ code + docs  │              │ seeds skills  │          │
│  ├──────────────┤              ├──────────────┤          │
│  │ Runs test    │──A2A────────►│ Executes     │          │
│  │ scenarios    │              │ test skills   │          │
│  ├──────────────┤              ├──────────────┤          │
│  │ Reports      │──findings──►│ Heartbeat     │          │
│  │ findings     │              │ picks up      │          │
│  ├──────────────┤              ├──────────────┤          │
│  │ Suggests     │──proposals─►│ Evaluates +   │          │
│  │ improvements │              │ applies       │          │
│  └──────────────┘              └──────────────┘          │
│                                                          │
│  VERSION AWARENESS:                                      │
│  OpenClaw monitors the FlowWink repo and adjusts its     │
│  test scenarios when skills/schemas change.               │
└─────────────────────────────────────────────────────────┘
```

---

## What We Already Have vs. What's Needed

### ✅ Already Implemented

| Component | Status |
|-----------|--------|
| `a2a_peers` table | Peer registry with token auth |
| `a2a_activity` table | Full audit trail |
| `a2a-ingest` edge function | Inbound gateway with skill routing |
| `beta_test_sessions/findings/exchanges` | Test data model |
| Federation admin UI | Peer management + activity view |
| `openclaw-module.ts` | Client-side convenience wrapper |

### 🔲 Needed for True Symbiosis

| Component | Purpose | Effort |
|-----------|---------|--------|
| **Agent Card endpoint** | Expose `/.well-known/agent-card.json` so OpenClaw can discover us | Small — static JSON via edge function |
| **Outbound A2A client** | FlowPilot calls OpenClaw proactively (not just receive) | Medium — new edge function |
| **Version-aware test suite** | OpenClaw reads `agent_skills` and generates tests matching current capabilities | Medium — skill introspection A2A skill |
| **Skill diff webhook** | Notify OpenClaw when skills change (bootstrap runs) | Small — webhook in setup-flowpilot |
| **Structured findings → objectives** | Auto-convert OpenClaw findings into FlowPilot objectives | Small — new handler in heartbeat |

---

## Integration Roadmap

### Phase 1: Discovery (Now)
- Expose Agent Card at `/.well-known/agent-card.json`
- Add `skill_introspect` A2A skill (returns current skill registry)
- OpenClaw can discover what FlowPilot can do

### Phase 2: Structured Testing
- OpenClaw runs test scenarios via A2A
- Findings auto-create `agent_objectives` with `source: 'a2a:openclaw'`
- FlowPilot heartbeat picks up and acts on findings

### Phase 3: Bidirectional Collaboration
- FlowPilot proactively asks OpenClaw for code reviews / architecture advice
- OpenClaw monitors repo changes and suggests test updates
- Shared learning: findings from one instance benefit others

### Phase 4: Version Co-Evolution
- OpenClaw tracks FlowWink releases
- Auto-generates regression test suites for new skills
- Reports compatibility issues before deployment

---

## Protocol Compatibility Analysis

| FlowWink Current | A2A v0.3.0 Standard | Gap |
|-------------------|---------------------|-----|
| Bearer token via `Authorization` header | ✅ Same | None |
| `{ skill, arguments }` body format | `{ messages: [{ parts }] }` task format | **Adapter needed** |
| `a2a_activity` logging | Task lifecycle (submitted → working → completed) | Map our `status` enum |
| Skill-based routing via `agent-execute` | Skill-based routing via Agent Card | **Expose skills in card** |
| No Agent Card | Required for discovery | **Must add** |

### Message Format Adapter

Our `a2a-ingest` currently expects:
```json
{ "skill": "openclaw_start_session", "arguments": { "scenario": "..." } }
```

A2A v0.3.0 standard expects:
```json
{
  "jsonrpc": "2.0",
  "method": "message/send",
  "params": {
    "message": {
      "role": "user",
      "parts": [{ "type": "text", "text": "Start beta test: visitor lead pipeline" }]
    }
  }
}
```

**Decision**: Support both formats in `a2a-ingest` — detect by presence of `jsonrpc` field.

---

## Conclusion

FlowPilot **is already architecturally compatible** with OpenClaw's A2A model. The main gaps are:

1. **Agent Card** — a static JSON endpoint (trivial)
2. **Message format adapter** — support A2A v0.3.0 alongside our current format
3. **Outbound client** — let FlowPilot initiate conversations with OpenClaw

The symbiosis is natural: OpenClaw brings **architectural oversight and testing discipline**, FlowPilot brings **operational execution and domain knowledge**. They complement each other without competing.
