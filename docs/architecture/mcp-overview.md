---
title: "MCP — Model Context Protocol surface"
status: "core architecture"
last_updated: "2026-05-02"
---

# MCP Overview

FlowWink exposes a full **Model Context Protocol** surface so any external
agent (OpenClaw, ClawWink, Claude Desktop, custom GPT actions, etc.) can
operate the platform end-to-end. MCP is **platform-level**, not a FlowPilot
feature — see [`mcp-as-platform.md`](./mcp-as-platform.md) for the
architectural rationale.

This document is the operational reference: endpoints, auth, schema rules,
discovery, and the best practices we apply.

## Endpoint

```
POST  /functions/v1/mcp-server/         ← native MCP (JSON-RPC over POST, streamable HTTP)
GET   /functions/v1/mcp-server/rest/groups        ← discovery: catalog + live state
GET   /functions/v1/mcp-server/rest/tools         ← list tools (REST shortcut)
GET   /functions/v1/mcp-server/rest/resources     ← list resources
GET   /functions/v1/mcp-server/rest/resources/:k  ← fetch one resource
POST  /functions/v1/mcp-server/rest/execute       ← run a tool by name (REST shortcut)
POST  /functions/v1/mcp-server/rest/lock/acquire  ← advisory lock
POST  /functions/v1/mcp-server/rest/lock/release  ← release advisory lock
```

Native MCP and REST share the same auth, the same skill catalog, and the
same execution path (`agent-execute`).

## Auth

Two header formats accepted:

```
Authorization: Bearer fwk_<key>
x-api-key:     fwk_<key>             # OpenAI MCP-action format
```

Keys live in `api_keys` (hash + prefix). Auth middleware looks up the key,
attaches `caller_user_id` and `caller_api_key_id` to the request context,
and forwards both to `agent-execute` so every action is attributable.

Federation peers automatically receive a `fwk_*` key on registration —
see [federation/automated-mcp-callback-injection](../../mem/federation/).

## Tool catalog

- **187 tools** exposed today (May 2026), seeded by module manifests
  (`src/lib/modules/*-module.ts → skillSeeds`) into the `agent_skills` table.
- Activating a module flips `mcp_exposed=true` on its skills **regardless of
  FlowPilot's enabled state**. Disabling a module hides its skills from the
  catalog within ~5 minutes (handler cache TTL).
- Operator-internal skills (`a2a_*`, `dispatch_claw_mission`, `openclaw_*`)
  stay `mcp_exposed=false` deliberately — they are FlowPilot's own peer-comms
  primitives, not capabilities for external callers.
- Utility skills (`migrate_url`, `scrape_url`, `search_web`,
  `extract_pdf_text`) are ALWAYS exposed so external operators can run
  end-to-end flows (e.g. site migration) without FlowPilot.

Invariants enforced by guardrail tests in
`src/lib/__tests__/mcp-exposure-invariants.guardrails.test.ts`.

## Tool-bloat strategy: `?groups=` filtering

OpenAI `gpt-4.1` caps tool-calling at **128 tools per request**. With 187
exposed skills we exceed that — clients control their own context budget by
asking for a subset.

```
GET  /mcp-server/?groups=crm,commerce
POST /mcp-server/rest/execute?groups=marketing
```

Three group kinds:

| Kind | Examples | Resolves to |
|---|---|---|
| **Category** | `crm`, `commerce`, `content`, `automation`, `analytics`, `system`, `growth`, `search`, `agent` | The skill category itself. |
| **Module** | `leads`, `accounting`, `purchasing`, `bookings`, `pages` | The category of that module. |
| **Composite** | `marketing`, `sales`, `operations` | A bundle of categories suited to a department-level claw. |

Discovery endpoint `GET /rest/groups` returns the live catalog with
`tool_count` per group and which modules are active right now. Use this
before opening an MCP session so the claw knows what's available.

## Schema rules — **OpenAI-safe flat schemas**

OpenAI strict tool-calling **rejects the entire `tools` array (HTTP 400)**
if any tool's `inputSchema` has `allOf` / `oneOf` / `anyOf` / `not` /
`if` / `then` / `else` at the **top level**.

**Our rule (enforced by guardrail test
`skill-schema-not-null-coverage.guardrails.test.ts`):**

> Every skill schema must be a flat JSON Schema object. Per-action required
> fields are expressed via the `x-action-required` extension instead of
> conditional schema branches.

```ts
parameters: {
  type: 'object',
  properties: { action: { enum: ['create','update','delete'] }, name: {...} },
  required: ['action'],
  'x-action-required': {
    create: ['name', 'category'],
    update: ['id'],
  },
}
```

Special case: `import_bank_image` uses `x-mode-required` because its
discriminator is `commit:boolean`, not an action enum.

**Defensive net:** `?openai_safe=true` runs `flattenSchemaForOpenAI()` at
runtime. It is currently a no-op for bundled skills (all already flat) but
protects against future regressions and externally-registered skills.

