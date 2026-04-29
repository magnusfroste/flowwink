---
name: Manufacturing MRP-light
description: BOM versioning + MO snapshot pattern, 7 RPCs, mo_status enum, stock_moves.mo_id link, agent procurement loop
type: feature
---

`manufacturing` module (opt-in, `enhancedByFlowPilot`). 4 nya tabeller: `bom_headers` (en aktiv version per produkt via partial unique index), `bom_lines`, `manufacturing_orders` (mo_number `MO-YYYY-NNNN` via `next_mo_number()` + advisory lock), `mo_components` (snapshot vid confirm — BOM-edits efter confirm påverkar inte historik).

`stock_moves` utökad med nullable `mo_id` + nya `move_type`-värden `mo_consumption` / `mo_production` (text, ingen enum-migration behövs).

7 SECURITY DEFINER RPCs, alla MCP-exponerade via 9 skill seeds: `create_bom`, `confirm_mo` (snapshottar + kör check), `check_mo_availability` (idempotent, uppdaterar cache), `start_mo`, `complete_mo` (postar moves + uppdaterar product_stock atomiskt), `cancel_mo`, `trigger_procurement_for_mo` (idempotent — skippar komponenter med öppen PO `source_type='manufacturing' source_id=mo_id`, returnerar requests för agent att skicka till `create_purchase_order`).

Events via `emit_platform_event` (best-effort, fångar undefined_function): `mo.confirmed`, `mo.shortage_detected`, `mo.completed`, `mo.cancelled`. Automation seed: `mo.shortage_detected` → `trigger_procurement_for_mo`.

Non-goals v1: multi-level BOMs, work centers/capacity, quality control, lots/serial, persisted standard cost. UI: `/admin/manufacturing` med Orders + BOMs tabs (BOM-editor och Insights utelämnade i v1).
