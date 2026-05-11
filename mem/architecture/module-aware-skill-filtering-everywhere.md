---
name: Module-Aware Skill Filtering Everywhere
description: SKILL_CATEGORY_MODULES + loadActiveModuleIds i _shared/mcp/groups.ts gäller för MCP, /chat, FlowPilot operate och heartbeat. Slå av modul → skills försvinner från LLM-tool-arrayen överallt.
type: feature
---

`SKILL_CATEGORY_MODULES` (kategori → owning module-ids) och `loadActiveModuleIds()` lever i `supabase/functions/_shared/mcp/groups.ts`. Båda används av:

- `mcp-server` → `/rest/groups` discovery + tool exposure
- `_shared/pilot/reason.ts → loadSkillsRaw()` → påverkar **alla** surfaces som anropar `loadSkillTools`: `chat-completion` (visitor `/chat`), `agent-operate` (FlowChat), `flowpilot-heartbeat` (autonomy)

Filter-regel: `isCategoryActive(skill.category, activeModules, SKILL_CATEGORY_MODULES)`. En kategori är aktiv om minst en av dess owning-moduler är på i `site_settings.modules`. Sentinel `__all__` = fail-open (settings saknas → exponera allt).

**Why:** Tidigare gällde modul-gating bara MCP. `/chat` skickade hela skill-listan till LLM oavsett modul-state, vilket skapade onödig prompt-bloat + UX-förvirring (skill-listan i `/admin/developer` markerade "modul av" men tools fanns ändå). Nu är beteendet konsistent.

**Två andra gates kvarstår per-skill:**
- `requires: [{type:'module',id:X}]` på enskild skill — explicit gate
- `settings.toolCallingEnabled` (chat-modulens master-switch) → 0 skills i `/chat`
- `settings.allowedSkillNames` allow-list — chat-only override

Ändras `SKILL_CATEGORY_MODULES`-mappen → uppdatera samtidigt `mcp-regression`-CI-grep och `docs/architecture/mcp-as-platform.md`.
