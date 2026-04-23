---
title: "Inventory Module"
module_id: "inventory"
version: "1.1.0"
category: "data"
autonomy: "agent-capable"
generated: true
generated_at: "2026-04-23"
---

# Inventory

> Stock level monitoring, low-stock alerts, movement history — and autonomous reorder that closes Procure-to-Pay against stock levels.

## Quick Facts

| Property | Value |
|----------|-------|
| **Module ID** | `inventory` |
| **Version** | 1.1.0 |
| **Category** | data |
| **Autonomy** | agent-capable |
| **Core** | No |
| **Capabilities** | `data:read`, `data:write` |

## Loops

### Auto-Reorder (closes Procure-to-Pay against stock)

| Step | Skill / Mechanism | Outcome |
|------|-------------------|---------|
| 1 | `list_reorder_candidates()` | Returns products where `quantity_on_hand ≤ reorder_point` AND `auto_reorder = true`, joined with preferred vendor + unit price + lead time |
| 2 | `auto_generate_purchase_orders(dry_run?)` | Groups candidates by vendor, creates one draft PO per vendor with 25% tax. Respects `min_order_quantity`. Skips products without preferred vendor (reported in result) |
| 3 | Hand-off | Drafts land in [Purchasing](./purchasing.md) for approval and 3-way match |

**Authorization:** PO generation requires `admin` or `approver` role.

## API Contract

**Actions (publish):** `check_stock`, `list_low_stock`, `get_movements`

**Skills:** `check_stock`, `adjust_stock`, `low_stock_report`, `list_reorder_candidates`, `auto_generate_purchase_orders`

## File Map

| Purpose | Path |
|---------|------|
| Module definition | `src/lib/modules/inventory-module.ts` |
| Hook | `src/hooks/useInventory.ts` |
| Admin page | `src/pages/admin/InventoryPage.tsx` |
| Auto-reorder migration | `supabase/migrations/20260423143927_*.sql` |

## Contributing

Key rules:
- Drafts only — never let the agent auto-approve POs
- Tax rate (25%) is hard-coded today; promote to vendor/setting before going multi-market
- Skills must be self-describing (Law 2)
