---
title: "Customer Success — External Claw Playbook"
audience: "external operators (OpenClaw, ClawThree, Claude Desktop, custom MCP claws)"
last_updated: "2026-05-04"
---

# Customer Success Playbook

This playbook lets an **external claw** act as FlowWink's customer success
department — driving retention, expansion, NPS follow-ups, and churn prevention
across the subscription base — **without FlowPilot involvement**.

## Connect

```http
POST https://<your-flowwink>.lovable.app/functions/v1/mcp-server
Authorization: Bearer <MCP_API_KEY>
```

## Pull only the success toolkit

```http
GET /rest/tools?groups=success
```

`success` expands to:

| Category | What you get | Example skills |
|----------|--------------|----------------|
| `subscriptions` | Active subs, MRR, churn signals | `manage_subscription`, `list_subscriptions` |
| `communication` | Email, ticket, chat | `send_email`, `manage_ticket` |
| `crm` | Customer, deal, contact context | `manage_contacts`, `manage_companies`, `customer360` |
| `identity` | Auth, roles, profile | `manage_profile` |
| `analytics` | Cohorts, NPS, usage | `analytics_query`, `sla_check` |
| `automation` | Utilities | `process_signal`, `upload_document` |

## End-to-end success loop

### 1. Daily health scan

```jsonc
// Subscriptions due to renew or churn-risk
{"tool":"list_subscriptions","arguments":{"status":"active","renews_within_days":30}}
{"tool":"list_subscriptions","arguments":{"status":"past_due"}}
{"tool":"analytics_query","arguments":{"metric":"churn_risk","period":"month"}}
```

### 2. Customer 360 deep-dive

For each at-risk account:

```jsonc
{"tool":"customer360","arguments":{"contact_id":"<id>"}}
// → tickets (volume, sentiment), last login, MRR, NPS, contract end
```

### 3. Proactive outreach

```jsonc
// Renewal nudge
{"tool":"send_email","arguments":{
  "to":"customer@example.com",
  "subject":"Your plan renews in 14 days — quick check-in?",
  "body":"Hi <name>, ...",
  "template":"renewal_check_in"
}}
```

### 4. Expansion signals

If usage > plan limits, propose upgrade:

```jsonc
{"tool":"manage_subscription","arguments":{
  "action":"propose_upgrade",
  "subscription_id":"<id>",
  "new_plan":"pro_annual"
}}
// → creates a draft quote, notifies customer
```

### 5. NPS & feedback loops

```jsonc
{"tool":"analytics_query","arguments":{
  "metric":"nps_responses",
  "filter":{"score":"detractor"},
  "period":"week"
}}
// For each detractor: open a ticket
{"tool":"manage_ticket","arguments":{
  "action":"create",
  "subject":"Follow up on NPS feedback",
  "contact_id":"<id>",
  "priority":"high",
  "tags":["nps","success-followup"]
}}
```

### 6. Churn prevention

```jsonc
// Cancellation request handling — offer save
{"tool":"manage_subscription","arguments":{
  "action":"pause",            // alternative to cancel
  "subscription_id":"<id>",
  "until":"2026-09-01"
}}
```

### 7. Weekly digest

```jsonc
{"tool":"analytics_query","arguments":{"metric":"mrr","period":"week"}}
{"tool":"analytics_query","arguments":{"metric":"churn_rate","period":"week"}}
{"tool":"analytics_query","arguments":{"metric":"net_revenue_retention","period":"month"}}
```

Synthesize → post as `manage_kb_article` (internal note) or via `agent_events`.

## Approval gating

| Skill | trust_level | Why |
|-------|-------------|-----|
| `customer360`, `analytics_query` | `notify` | Read-only. |
| `send_email` | `notify` | Outbound comms. |
| `manage_subscription` (pause/upgrade proposal) | `notify` | Reversible / draft. |
| `manage_subscription` (cancel) | `approve` | Revenue-affecting — gated. |

## What's NOT exposed

| Skill | Why hidden |
|-------|------------|
| `a2a_*`, `openclaw_*` | FlowPilot peer-comms primitives. |
| Direct `auth.users` mutation | Use `manage_profile` instead. |

## Audit & limits

- **Rate limits**: ~60 req/min per MCP key.
- **Audit**: `agent_executions` with `agent='mcp'`.
- **PII**: `customer360` returns sensitive data — log queries carefully.

## Related

- `docs/agents/sales-claw-playbook.md` — handoff at deal-won
- `docs/agents/support-claw-playbook.md` — ticket coordination
- `mem://ecommerce/customer-management-architecture`
- `docs/modules/subscriptions.md`, `docs/modules/customer360.md`
