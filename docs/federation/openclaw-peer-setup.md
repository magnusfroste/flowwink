# OpenClaw ↔ FlowPilot: Peer Setup Guide

## What FlowPilot Exposes (Ready Now)

### Agent Card
```
GET https://rzhjotxffjfsdlhrdkpj.supabase.co/functions/v1/agent-card
```

Returns A2A v0.3.0 compliant Agent Card with:
- 13 external skills (booking, CRM, content, search, etc.)
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

## What You Need FROM OpenClaw

Ask OpenClaw to provide these details:

### 1. Agent Card URL (Required)
> "What is your Agent Card URL? (e.g. `http://<ip>:18800/.well-known/agent-card.json`)"

This tells FlowPilot what skills OpenClaw offers.

### 2. Inbound Token (Required)
> "Generate a bearer token for FlowPilot to use when calling you."

This is the **outbound_token** we store in `a2a_peers` — the token FlowPilot sends TO OpenClaw.

### 3. Your Capabilities / Skills (Good to know)
> "What skills do you expose? Can you: code review, run tests, audit architecture, suggest improvements?"

This helps us configure routing rules.

### 4. Preferred Communication Mode
> "Do you prefer native skill format or A2A v0.3.0 JSON-RPC?"

Both are now supported by our `a2a-ingest`.

---

## What You Give TO OpenClaw

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
# On their OpenClaw instance:
openclaw config set plugins.entries.a2a-gateway.config.peers '[{
  "name": "flowwink",
  "agentCardUrl": "https://rzhjotxffjfsdlhrdkpj.supabase.co/functions/v1/agent-card",
  "auth": { "type": "bearer", "token": "<token_from_federation_panel>" }
}]'
```

---

## Peer Registration in Federation Panel

Once you have OpenClaw's details, register them:

| Field | Value |
|-------|-------|
| **Name** | `openclaw` |
| **URL** | OpenClaw's Agent Card URL or gateway URL |
| **Outbound Token** | Token OpenClaw gave you (for calls TO them) |
| **Inbound Token** | Auto-generated (share with OpenClaw) |

---

## Testing the Connection

### OpenClaw → FlowPilot (inbound)
```bash
curl -X POST https://rzhjotxffjfsdlhrdkpj.supabase.co/functions/v1/a2a-ingest \
  -H "Authorization: Bearer <inbound_token>" \
  -H "Content-Type: application/json" \
  -d '{"skill": "browse_blog", "arguments": {}}'
```

### FlowPilot → OpenClaw (outbound)
Not yet implemented — requires outbound A2A client edge function.

---

## Summary Checklist

- [x] Agent Card endpoint deployed
- [x] A2A v0.3.0 JSON-RPC support in a2a-ingest
- [ ] Get OpenClaw's Agent Card URL
- [ ] Get OpenClaw's bearer token
- [ ] Register OpenClaw as peer in Federation panel
- [ ] Share our inbound token + Agent Card URL with OpenClaw
- [ ] Test bidirectional communication
