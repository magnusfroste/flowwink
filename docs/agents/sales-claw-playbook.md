---
title: "Sales Department — External Claw Playbook"
audience: "external operators (OpenClaw, ClawThree, Claude Desktop, custom MCP claws)"
last_updated: "2026-05-04"
---

# Sales Department Playbook

This playbook lets an **external claw** act as FlowWink's sales department —
running prospecting, qualification, deal management, and quote-to-contract
**without FlowPilot involvement**.

> One claw per department per site is the recommended pattern.
> This playbook is the contract for "sales".

## Connect

```http
POST https://<your-flowwink>.lovable.app/functions/v1/mcp-server
Authorization: Bearer <MCP_API_KEY>
```

Get a key from `/admin/developer → MCP Keys`.

## Pull only the sales toolkit

```http
GET /rest/tools?groups=sales
```

`sales` expands to:

| Category | What you get | Example skills |
|----------|--------------|----------------|
| `crm` | Leads, deals, companies, contacts | `manage_leads`, `manage_deals`, `manage_companies`, `manage_contacts` |
| `commerce` | Quotes, contracts, orders | `manage_quote`, `manage_contract`, `manage_order` |
| `search` | Prospect research | `search_web`, `scrape_url`, `competitor_monitor` |
| `analytics` | Pipeline metrics | `analytics_query` |
| `automation` | Platform utilities | `extract_pdf_text`, `process_signal`, `upload_document` |

## End-to-end pipeline loop

A complete sales motion — prospect → qualify → propose → close — uses only
MCP-exposed skills. **No FlowPilot calls.**

### 1. Prospect

```jsonc
// Find target accounts on the web
{"tool":"search_web","arguments":{"query":"Nordic SaaS companies 50-200 employees hiring CFO","limit":10}}
{"tool":"scrape_url","arguments":{"url":"https://target.com/about"}}

// Create the lead in CRM
{"tool":"manage_leads","arguments":{
  "action":"create",
  "name":"Anna Berg",
  "email":"anna@target.com",
  "company":"Target AB",
  "source":"outbound",
  "status":"lead"
}}
```

### 2. Enrich the company

```jsonc
{"tool":"manage_companies","arguments":{
  "action":"create",
  "name":"Target AB",
  "domain":"target.com",
  "industry":"SaaS",
  "size":"50-200"
}}
// Optional: trigger Firecrawl enrichment
{"tool":"competitor_monitor","arguments":{"domain":"target.com"}}
```

### 3. Qualify → opportunity

```jsonc
// Promote lead when BANT/MEDDIC criteria met
{"tool":"manage_leads","arguments":{
  "action":"update",
  "id":"<lead_id>",
  "status":"opportunity"   // alias: "qualified"
}}

// Create deal
{"tool":"manage_deals","arguments":{
  "action":"create",
  "name":"Target AB — Annual Plan",
  "amount":120000,
  "currency":"SEK",
  "stage":"qualified",
  "close_date":"2026-06-30",
  "company_id":"<company_id>",
  "lead_id":"<lead_id>"
}}
```

### 4. Quote

```jsonc
{"tool":"manage_quote","arguments":{
  "action":"create",
  "deal_id":"<deal_id>",
  "valid_until":"2026-05-31",
  "lines":[
    {"product_id":"<id>","quantity":1,"unit_price_cents":1200000}
  ]
}}
// → returns quote_id, total, PDF url
```

### 5. Contract on win

```jsonc
{"tool":"manage_deals","arguments":{
  "action":"update",
  "id":"<deal_id>",
  "stage":"won"            // alias: "customer"
}}

{"tool":"manage_contract","arguments":{
  "action":"create",
  "name":"Target AB — MSA 2026",
  "company_id":"<company_id>",
  "start_date":"2026-06-01",
  "end_date":"2027-05-31",
  "value":120000,
  "currency":"SEK",
  "renewal_type":"auto"
}}
```

### 6. Report back

Weekly digest from `analytics_query` over `deals` / `leads`:

```jsonc
{"tool":"analytics_query","arguments":{
  "metric":"pipeline_value",
  "group_by":"stage",
  "period":"week"
}}
```

Synthesize and post as `manage_kb_article` or via `agent_events`.

## Status aliases

`manage_leads` and `manage_deals` accept natural status names — the platform
normalizes them to the underlying enum:

| You can say | DB enum |
|-------------|---------|
| `new`, `lead` | `lead` |
| `qualified`, `opportunity` | `opportunity` |
| `won`, `customer` | `customer` |
| `disqualified`, `lost` | `lost` |
| `all` | (no filter) |

See `mem://crm/manage-leads-status-alias-mapping`.

## What's NOT exposed

| Skill | Why hidden |
|-------|------------|
| `a2a_*`, `dispatch_claw_mission`, `openclaw_*` | FlowPilot's own peer-comms — you ARE the peer. |
| `setup_flowpilot`, agent objectives | Cognition layer — bring your own brain. |

## Approval gating

Most sales skills are `trust_level='notify'` — they execute immediately.
Watch for:

| Skill | trust_level | Why |
|-------|-------------|-----|
| `manage_leads` / `manage_deals` | `notify` | CRUD on your own pipeline. |
| `manage_quote` | `notify` | Drafts only — sending requires explicit `status='sent'`. |
| `manage_contract` | `notify` | Drafts. Activation may be gated per-site. |
| `manage_order` (large amount) | may be `approve` | Site-specific policy. |

If a call returns HTTP 202 `pending_approval`, an admin must approve in
`/admin/developer → Activity` before the action commits.

## Audit & limits

- **Rate limits**: ~60 req/min per MCP key.
- **Audit**: Every call logged in `agent_executions` with `agent='mcp'`.
- **Multi-tenancy**: One sales claw per site.

## Related

- `docs/agents/marketing-claw-playbook.md` — sister department
- `mem://crm/sales-intelligence-and-lead-loop-unified` — scoring & enrichment
- `mem://crm/manage-leads-status-alias-mapping` — status normalization
- `docs/modules/leads.md`, `docs/modules/deals.md`, `docs/modules/quotes.md`
