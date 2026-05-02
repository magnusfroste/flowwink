---
name: OpenAI-Safe MCP Schema Flattening
description: ?openai_safe=true query-param på mcp-server flatten:ar allOf/oneOf/anyOf/if-then-else på top-level av inputSchema, så gpt-4.1/litellm-claws inte avvisar tools/list med HTTP 400
type: feature
---

# OpenAI-Safe MCP Schema Flattening

## Problem

OpenAI `gpt-4.1` (och litellm-proxies som klär in den) följer JSON Schema strikt och **avvisar hela `tools`-arrayen med HTTP 400** om något enskilt tool har `allOf` / `oneOf` / `anyOf` / `not` / `if` / `then` / `else` på **top-level** av `inputSchema`.

FlowWink använder `allOf` + `if/then` medvetet i 14 `manage_*`-skills för att uttrycka per-action required fields (per `mem://constraints/skill-schema-must-mirror-db-not-null`). Det är giltig JSON Schema 2020-12 men bryter OpenAI's tool-validator.

Effekt: claws som kör mot FlowWink via gpt-4.1 hänger eller failar i heartbeats trots att API-nyckel + tool-count är OK — varje tool-call dör vid validering innan modellen får tänka.

## Lösning (hybrid)

### Steg 1 (deployd): `?openai_safe=true` query-param

Vägar: `/mcp?openai_safe=true`, `/rest/tools?openai_safe=true`. Kombineras med `?groups=...`.

Helpers i `supabase/functions/mcp-server/index.ts`:
- `hasUnsafeTopLevelKeyword(schema)` — detekterar om top-level har `allOf`/`oneOf`/`anyOf`/`not`/`if`/`then`/`else`
- `flattenSchemaForOpenAI(schema)` — merge:ar alla branches in i top-level `properties`, behåller bara base-level `required`, droppar `not`

Cache-nyckel: `${groupKey}::safe` så safe-version inte krockar med default (Claude/Anthropic-klienter får oförändrad katalog).

Default = `false` (oförändrat beteende för befintliga MCP-klienter).

### Steg 2 (queued): Rewrite 14 manage_* skills till action-discriminator

Permanent fix: skriv om varje `manage_*`-skill så top-level inputSchema är platt:
- Alla fält som `properties`, alla optional
- Bara `action` som required på top-level
- Per-action required dokumenterat i `description` (`Use when action=create: requires title, content_md.`)
- Runtime-validering i agent-execute-handlers fortsätter skydda DB NOT NULL-constraints (vi har redan `normalizeLeadStatus()`-mönstret)

Drabbar: manage_document, manage_project_task, manage_employee, manage_leave, manage_job_posting, manage_project, manage_journal_entry, manage_chart_of_accounts, manage_analytic_account, manage_vendor, manage_contract, manage_accounting_template, manage_opening_balances, import_bank_image.

## Användning för claws

```
# Innan: claws hängde med gpt-4.1
MCP_URL = https://<base>/mcp?groups=marketing

# Efter: lägg till openai_safe=true
MCP_URL = https://<base>/mcp?openai_safe=true&groups=marketing
```

## Trade-off

Med `openai_safe=true` förlorar gpt-4.1-klienten **schema-nivå** vägledning om vilka fält som är required per action. Det är OK eftersom:
1. `description` på skill:en kan dokumentera det
2. Runtime-handlers validerar NOT NULL ändå (returnerar tydligt felmeddelande som agenten kan rätta i nästa turn)
3. Gpt-4.1 kan annars inte ens se tool:en — bättre med svagare schema än ingen schema alls

Claude/Anthropic-klienter (som hanterar `allOf` korrekt) ska INTE sätta `openai_safe=true` — de får full schema-fidelity utan flaggan.
