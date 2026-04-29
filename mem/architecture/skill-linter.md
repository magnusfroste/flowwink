---
name: skill-linter
description: Skill-linter MCP-skill + CLI som kör Agent Contract Integrity-checklistan automatiskt och returnerar konkreta åtgärdslistor per skill innan release
type: feature
---

# Skill Linter

Operationaliserar `mem://architecture/agent-contract-integrity` som ett körbart verktyg.

## Tre sätt att köra

1. **CLI** (lokalt under utveckling):
   ```bash
   bun run lint:skills              # alla enabled skills
   bun run lint:skill <skill_name>  # en specifik
   bun run lint:skill --json        # maskinläsbar output
   ```
   Exit-code 1 om någon `severity=error` finns → kan kopplas till CI.

2. **MCP-skill** `lint_skill` (FlowPilot/peers):
   - Handler: `internal:lint_skill` i `agent-execute`
   - Kategori: `system`, `mcp_exposed=true`
   - Args: `skill_name?`, `include_passing?`, `auto_filled_columns?`
   - Användbart för "innan jag aktiverar X, kör lint och rapportera"

3. **Edge function direkt** (`agent-execute` med `skill_name=lint_skill`).

## SQL-helpers (säkra read-only via SECURITY DEFINER)

- `lint_get_rpc_signatures()` → varje public function + parameter-namn
- `lint_get_not_null_columns()` → alla NOT NULL utan default i public

Båda GRANTade till anon/authenticated/service_role — read-only metadata.

## Findings-format

Per skill: `{ skill_name, handler, category, ok, findings[] }`.
Per finding: `{ layer (1–4), severity (error|warn|info), rule, message, fix? }`.

Layer 1 = arg-mapping (rpc:* mappas via `p_`-prefix mot pg_proc).
Layer 2 = NOT NULL-täckning (db:* mot information_schema, undantag via `auto_filled_columns`-arg eller fixturen).
Layer 3 = description-kvalitet (>=30 chars, "Use when:", "NOT for:" — Law 2).
Layer 4 = category satt + mcp_exposed-status.

## Pre-release-flöde
1. Skapa/ändra skill (i kod eller via migration).
2. Kör `bun run lint:skills` lokalt.
3. CI kör samma script (exit ≠ 0 = block).
4. För agentdriven release: peer/FlowPilot anropar `lint_skill` via MCP innan den föreslår merge.

## Filer
- `scripts/skill-linter.ts` (CLI)
- `supabase/functions/agent-execute/index.ts` → `executeLintSkill()` + `lintOne()`
- Migration: `lint_get_rpc_signatures()`, `lint_get_not_null_columns()`, seed av `lint_skill`
- `package.json` scripts: `lint:skill`, `lint:skills`
