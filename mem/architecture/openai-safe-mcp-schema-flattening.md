---
name: OpenAI-Safe MCP Schema Flattening
description: Permanent flat-schema-mönster med x-action-required för att klara OpenAI gpt-4.1 strict tool-calling. Runtime-flatten ?openai_safe=true behålls som defensivt safety-net.
type: feature
---

# OpenAI-Safe MCP Schema Flattening

## Problem

OpenAI `gpt-4.1` (och litellm-proxies som klär in den) följer JSON Schema strikt och **avvisar hela `tools`-arrayen med HTTP 400** om något enskilt tool har `allOf` / `oneOf` / `anyOf` / `not` / `if` / `then` / `else` på **top-level** av `inputSchema`.

FlowWink använde tidigare `allOf` + `if/then` i 14 `manage_*`-skills för att uttrycka per-action required fields. Det är giltig JSON Schema 2020-12 men bryter OpenAI's tool-validator.

## Lösning — permanent (deployd)

### Mönster: `x-action-required` extension

Alla skills använder nu **platt top-level schema** med en custom extension istället för `allOf/if-then`:

```ts
parameters: {
  type: 'object',
  properties: { action: { enum: [...] }, name: {...}, ... },
  required: ['action'],
  'x-action-required': {
    create: ['name', 'category'],
    schedule: ['id', 'scheduled_start'],
  },
}
```

**Fördelar:**
- OpenAI/LiteLLM accepterar schemat (top-level är ren JSON Schema-objekt)
- Claude/Anthropic ser exakt samma schema (en sanning)
- Guardrail-testet `skill-schema-not-null-coverage.guardrails.test.ts` läser `x-action-required` och validerar NOT NULL-täckning per action
- Handler-koden kan läsa samma fält för runtime-validering

### Migration-helper i DB

`public._flatten_skill_schema(jsonb)` — idempotent SQL-funktion som plattar ut gamla `allOf`-scheman och harvest:ar `if/then.required` till `x-action-required`. Kördes en gång för att rensa befintliga rader; kan köras igen vid behov.

### Bootstrap uppdaterad

`src/lib/module-bootstrap.ts` UPDATEar nu **alla** definition-fält (inklusive `tool_definition`) på befintliga skills — tidigare bara `description/instructions`. Det betyder att schema-ändringar i koden propagerar utan modul-reset.

## Defensivt safety-net (behållet)

`?openai_safe=true` query-param på `/mcp` och `/rest/tools` är kvar i `mcp-server/index.ts`. Den är nu en no-op för bundled skills (alla redan platta) men skyddar mot:
- Externa MCP-klienter som registrerar custom skills med `allOf`
- Snabb katastrof-recovery om en framtida regression introducerar problemet

Cache-nyckel `${groupKey}::safe` separerad så Claude/Anthropic-klienter får standard-katalogen.

## Drabbade skills (14 st — alla rewriteade)

`manage_document`, `manage_project_task`, `manage_employee`, `manage_leave`, `manage_job_posting`, `manage_project`, `manage_journal_entry`, `manage_chart_of_accounts`, `manage_analytic_account`, `manage_vendor`, `manage_contract`, `manage_accounting_template`, `manage_opening_balances`, `import_bank_image` (använder `x-mode-required` istället eftersom discriminator är `commit:boolean`, inte action-enum).

## För nya skills

**Använd ALDRIG `allOf` / `oneOf` / `anyOf` / `if/then/else` på top-level.** Använd `x-action-required` (för action-enum) eller `x-mode-required` (för boolean-flaggor) istället. Guardrail-testet enforcerar detta för `manage_*`-skills med `db:`-handler.
