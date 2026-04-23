---
title: "Purchasing Module"
module_id: "purchasing"
version: "1.1.0"
category: "data"
autonomy: "agent-capable"
generated: true
generated_at: "2026-04-23"
---

# Purchasing

> Procure-to-pay lifecycle: purchase orders, vendor management, goods receipt, vendor invoices and 3-way match auto-approval.

## Quick Facts

| Property | Value |
|----------|-------|
| **Module ID** | `purchasing` |
| **Version** | 1.1.0 |
| **Category** | data |
| **Autonomy** | agent-capable |
| **Core** | No |
| **Capabilities** | `data:write`, `data:read` |

## Loops

### Procure-to-Pay (3-way match)

Closes the loop from invoice receipt to approved payment without human intervention when PO + GRN + invoice agree.

| Step | Skill / Mechanism | Outcome |
|------|-------------------|---------|
| 1 | `register_vendor_invoice` | Creates row in `vendor_invoices` (status `received`) |
| 2 | Trigger `trg_three_way_match` | Compares invoice ↔ PO ↔ goods receipt within tolerance |
| 3 | Auto-resolution | Status flips to `approved` if match passes; otherwise `disputed` for human review |
| 4 | `list_vendor_invoices(status)` | AP queue for follow-up |

### Inventory-driven Reorder (closes against stock)

See [Inventory module](./inventory.md) — `auto_generate_purchase_orders` produces draft POs grouped per vendor based on `reorder_point`.

## API Contract

**Actions (publish):** `create_po`, `list_pos`, `list_vendors`, `get_vendor`

**Skills:** `create_po`, `list_pos`, `list_vendors`, `register_vendor_invoice`, `list_vendor_invoices`

## File Map

| Purpose | Path |
|---------|------|
| Module definition | `src/lib/modules/purchasing-module.ts` |
| Hook | `src/hooks/usePurchasing.ts` |
| 3-way match migration | `supabase/migrations/20260423081504_*.sql` |

## Contributing

Key rules:
- Follow `ModuleDefinition<I, O>` contract pattern
- All schema changes require idempotent migrations
- 3-way match tolerance is configured in the trigger — adjust there, never bypass it from app code
