---
name: Split the developer module — Agent Access (prod) vs Dev Tools (internal)
description: The `developer` module is overloaded — it bundles MCP/agent-access (a production capability you enable to be operated by an MCP agent) with destructive dev/test tooling (reset_module_data, seed_demo, test runners). Enabling MCP operation drags in the dev tools. Target — split into two concerns. Deferred.
type: architecture
---

# Split `developer` into "Agent Access" (prod) and "Dev Tools" (internal)

## The problem
`developer` is a grab-bag bundling two unrelated concerns:

```
developer module (today):
├─ MCP / Agent Access  (PRODUCTION — wanted when an agent operates the instance)
│   ├─ API keys (ApiKeysPage)         ── mint the key an external MCP agent uses
│   ├─ MCP activity log (McpActivityPanel)
│   ├─ MCP skills panel (McpSkillsPanel)
│   └─ global_search (rpc:mcp_global_search)
└─ Dev / Test tooling  (INTERNAL — must NOT be on customer prod)
    ├─ reset_module_data   ⚠ destructive (wipes module data)
    ├─ seed_module_demo    ⚠ seeds demo data
    ├─ lint_skill
    └─ test pages: /admin/autonomy-tests, /admin/platform-tests
       (+ edge fns run-autonomy-tests, run-platform-tests)
```

**The catch:** to let an MCP agent operate your instance you must enable `developer`
(that's where API keys live) — which *also* surfaces `reset_module_data` (destructive),
demo seeding, and test runners. Being *operated* by an agent should not force exposing
"wipe my data" buttons.

## Target: two concerns
1. **Agent Access / MCP (production).** API keys, MCP log, MCP skills panel, global_search.
   This is the "MCP is the way forward" surface — a normal customer enables it to be
   agent-operated. Readily available, its own module/concept.
2. **Dev Tools (internal).** Test runners + reset/seed/lint. Off on customer prod; tighter
   gate (dev-mode / non-prod / super-admin) since parts are destructive.

## Why this resolves two earlier tensions at once
- **MCP onboarding** (`mem://federation/federation-page-transport-agnostic`): enabling Agent
  Access gives keys+log with NO test runners and NO reset button.
- **Test-fn deploy vs admin 404:** `run-{autonomy,platform}-tests` map to **Dev Tools** →
  off on customer prod → not deployed (−2 slots, incl. fixing `run-platform-tests` currently
  being CORE = on every site) AND their pages are hidden → no 404. Deploy-visibility and
  page-visibility move together.
- Shows the naive fixes were wrong: "devOnly = never deploy" breaks the always-routable admin
  test pages; "gate tests under `developer`" would still ship them to MCP-access sites (e.g.
  www has developer ON for MCP). Only the split is consistent.

## Decision (this session)
Record the target. **Do NOT touch test-fn deploy gating until the split exists** — otherwise
we break UX (404) or drag dev tools onto MCP sites. MCP-forward; Agent Access should be a
first-class production surface separate from Dev Tools.
