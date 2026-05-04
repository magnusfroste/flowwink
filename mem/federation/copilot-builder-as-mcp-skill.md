---
name: copilot-builder-as-mcp-skill
description: Admin Copilot site-builder loop (copilot-action) is exposed as MCP skill `build_site_step` so external claws drive the same loop the admin UI uses
type: feature
---

# Copilot Builder as First-Class MCP Skill

`copilot-action` powers the admin `/admin/copilot` site-builder UI (block-by-block
migration & site generation with `create_block` / `migrate_url` / `update_footer` /
`activate_modules` tool calls). It is now ALSO exposed as the MCP skill
`build_site_step` (handler `edge:copilot-action`, scope `both`, mcp_exposed=true,
category `content`, owned by `pages` module).

**One implementation, two consumers:**
- Internal: `useCopilot.ts` → `supabase.functions.invoke('copilot-action', …)`
- External: any MCP client → `build_site_step` tool

The skill is stateless — caller owns conversation history. Loop:
1. POST `messages: [{role, content}], currentModules?, migrationState?`
2. Receive `{ message, toolCall? }`
3. Apply toolCall (caller's responsibility — for external claws this typically
   means chaining to `migrate_url`, `create_page_block`, `manage_global_blocks`).
4. Append result as next user message; repeat until no toolCall.

Registered in `src/lib/modules/pages-module.ts` skillSeeds + `agent_skills` row
seeded via migration `20260504185230_*`.
