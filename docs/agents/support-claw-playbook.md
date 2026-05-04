---
title: "Support Department — External Claw Playbook"
audience: "external operators (OpenClaw, ClawThree, Claude Desktop, custom MCP claws)"
last_updated: "2026-05-04"
---

# Support Department Playbook

This playbook lets an **external claw** act as FlowWink's support department —
triaging tickets, answering from the knowledge base, monitoring SLA compliance,
and escalating intelligently — **without FlowPilot involvement**.

## Connect

```http
POST https://<your-flowwink>.lovable.app/functions/v1/mcp-server
Authorization: Bearer <MCP_API_KEY>
```

## Pull only the support toolkit

```http
GET /rest/tools?groups=support
```

`support` expands to:

| Category | What you get | Example skills |
|----------|--------------|----------------|
| `communication` | Tickets, email, chat | `manage_ticket`, `send_email`, `manage_live_support` |
| `crm` | Customer context | `manage_contacts`, `manage_companies`, `customer360` |
| `content` | KB, docs lookup | `manage_kb_article`, `manage_page`, `upload_document` |
| `analytics` | SLA, volume | `analytics_query`, `sla_check` |
| `automation` | Utilities | `extract_pdf_text`, `process_signal` |

## End-to-end support loop

### 1. Triage incoming tickets

```jsonc
// List unassigned / new tickets
{"tool":"manage_ticket","arguments":{"action":"list","status":"open","assignee":null}}
```

For each ticket, fetch context:

```jsonc
{"tool":"customer360","arguments":{"contact_id":"<id>"}}
// → past tickets, orders, contracts, NPS
```

### 2. Search the knowledge base

```jsonc
{"tool":"manage_kb_article","arguments":{
  "action":"search",
  "query":"reset password 2FA"
}}
// → matching articles with snippets
```

### 3. Reply

If KB has a match:

```jsonc
{"tool":"manage_ticket","arguments":{
  "action":"reply",
  "id":"<ticket_id>",
  "body":"Hi <name>, here are the steps to reset...\n\nReference: <kb_url>",
  "status":"pending_customer"
}}
```

Or via email directly:

```jsonc
{"tool":"send_email","arguments":{
  "to":"customer@example.com",
  "subject":"Re: <ticket subject>",
  "body":"...",
  "ticket_id":"<id>"
}}
```

### 4. Escalate when needed

```jsonc
// Reassign to human team
{"tool":"manage_ticket","arguments":{
  "action":"update",
  "id":"<ticket_id>",
  "priority":"high",
  "assignee_id":"<user_id>",
  "tags":["escalated","claw-triaged"]
}}
```

### 5. Monitor SLA

Run periodically (e.g. every 30 min):

```jsonc
{"tool":"sla_check","arguments":{"scope":"tickets"}}
// → list of tickets approaching/breaching SLA
```

For each at-risk ticket: re-prioritize, ping assignee, or escalate.

### 6. Close & document gaps

When you couldn't answer from KB, file the gap:

```jsonc
// Create a draft KB article from the resolution
{"tool":"manage_kb_article","arguments":{
  "action":"create",
  "title":"How to reset 2FA from mobile",
  "category":"account",
  "content":"...",
  "status":"draft"   // human reviews before publish
}}
```

### 7. Report back

```jsonc
{"tool":"analytics_query","arguments":{
  "metric":"ticket_volume",
  "group_by":"category",
  "period":"week"
}}
{"tool":"analytics_query","arguments":{
  "metric":"sla_compliance",
  "period":"week"
}}
```

## Live chat handoff

If the site uses live-support (visitor chat), the claw can pick up sessions:

```jsonc
{"tool":"manage_live_support","arguments":{"action":"list_active"}}
{"tool":"manage_live_support","arguments":{
  "action":"send_message",
  "session_id":"<id>",
  "message":"Hi, I can help with that..."
}}
```

## Approval gating

| Skill | trust_level | Why |
|-------|-------------|-----|
| `manage_ticket` (reply/update) | `notify` | Standard support work. |
| `send_email` | `notify` | Outbound reply. |
| `manage_kb_article` (publish) | may be `approve` | Public content — site policy. |
| `customer360` | `notify` | Read-only. |

## What's NOT exposed

| Skill | Why hidden |
|-------|------------|
| `a2a_*`, `openclaw_*` | FlowPilot peer-comms primitives. |
| `setup_flowpilot`, agent objectives | Cognition layer. |

## Audit & limits

- **Rate limits**: ~60 req/min per MCP key.
- **Audit**: `agent_executions` with `agent='mcp'`.
- **Read-only fallback**: SLA breaches and tickets remain visible to humans
  in `/admin/tickets` regardless of claw activity.

## Related

- `docs/agents/marketing-claw-playbook.md`, `docs/agents/sales-claw-playbook.md`
- `mem://operations/sla-monitor-and-compliance` — SLA model
- `docs/modules/tickets.md`, `docs/modules/sla.md`, `docs/modules/knowledge-base.md`
