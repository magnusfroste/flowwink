---
name: staged-operations-envelope
description: requires_staging-flagga + pending_operations-tabell + 202-envelope så MCP-peers får preview innan ledger-writes; approve_pending_operation re-invocerar med _approved_operation_id
type: feature
---

# Staged-Operation Envelope

**Lager:** Accounting neutral core (locale-agnostiskt).

## Vad
Skills med `agent_skills.requires_staging=true` exekverar inte direkt när de anropas via `agent-execute`. De returnerar istället HTTP 202 + en envelope:

```json
{
  "staged": true,
  "risk_level": "high|medium|low",
  "preview": { ... },
  "period_status": "open|locked|closing",
  "pending_id": "uuid",
  "next": { "approve": "approve_pending_operation", "reject": "reject_pending_operation" }
}
```

Intentet persisteras i `pending_operations` (status `pending`/`approved`/`rejected`/`executed`/`expired`).

## Flow
1. peer → `manage_journal_entry(args)` → 202 envelope + `pending_id`
2. operator (UI eller agent) granskar i `/admin/accounting → Pending Ops`
3. operator → `approve_pending_operation(pending_id)` → status `approved`
4. peer → `manage_journal_entry(args, _approved_operation_id=pending_id)` → 200 + faktiskt resultat
5. wrapper markerar raden `executed`

## Flaggade skills (idag)
`manage_journal_entry`, `book_expense_report`, `mark_expense_report_paid`, `record_pos_sale_v2`, `close_pos_session_v2`, `close_accounting_period`, `reopen_accounting_period`.

## Period-status auto-injection
`agent-execute`-helpern läser `accounting_periods.is_closed` för datumet i payload och stoppar in `period_status` i envelope:n — locale-neutralt (alla pack använder samma tabell).

## Guardrail
`src/lib/__tests__/staged-operations.guardrails.test.ts` låser invariantet — om en framtida migration glömmer `requires_staging=true` på en av ovan, eller `mcp_exposed=false`, failar CI.

## Varför locale-neutralt
Staging är ett MCP-protokoll-lager — inte landsspecifikt. SE/IFRS/DE/UK/US får exakt samma säkerhetsnät utan att packen behöver veta om det.
