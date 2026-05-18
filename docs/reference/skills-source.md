# Skills — Source of Truth

Skills are the callable surface that any operator (FlowPilot, OpenClaw, Claude Desktop, custom MCP client) uses to act on FlowWink.

## Where they're defined

Each module declares its skills in `skillSeeds` on its `defineModule()` manifest:

```
src/lib/modules/<module>-module.ts → skillSeeds: SkillSeed[]
```

When a module is **enabled**, the bootstrap seeds those rows into `public.agent_skills` with `mcp_exposed=true` (unless the module marks them operator-internal). The database table is the runtime registry — hot-reloadable, RLS-protected, and the single thing `agent-execute` and the MCP server read.

## How an operator discovers them

| Surface | How |
|---|---|
| In-app admin | `/admin/developer` → **Skills** tab — full catalog with descriptions, schemas, gating |
| MCP (external agents) | `GET /functions/v1/mcp-server/rest/tools[?groups=marketing|sales|…]` — module-filtered, group-filtered |
| Per-module reference | Every page in [`../modules/`](../modules/) lists that module's skills with handler + scope |
| Live count | `select count(*) from agent_skills where enabled and mcp_exposed` |

## Adding a skill

1. Add a `SkillSeed` to the module's `skillSeeds` array.
2. Pass [`Agent Contract Integrity`](../architecture/agent-contract-integrity.md) — every NOT NULL DB column the action writes must be in the JSON schema (`bun run lint:skills`).
3. Write `description` with explicit `Use when:` and `NOT for:` markers (Law 2 — skills are self-describing).
4. Disable & re-enable the module, or run the "Sync Skills" action in `/admin/developer`.

## Built-in tools

`agent-reason` provides a small set of hardcoded operator-internal tools (memory ops, objective planning, reflection, soul, skill-pack management, delegation). These are FlowPilot-only and are **not** stored in `agent_skills` — they are the operator's own brain primitives, not platform capabilities.

---

*See also: [Module API](./module-api.md) · [MCP as Platform](../architecture/mcp-as-platform.md) · [Agent Contract Integrity](../architecture/agent-contract-integrity.md)*
