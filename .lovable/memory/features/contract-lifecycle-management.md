---
name: Contract Lifecycle Management
description: Contracts evolved from "legal archive" to "authoring + archive". TipTap markdown editor as source of truth, public signing flow mirrors quotes, MCP exposes full body to ClawWink. Sign as separate Odoo-style module is planned future extraction.
type: feature
---

## Scope (2026-04-21)
Contracts module is now **authoring + archive**:
- `contracts.body_markdown` is source of truth (TipTap WYSIWYG → Turndown → markdown)
- Public signing at `/contract/:token` mirrors `/quote/:token` UX
- `contract_versions` snapshots on send-for-signature
- `contract_signatures` audit log (view + accept/reject + IP/UA)
- `pg_trgm` GIN indexes on title + body_markdown for fast LLM-driven search

## MCP skills (Scenario B — ClawWink as operator)
- `manage_contract` — CRUD
- `get_contract_content` — full markdown body, LLM-friendly, no PDF parsing
- `search_contracts` — pg_trgm fuzzy search across title + counterparty + body
- `send_contract_for_signature` — generates public signing token + URL
- `contract_renewal_check` — daily cron (08:00 weekdays)
- `list_contract_documents` — attached PDFs via documents vault

## Edge function
`contract-sign` — public, no JWT — handles atomic accept/reject, status flip to active, audit insert.

## Future: Sign as standalone module (planned, not implemented)
Odoo has `sign` as a horizontal module. We deferred extraction until we have 3+ entities signing (currently quotes + contracts). When we extract:
- Polymorphic `signatures` table with `signable_type` + `signable_id` (same pattern as `documents`)
- `request_signature(entity_type, entity_id)` MCP skill works on any signable entity
- Reusable `<PublicSignaturePage>` component
- Trigger: when a 3rd entity (employment offers? PO approvals?) needs signing.

**Why wait:** premature abstraction before pattern stabilizes. Quotes and contracts are built and shipping — refactor when we know what's actually shared.
