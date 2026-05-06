---
name: MCP Invariant DB Guardrail
description: DB-trigger enforce_mcp_exposure_invariant på agent_skills blockar mcp_exposed=true + enabled=false vid INSERT/UPDATE — orphan MCP tools är fysiskt omöjliga
type: feature
---

# MCP Exposure Invariant — DB-level Guardrail

**Rule (kodifierad i DB):** En skill med `mcp_exposed = true` MÅSTE ha `enabled = true`.
Annars dyker den upp i MCP `tools/list` men kraschar vid anrop ("skill disabled") för externa agenter.

## Implementation (DB trigger — single source of truth)

`public.enforce_mcp_exposure_invariant()` BEFORE INSERT OR UPDATE på `agent_skills`. Raise:ar `check_violation` med tydligt meddelande om någon försöker skapa en orphan, oavsett kanal:

- Supabase SQL editor
- Migrations
- `agent-execute` generic CRUD
- Edge functions / RPC
- Direct PostgREST writes

Eftersom enforcement ligger i databasen krävs **ingen service role key** och **inget CI-steg** — invarianten kan inte brytas ens i dev där Lovable hanterar nycklarna åt oss.

## Fix-paths när trigger:n fail:ar en write

1. Re-enable skillen: `UPDATE agent_skills SET enabled=true WHERE name='<x>'`
2. Eller dölj från MCP: `UPDATE agent_skills SET mcp_exposed=false WHERE name='<x>'`

## Historik

Tidigare implementation (2026-05-06): CI-script `scripts/verify-mcp-invariant.ts` + workflow-steg som krävde `SUPABASE_SERVICE_ROLE_KEY`. Ersatt av DB-trigger samma dag eftersom dev-miljön (Lovable Cloud) inte exponerar service-key som GitHub secret. DB-trigger är dessutom strikt starkare — fångar även manuella SQL editor-edits som CI aldrig såg.