See [`mem/architecture/openai-safe-mcp-schema-flattening.md`](../../mem/architecture/openai-safe-mcp-schema-flattening.md)
for the full migration history.

## Resources

`flowwink://briefing` is the **single most important MCP resource**. It
aggregates identity (soul), `company_profile`, `branding`, health metrics,
active objectives, recent activity, modules, automations, heartbeat status,
and skill count into one ~50ms call. **Always fetch it first** — fetching
the same data via individual resources costs ~500ms+.

Other resources: `health`, `skills`, `modules`, `activity`, `peers`,
`identity`, `templates`, `objectives`, `automations`, `heartbeat`, plus
templated `templates/:id`.

## Locks

`acquire_lock` / `release_lock` (and matching REST endpoints) use the
`try_acquire_agent_lock` / `release_agent_lock` Postgres functions to give
concurrent agents advisory exclusivity on a "lane" (`lead_abc123`,
`page_xyz`, etc.). TTL defaults to 60s, max 300s. Acquire returns 409 on
contention so clients can back off.

## Best practices we apply (Anthropic Sept 2025 guidance)

Source: [Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
and [Tool Calling Schema Standards](http://agentpatterns.ai/standards/tool-calling-schema-standards/).

| Principle | How we apply it |
|---|---|
| **Few high-impact tools, not API mirrors** | Composite skills (`hire_application`, `place_order`, `record_pos_sale_v2`) collapse multi-table workflows into one call. Generic CRUD is gated by `DEDICATED_SKILL_TABLES`. |
| **Namespace tools** | We prefix by **action verb** (`manage_*`, `list_*`, `create_*`, `book_*`) and **group by category**. Description is rendered as `[category] description` in MCP. |
| **Self-describing** | 187/187 exposed skills carry `Use when:` and `NOT for:` markers (FlowPilot Law 2 — enforced for new skills via the skill-linter). |
| **Return high-signal context** | Skills return business-meaningful fields (`title`, `status`, `total`) rather than raw UUIDs where possible. Tool errors include `hint` strings. |
| **Token-efficient responses** | List skills cap at sane defaults (50–100 rows). `flowwink://briefing` consolidates ~10 calls into 1. |
| **Strict input validation** | `x-action-required` + handler-side NOT NULL validation in `agent-execute`. Skill-linter (`bun run lint:skills`) verifies arg-mapping, NOT NULL coverage, value-domain, and module registration before release. |
| **Aliases for natural-language tolerance** | `TABLE_ALIASES`, `COLUMN_ALIASES`, `ACTION_ALIASES` in `agent-execute` accept `list_pending`, `customers→profiles`, etc. |

**Gaps we're aware of (not yet implemented):**
- `response_format: "concise"|"detailed"` enum on list-skills (Anthropic
  recommends this for token-pinching). Tracked as a future enhancement.
- Per-tool token budget metric in MCP activity log.

## Caching & invalidation

- `mcpHandlerCache` keeps the assembled `McpServer` instance per group key
  for **5 minutes**. After a skill toggle in `/admin/developer` external
  clients may see a stale tools list for up to 5 min.
- `loadActiveModules()` / `loadExposedSkills()` are NOT cached at the data
  layer — every cache MISS reads fresh.
- To force-refresh: redeploy the function or wait out the TTL.

## Observability

- Every external call logs to `activity` (resource `flowwink://activity`).
- MCP-specific calls are tagged `agent='mcp'` in `agent_actions`.
- Inbound peers auto-registered into `federation_connections` on first call
  (see `upsertInboundMcpPeer`).
- `cloud_status` is the right tool when an MCP call mysteriously fails.

## Testing

```bash
# Verify catalog integrity
bunx vitest run src/lib/__tests__/mcp-exposure-invariants.guardrails.test.ts
bunx vitest run src/lib/__tests__/mcp-contract.guardrails.test.ts
bunx vitest run src/lib/__tests__/skill-schema-not-null-coverage.guardrails.test.ts

# Lint a single skill (or all)
bun run lint:skill manage_journal_entry
bun run lint:skills

# End-to-end MCP regression
bunx tsx scripts/mcp-regression.ts
```

## See also

- [`mcp-as-platform.md`](./mcp-as-platform.md) — why MCP is decoupled from FlowPilot
- [`docs/mcp/resource-briefing.md`](../mcp/resource-briefing.md) — briefing resource detail
- [`mem/architecture/openai-safe-mcp-schema-flattening.md`](../../mem/architecture/openai-safe-mcp-schema-flattening.md) — schema-flattening history
- [`mem/architecture/mcp-toolset-groups-and-tool-bloat-strategy.md`](../../mem/architecture/) — `?groups=` design
- [`mem/architecture/agent-contract-integrity.md`](../../mem/architecture/agent-contract-integrity.md) — 4-layer skill contract
- [`mem/federation/marketing-claw-department-pattern.md`](../../mem/federation/marketing-claw-department-pattern.md) — composite-group case study
