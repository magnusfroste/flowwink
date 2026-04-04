# FlowPilot Skills — Source of Truth

## Where Skills Are Defined

All **bundled skills** (shipped with every installation) are defined in:

```
supabase/functions/setup-flowpilot/index.ts → DEFAULT_SKILLS[]
```

This is the **single source of truth** for the skill registry. When `setup-flowpilot` runs (first boot or "Sync Missing Skills"), it seeds these into the `agent_skills` database table.

## How It Works

```
setup-flowpilot/index.ts     →  agent_skills table     →  agent-execute (runtime)
    (106 bundled skills)          (DB, hot-reloadable)       (handler routing)
```

1. **Bootstrap**: `setup-flowpilot` inserts all `DEFAULT_SKILLS` into `agent_skills` (upsert)
2. **Runtime**: FlowPilot can create additional skills via `skill_create` (stored in DB only)
3. **Re-sync**: Admin → Skills → "Sync Missing Skills" re-seeds from source without overwriting runtime changes

## Skill Anatomy

Each skill has:
- **`name`** — unique identifier (e.g., `manage_page`)
- **`handler`** — routing prefix: `edge:`, `module:`, `db:`, `webhook:`, `a2a:`
- **`scope`** — `internal` (admin), `external` (visitor), `both`
- **`category`** — content, crm, communication, automation, search, analytics, system, commerce, growth
- **`description`** — includes `Use when:` and `NOT for:` routing markers (OpenClaw standard)
- **`tool_definition`** — OpenAI function-calling JSON schema
- **`instructions`** — rich knowledge for the skill (optional)

## Current Counts (106 skills, 9 categories)

| Category | Count |
|----------|-------|
| Content | 27 |
| CRM | 27 |
| Communication | 11 |
| Analytics | 9 |
| Commerce | 7 |
| System | 12 |
| Growth | 5 |
| Automation | 4 |
| Search | 4 |

## Built-in Tools (32 tools)

In addition to the 106 DB-driven skills, `agent-reason.ts` provides 32 hardcoded built-in tools (memory, objectives, self-mod, reflect, soul, planning, workflows, delegation, skill-packs, automations). These are NOT in the `agent_skills` table.

## Full Skill Reference

See [`docs/FLOWPILOT.md` § 5](./FLOWPILOT.md#5-complete-skill-inventory) for the complete verified inventory.
