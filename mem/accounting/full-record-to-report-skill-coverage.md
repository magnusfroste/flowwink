---
name: Full Record-to-Report Skill Coverage
description: Status över hur expense P2P + reconciliation + purchasing + documents-skills är registrerade i modul-manifesten. Källkoden är sanningen — alla skillSeeds bor nu i sin modul.
type: feature
---

**Källkoden är sanningen.** När en skill finns i `agent_skills` (DB) men inte i någon moduls `skillSeeds[]` blir den en orphan: vid module-reset (disable→enable) eller fresh install försvinner den tills migrationen körs om manuellt. Lösningen är ALLTID att lyfta in skillen i sin moduls `skillSeeds[]` med fullständig `tool_definition`.

## Status per modul (efter 2026-05-02 audit)

**Expenses (`EXPENSE_SKILLS` + `skills[]`):**
- `manage_expenses`, `analyze_receipt`
- `generate_monthly_expense_report` (auto), `submit_expense_report` (notify)
- `approve_expense_report`, `book_expense_report`, `mark_expense_report_paid` (alla approve)
- `list_expense_reports` (notify)

**Reconciliation (`RECONCILIATION_SKILLS` + `skills[]`):**
- `import_bank_image` (full seed)
- `list_unmatched_transactions` (full seed) ✅ lyft in 2026-05-02
- `sync_stripe_payouts`, `import_bank_file`, `auto_match_transactions` — bara namn i `skills[]`, fortfarande seedade via legacy-bootstrap. TODO: lyft in som fulla SkillSeed-objekt.

**Purchasing (`PURCHASING_SKILLS` + `skills[]`):**
- `manage_vendor`, `create_purchase_order`, `send_purchase_order`, `receive_purchase_order` (atomic RPC), `match_invoice_to_receipt`, `auto_approve_vendor_invoice`, `purchase_reorder_check`
- `register_vendor_invoice`, `match_po_to_invoice`, `flag_invoice_variance`
- `update_purchase_order` (full seed) ✅ lyft in 2026-05-02
- `auto_generate_purchase_orders` (full seed) ✅ lyft in 2026-05-02
- **Borttagna duplikater:** `receive_goods` + `record_goods_receipt` deleterade från DB 2026-05-02 — ersattes av `receive_purchase_order` (atomic RPC med stock_moves + event-emit).

**Documents (`DOCS_SKILLS` + `skills[]`):**
- `manage_document`
- `extract_pdf_text` (full seed) ✅ lyft in 2026-05-02 (var en separat oanvänd `DOCUMENTS_SKILLS`-array i samma fil)
- `upload_document` (full seed) ✅ lyft in 2026-05-02

**Accounting äger:** `manage_journal_entry`, `tag_journal_entry_analytics` — inte reconciliation eller expenses.

## Generell princip

SQL-migration som seedar agent_skills är en engångsbootstrap. Sanningen ska bo i modulens `skillSeeds[]`. När du upptäcker en skill som finns i DB men inte i seeds → flytta in den, ta inte bara med namnet i `skills[]`. Då överlever den module-reset.

## Verifieringskommando

```bash
# Hitta orphans:
psql -t -A -c "SELECT name FROM agent_skills ORDER BY name;" > /tmp/db.txt
rg -No "name:\s*['\"]([a-z_][a-z0-9_]+)['\"]" src/lib/modules/ -r '$1' --no-filename | sort -u > /tmp/seeded.txt
comm -23 /tmp/db.txt /tmp/seeded.txt
```

Tillåtna platform-skills som INTE behöver ägas av en modul: `lint_skill` (developer-tooling), `a2a_*`, `openclaw_*`, `dispatch_claw_mission`, `queue_beta_test` (operator-internal — se mem://architecture/mcp-exposure-invariants).
