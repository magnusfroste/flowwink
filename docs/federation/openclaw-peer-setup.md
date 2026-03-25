# OpenClaw ↔ FlowPilot: Peer Setup Guide

## Status: Skills Registered ✅ — Awaiting Token Exchange

---

## What FlowPilot Exposes (Ready Now)

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

Supports two formats:
1. **Native**: `{ "skill": "skill_name", "arguments": { ... } }`
2. **A2A v0.3.0 JSON-RPC**: `{ "jsonrpc": "2.0", "method": "message/send", "params": { "message": { "parts": [...] } } }`

---

## OpenClaw's Confirmed Skills (4 registered)

| Skill | Description | Handler | Trust |
|-------|-------------|---------|-------|
| `openclaw_test` | Run autonomous tests on a URL | `a2a:openclaw` | notify |
| `openclaw_audit` | Code/architecture audit | `a2a:openclaw` | notify |
| `openclaw_browse` | Browse and interact with web pages | `a2a:openclaw` | auto |
| `openclaw_report` | Create structured bug reports | `a2a:openclaw` | auto |

All registered in `agent_skills` with `origin: a2a`, `category: testing`, `scope: internal`.

---

## What We Still Need FROM OpenClaw

### 1. Agent Card URL (Pending)
OpenClaw has no public agent-card endpoint yet. Needs to be configured in their gateway.

### 2. Bearer Token for FlowPilot (Pending)
OpenClaw needs to generate a token so FlowPilot can call their skills outbound.

### 3. Preferred Format ✅
JSON-RPC confirmed as preferred for A2A integration.

---

## What OpenClaw Needs FROM Us

### A2A Endpoint
```
https://rzhjotxffjfsdlhrdkpj.supabase.co/functions/v1/a2a-ingest
```

### Agent Card URL
```
https://rzhjotxffjfsdlhrdkpj.supabase.co/functions/v1/agent-card
```

### Inbound Token
Generate one in the Federation admin panel (`/admin/federation` → Add Peer → copy the one-time token shown).

### OpenClaw Config (what they paste)
```bash
openclaw config set plugins.entries.a2a-gateway.config.peers '[{
  "name": "flowwink",
  "agentCardUrl": "https://rzhjotxffjfsdlhrdkpj.supabase.co/functions/v1/agent-card",
  "auth": { "type": "bearer", "token": "<token_from_federation_panel>" }
}]'
```

---

## Next Steps

1. **OpenClaw configures their Agent Card endpoint** → gives us URL
2. **OpenClaw generates a bearer token for FlowPilot** → we store as `outbound_token`
3. **We register OpenClaw as peer** in Federation panel with their URL + token
4. **We generate an inbound token** and share it with OpenClaw
5. **Test bidirectional communication**

### Testing (once tokens exchanged)

#### OpenClaw → FlowPilot (inbound)
```bash
curl -X POST https://rzhjotxffjfsdlhrdkpj.supabase.co/functions/v1/a2a-ingest \
  -H "Authorization: Bearer <inbound_token>" \
  -H "Content-Type: application/json" \
  -d '{"skill": "browse_blog", "arguments": {}}'
```

#### FlowPilot → OpenClaw (outbound)
Uses `a2a-outbound` edge function (service-role only):
```bash
curl -X POST https://rzhjotxffjfsdlhrdkpj.supabase.co/functions/v1/a2a-outbound \
  -H "Authorization: Bearer <service_role_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "peer_name": "openclaw",
    "skill": "openclaw_test",
    "arguments": { "url": "https://demo.flowwink.com" }
  }'
```

Supports JSON-RPC (default), native, and legacy protocols.
Also callable internally via `agent-execute` with `handler: a2a:openclaw`.

---

## Summary Checklist

- [x] Agent Card endpoint deployed
- [x] A2A v0.3.0 JSON-RPC support in a2a-ingest
- [x] OpenClaw skills registered (4 skills, `a2a:openclaw` handler)
- [x] `testing` category + `a2a` origin added to enums
- [ ] Get OpenClaw's Agent Card URL
- [ ] Get OpenClaw's bearer token for outbound calls
- [ ] Register OpenClaw as peer in Federation panel
- [ ] Share our inbound token + Agent Card URL with OpenClaw
- [ ] Build outbound A2A client edge function
- [ ] Test bidirectional communication
