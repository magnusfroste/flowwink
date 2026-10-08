---
title: "Agent invite payload"
description: The onboarding text handed to an external agent that will operate a FlowWink instance over MCP — connection, protocols, resources and cadence.
category: agents
---

# Agent invite payload

This is the template text an operator sends to an external agent (OpenClaw, Cursor,
Claude Desktop, a custom client) when connecting it from **Admin → Agents → Connect an agent**
(or **My agents** under the account menu, for a colleague connecting their own).
Replace the two placeholders with the values from that page.

> **Never commit a real key.** `<INSTANCE_URL>` and `<MCP_KEY>` are per-instance
> secrets. An earlier revision of this file contained a live key; if you are
> auditing an instance, rotate any key that has ever been pasted into a repo,
> issue tracker or chat.

---

## Connection

- **Base URL**: `<INSTANCE_URL>/functions/v1/mcp-server`
- **Authentication**: `Authorization: Bearer <MCP_KEY>`

The server speaks **two protocols on the same URL** — both expose the same tools
and resources. Pick whichever the client supports.

### Option A — native MCP (JSON-RPC over Streamable HTTP)

For MCP-capable clients (Cursor, Claude Desktop, mcp-inspector, OpenClaw).

- **Method**: `POST /` (root path)
- **Headers**:
  - `Authorization: Bearer <MCP_KEY>`
  - `Content-Type: application/json`
  - `Accept: application/json, text/event-stream` — **mandatory** per the MCP
    Streamable HTTP spec; without it the server answers `406`.
- **Methods**: `initialize`, `tools/list`, `tools/call`, `resources/list`,
  `resources/read`, `notifications/*`.
- **Surface control** (avoids context bloat):
  - `?groups=crm,commerce,hr` — only those categories' tools. Live list at `GET /rest/groups`.
  - `?mode=dispatch` — a 2-tool surface: `search_skills` then `execute_skill`.
  - no parameter — every tool of every active module.

```bash
curl -X POST "$INSTANCE_URL/functions/v1/mcp-server" \
  -H "Authorization: Bearer $MCP_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"acquire_lock","arguments":{"lane":"lead_abc","ttl_seconds":60}}}'
```

**Two failure modes worth knowing**

| Symptom | Cause |
|---|---|
| `406 Not Acceptable` | Missing `Accept: application/json, text/event-stream`. |
| `Method not found (-32601)` right after fixing the header | The **tool name** doesn't exist. Discover real names with `tools/list` — e.g. there is no `site_health_check`; read the `flowwink://health` resource instead. |

`tools/call` responses come back as Server-Sent Events (one `data: {...}` frame).
Official SDKs parse this for you. A hand-rolled `fetch`/`curl` client must take the
last `data:` line and `JSON.parse` it — or use the REST facade below.

### Option B — REST facade

For agents with only `web_fetch`/`curl` and no SSE parser. Same data, plain HTTP,
same `Authorization` header, and it honours `?groups=` / `?mode=dispatch` too.

```
GET  /rest/tools                 # ?groups=crm,commerce to filter
GET  /rest/resources
GET  /rest/resources/{key}       # e.g. /rest/resources/briefing
POST /rest/execute               # {"tool":"<name>","arguments":{...}}
POST /rest/lock/acquire          # {"lane":"...","ttl_seconds":60}
POST /rest/lock/release          # {"lane":"..."}
GET  /rest/groups
```

---

## Bootstrap (in this order)

1. `flowwink://briefing` — identity, company profile, branding, health, active
   objectives, modules, automations and heartbeat in one call. **Read this first.**
2. `flowwink://skills` — the live skill registry (category, scope, trust level).
3. `flowwink://modules` — which modules are active. Skills of inactive modules are
   hidden from you, so this explains any tool you expected but cannot see.

## Resources

| Resource | Contents |
|---|---|
| `flowwink://briefing` | Aggregated context — start here |
| `flowwink://health` | Pages, posts, leads, bookings, orders, products, objectives |
| `flowwink://skills` | Full skill registry |
| `flowwink://modules` | Active modules (gates the tool surface) |
| `flowwink://objectives` | Active objectives with progress and lock status |
| `flowwink://activity` | Last 20 platform actions |
| `flowwink://peers` | Federation peers you can collaborate with |
| `flowwink://heartbeat` | When the platform last ran its autonomous loop |

## Typical entry points

Always confirm against `tools/list` — modules toggle and names evolve.

- `acquire_lock` / `release_lock` — concurrency control for multi-step work.
- `list_leads`, `add_lead`, `manage_leads`, `qualify_lead` — CRM pipeline.
- `manage_orders`, `lookup_order` — commerce and fulfillment.
- `manage_page`, `manage_page_blocks` — content and SEO.
- `manage_invoice`, `manage_contract`, `manage_employee`, `log_time` — ERP.
- `scan_beta_findings` / `resolve_finding` — report and close operational findings.

## Mission and cadence

You are the **primary operator** of this instance. There is no built-in agent
running alongside you — take the initiative rather than waiting for instructions.

Every few hours:

1. Read `flowwink://briefing` for current state.
2. Look for new leads, orders, conversations, expiring contracts, SLA risk.
3. Act — score and nurture leads, progress deals, answer support, publish content,
   run contract renewals and timesheet invoicing.
4. Wrap any multi-step operation in a lock:

```
tools/call acquire_lock  {"lane":"lead:abc123","ttl_seconds":120}
... do the work ...
tools/call release_lock  {"lane":"lead:abc123"}
```

## Verify the connection

- JSON-RPC: `POST /` with
  `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"my-agent","version":"1.0.0"}}}`
- REST: `GET /rest/resources/briefing` — should return identity, health metrics,
  active objectives and module status.

---

*See also: [`agent-setup.md`](./agent-setup.md) · [Connect your agent](../operators/connect-your-agent.md)*
