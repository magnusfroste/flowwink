---
title: MCP — Getting Started
description: Connect Claude Desktop, OpenClaw, Cursor or any MCP client to FlowWink in 5 minutes.
---

# MCP — Getting Started

FlowWink exposes every enabled module as **MCP skills** on a platform-level endpoint. Any MCP-compatible client (Claude Desktop, OpenClaw, Cursor, custom orchestrators) can discover the catalog, call skills, and read aggregated context — without touching FlowPilot.

See [`../architecture/mcp-as-platform.md`](../architecture/mcp-as-platform.md) for the architectural law that makes this safe.

---

## 1. Get an MCP API key

1. Log in to your FlowWink instance as an admin
2. Go to `/admin/developer` → **MCP Keys**
3. Click **New key**, give it a name (e.g. `claude-desktop`), copy the token (`fwk_...`)

Treat this token like a password. It scopes the agent to your single-tenant site.

---

## 2. Know your endpoints

| Surface | URL |
|---|---|
| MCP Streamable HTTP | `https://<your-site>/functions/v1/mcp-server` |
| REST tool catalog | `GET /functions/v1/mcp-server/rest/tools` |
| REST execute | `POST /functions/v1/mcp-server/rest/execute` |
| Aggregated briefing | `GET /functions/v1/mcp-server/rest/resources/briefing` |
| Group discovery | `GET /functions/v1/mcp-server/rest/groups` |

All authenticated with `Authorization: Bearer fwk_...`.

---

## 3. Filter by group (avoid tool bloat)

Most MCP clients have a tool-budget. Don't ship all 110+ skills — pull only the toolkit the agent needs:

```bash
curl -H "Authorization: Bearer fwk_..." \
  "https://<your-site>/functions/v1/mcp-server/rest/tools?groups=marketing,sales"
```

Built-in groups: `marketing`, `sales`, `operations`, `support`, `finance`, `content`. See [`../architecture/mcp-toolset-groups-and-tool-bloat-strategy`](../architecture/mcp-as-platform.md) for the rationale.

---

## 4. Connect a client

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "flowwink": {
      "url": "https://<your-site>/functions/v1/mcp-server",
      "headers": { "Authorization": "Bearer fwk_..." }
    }
  }
}
```

Restart Claude Desktop. The FlowWink tools appear in the tool picker.

### OpenClaw / custom MCP client

Point your transport at the URL above with the same `Authorization` header. The server speaks MCP Streamable HTTP — make sure your client sends:

```
Accept: application/json, text/event-stream
Content-Type: application/json
```

(Servers built on the official MCP SDK reject requests without this with HTTP 406.)

### REST-only orchestrators

If your agent doesn't speak MCP natively, use the REST mirror:

```bash
# List tools
curl -H "Authorization: Bearer fwk_..." \
  https://<your-site>/functions/v1/mcp-server/rest/tools?groups=sales

# Execute a tool
curl -X POST -H "Authorization: Bearer fwk_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"manage_leads","arguments":{"action":"list","status":"lead"}}' \
  https://<your-site>/functions/v1/mcp-server/rest/execute
```

---

## 5. One-call situational awareness

Instead of polling 8 resources, fetch a parallel-aggregated briefing in ~50ms:

```bash
curl -H "Authorization: Bearer fwk_..." \
  https://<your-site>/functions/v1/mcp-server/rest/resources/briefing
```

Returns identity, health counts, active objectives, recent activity, enabled modules, automations and heartbeat in a single payload. See [`resource-briefing.md`](./resource-briefing.md).

---

## 6. Department-claw playbooks

For ready-made agent personas (marketing growth, sales prospecting, finance reconciliation, support triage), see [`../agents/`](../agents/README.md). Each playbook tells an external agent which groups to pull and which skills to combine.

---

## What you can and cannot do over MCP

| Can | Cannot |
|---|---|
| Call any enabled module skill | Modify FlowPilot's own objectives / soul / heartbeat |
| Read aggregated briefing + per-resource data | Bypass RLS — your API key is scoped to your site |
| Create leads, orders, content, tasks, journal entries | Touch operator-internal `agent` category skills |
| Run staged operations with human approval | Disable modules (admin UI only) |

Skills marked `requires_staging=true` (most accounting writes) return a staged envelope; call `approve_pending_operation` to commit. See [`../accounting/staged-operations-envelope.md`](../architecture/mcp-as-platform.md).

---

## Troubleshooting

- **401** — missing or expired `Authorization: Bearer fwk_...`
- **403** — skill exists but isn't `mcp_exposed`, or module is disabled. Check `/admin/developer → MCP Skills`.
- **406** — your client isn't sending `Accept: application/json, text/event-stream`
- **Empty tool list** — no modules enabled, or your `?groups=` filter matched nothing. Try `GET /rest/groups` to see available groups.

---

*Next: [`../agents/marketing-claw-playbook.md`](../agents/marketing-claw-playbook.md) · [`resource-briefing.md`](./resource-briefing.md) · [`../reference/skills-source.md`](../reference/skills-source.md)*
