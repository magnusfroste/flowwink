

# MCP Server for FlowWink Modules

## Summary

Expose FlowWink's module registry as an MCP (Model Context Protocol) server via a single Edge Function. Any external AI client (Cursor, Claude Desktop, custom agents) can connect and use FlowWink modules as tools — completing the three-channel architecture: **Skills** (internal), **A2A** (peer), **MCP** (universal).

## Architecture

```text
External AI Client (Cursor, Claude Desktop, etc.)
        │
        ▼  HTTP Streamable Transport
┌───────────────────────────────┐
│  mcp-server Edge Function     │
│  (Hono + mcp-lite)            │
│                               │
│  ┌─ API Key auth ────────┐    │
│  │  api_keys table check │    │
│  └───────────────────────┘    │
│                               │
│  ┌─ Tool Registry ───────┐    │
│  │  agent_skills WHERE   │    │
│  │  mcp_exposed = true   │    │
│  │  → MCP tool defs      │    │
│  └───────────────────────┘    │
│                               │
│  ┌─ Execution ───────────┐    │
│  │  Route to             │    │
│  │  agent-execute logic  │    │
│  └───────────────────────┘    │
└───────────────────────────────┘
```

## Implementation Steps

### 1. Database: API Keys table + mcp_exposed flag

**Migration** adding:
- `api_keys` table — `id`, `name`, `key_hash` (SHA-256), `key_prefix` (first 8 chars for display), `scopes` (text[]), `created_by`, `last_used_at`, `expires_at`, `created_at`
- `mcp_exposed boolean DEFAULT false` column on `agent_skills`
- RLS: only admins can manage API keys
- Set `mcp_exposed = true` on a curated default set (~20 safe skills: blog CRUD, CRM reads, stock checks, page management, KB search)

### 2. Edge Function: `mcp-server`

Single file using **Hono + mcp-lite** (npm:mcp-lite@^0.10.0):

- **Auth**: Extract `Authorization: Bearer <api_key>` → hash → lookup in `api_keys` → reject if missing/expired
- **Tool discovery**: Query `agent_skills WHERE mcp_exposed = true`, map `tool_definition` JSON to MCP tool schemas
- **Tool execution**: On tool call → invoke `agent-execute` internally (service role, same Supabase instance) with `agent_type: 'mcp'`
- **Resources**: Expose a `flowwink://modules` resource listing all enabled modules

Config in `config.toml`: `[functions.mcp-server] verify_jwt = false`

### 3. Admin UI: API Keys management

New page `/admin/developer/api-keys`:
- Generate new API key (shown once, stored as hash)
- List keys with prefix, name, scopes, last used, expiry
- Revoke keys
- Link from existing Developer module page

### 4. Admin UI: MCP exposure toggle

On the Skills admin page, add a small MCP toggle icon per skill (shield icon) that flips `mcp_exposed`. Bulk toggle via category.

### 5. Module config: `mcpExposed` default

In `useModules.tsx`, add `mcpExposed?: boolean` to `ModuleConfig`. When a module is toggled off, its skills are also hidden from MCP.

### 6. Documentation

- Update `docs/PRD.md` v4.4 — add MCP Server section documenting the three-channel model
- Update `docs/FLOWPILOT.md` — add MCP channel alongside Skills + A2A
- Add connection instructions for Cursor / Claude Desktop in PRD

## Files Changed/Created

| File | Action |
|------|--------|
| `supabase/migrations/..._mcp_server.sql` | Create `api_keys` table, add `mcp_exposed` to `agent_skills` |
| `supabase/functions/mcp-server/index.ts` | New — Hono + mcp-lite MCP server |
| `supabase/config.toml` | Add `[functions.mcp-server]` block |
| `src/pages/admin/ApiKeysPage.tsx` | New — API key management UI |
| `src/hooks/useApiKeys.ts` | New — CRUD hooks for api_keys |
| `src/hooks/useModules.tsx` | Add `mcpExposed` to ModuleConfig |
| `src/components/admin/adminNavigation.ts` | Add API Keys nav entry under Developer |
| `src/App.tsx` | Add route for ApiKeysPage |
| `docs/PRD.md` | v4.4 — MCP Server + three-channel architecture |

## Security Model

- API keys are hashed (SHA-256) — raw key shown only at creation
- Keys have optional scopes (limit to specific skill categories)
- Keys have optional expiry dates
- `mcp_exposed` acts as a second gate — even with a valid key, only explicitly exposed skills are callable
- Module-level gating: disabled modules hide their skills from MCP
- Rate limiting via Supabase Edge Function defaults (can be extended later)

## What This Enables

External AI clients can `manage_blog_post`, `check_stock`, `search_kb`, `create_lead` — treating FlowWink as a headless business operations API. Combined with A2A (peer agents like OpenClaw) and internal Skills (FlowPilot), this creates a fully composable, mix-and-match platform.

