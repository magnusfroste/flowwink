---
name: new-module-checklist
description: Mandatory checklist for creating a new module — manifest, MCP exposure, navigation, feature flag, docs, memory entry
type: preference
---

# New Module Checklist

Every new module MUST go through this list before merge. Missing items =
PR-block. Use `bun run new:module <id>` to scaffold the boilerplate.

## 1. Manifest (single source of truth)
- [ ] Created `src/lib/modules/<id>-module.ts` using `defineModule(...)`.
- [ ] `id` matches a key in `ModulesSettings` (added if new).
- [ ] `name`, `description`, `capabilities`, `version` all set.
- [ ] Imported from `src/lib/modules/index.ts` (otherwise it never registers).

## 2. Skills + MCP
- [ ] Each skill has `description` containing **`Use when:`** and **`NOT for:`** markers (Law 2).
- [ ] `tool_definition` schema is FLAT — no `allOf`/`if-then` (OpenAI strict mode).
- [ ] `mcp_exposed: true` for every business skill (default; only operator-internal skills opt out — see `mem://architecture/mcp-exposure-invariants`).
- [ ] `category` is set so MCP `?groups=<dept>` filtering works.
- [ ] `bun run lint:skills` passes (Agent Contract Integrity).

## 2b. Events (producer + consumer)
- [ ] If the module emits any platform event, declared in `agent.emits[]` (or legacy `webhookEvents[]`).
- [ ] If the module **reacts to** events (automations, triggers, fan-outs), declared in `agent.listens[]`. Empty array is fine if the module is pure producer.
- [ ] **When touching an existing module:** if it consumes events that weren't declared yet, backfill `agent.listens[]` now — this is how `/admin/event-bus` graph data accumulates organically.

## 3. UI / navigation (only if module ships UI)
- [ ] Admin route registered + `useIsModuleEnabled(<id>)` gate.
- [ ] Sidebar entry added.
- [ ] Settings tab uses the standard `ModuleSettingsCard` pattern.

## 4. Feature flags
- [ ] `requiresFlowPilot` / `enhancedByFlowPilot` / `requiresAI` set correctly.
- [ ] If the module has skills, `requiresFlowPilot=false` (skills work via MCP without FlowPilot — see `mem://architecture/mcp-as-platform-not-flowpilot-feature`).

## 5. Documentation
- [ ] `docs/modules/<id>.md` describes purpose, skills, tables, settings.
- [ ] Added to `prd.md` if it represents a new business capability.
- [ ] Existing docs updated where they reference adjacent areas — consolidate, do not duplicate.

## 6. Memory
- [ ] If the module introduces a non-obvious architectural decision, add a `mem://` entry and link it from `mem://index.md`.
- [ ] If it adds an MCP toolset for a department, update `mem://federation/marketing-claw-department-pattern` (or sibling) so external claws can discover it.

## 7. Edge functions — keep the count down
- [ ] Pure AI workflows go into `supabase/functions/ai-task/tasks.ts`, NOT a new edge function.
- [ ] Email sends go through `email-send`, NOT a new sender.
- [ ] Database CRUD goes through `agent-execute` generic handlers.
- [ ] Only spin up a new edge function when there is real custom logic (auth, streaming, third-party webhook, etc.).

## 8. Migrations
- [ ] All migrations idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP ... IF EXISTS`).
- [ ] RLS enabled on every new table; policies use `has_role()` not column-on-profile.
