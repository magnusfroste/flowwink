---
title: "EPIC-01 — Product variants & normalized order lines"
status: planned
sprint: 1
owner: unassigned
---

# EPIC-01 — Product variants & normalized order lines

## Why
This is the single highest-leverage structural gap. Today `products` has no
variants/SKU and order line items live as **JSONB in `orders.metadata`**. That one
modeling choice cascades: e-commerce can't sell size/colour, POS can't ring up a
variant, inventory can't track stock per SKU, and reporting/audit can't query a
line item. Odoo's entire commerce stack rests on `product.template` →
`product.product` (variant) → `*.order.line`. We replicate that backbone first;
everything in commerce depends on it. A bad data model here cannot be fixed by the
community later, so it is done in-house.

## Outcome (Definition of Done for the whole epic)
- [ ] All issues below merged
- [ ] Capabilities → `done` in `products.json`: `variants`, `attribute_templates`,
      `order_lines_normalized`, `uom`, `partial_shipments`
- [ ] `products` parity ≥ 60% (from 25%)
- [ ] Every shipped capability is dual-surface (MCP skill + admin UI)
- [ ] Existing orders backfilled from JSONB into normalized lines (zero data loss)
- [ ] `npx vitest run` + `npm run lint` green; `npm run test:mcp-regression` green

## Capabilities delivered
| File | Capability id | From → To |
|---|---|---|
| `capabilities/products.json` | `variants` | missing → done |
| `capabilities/products.json` | `attribute_templates` | missing → done |
| `capabilities/products.json` | `order_lines_normalized` | missing → done |
| `capabilities/products.json` | `uom` | missing → partial |
| `capabilities/products.json` | `partial_shipments` | missing → partial |

## Issues

- [x] **01.1 — Attribute & variant data model** *(migration `20260610140000`; verified on scratch Postgres — tables, idempotent re-run, generate=cartesian, dedup)*
  - **Migration:** `product_attributes` (id, name, display_type), `product_attribute_values`
    (id, attribute_id, value), `product_variants` (id, product_id, sku, barcode,
    price_delta_cents, active) + join `product_variant_values`. Idempotent.
  - **Verify:** tables exist; a product with 2 attributes × values generates the
    cartesian variant set.
  - Flips `products.json#attribute_templates` → done.

- [~] **01.2 — `manage_variant` skill + variant resolution** *(skill seed shipped, `rpc:manage_product_variant` list/get/create/update/deactivate/generate; Stage-3: run via agent-execute + pricelist-by-variant resolution pending)*
  - **Module:** `src/lib/modules/products-module.ts` — add `manage_variant`
    (create/list/update/deactivate) and extend `browse_products`/`manage_product`
    to return variants. Metadata must pass `skill-linter.ts`.
  - **Handler:** variant-aware price = base + price_delta, pricelist resolution by variant.
  - Flips `products.json#variants` → done.

- [~] **01.3 — Normalized `order_items` + variant link**
  - **Reality check (verify-first):** `order_items` ALREADY exists and is populated
    by `create-checkout` (sandbox + Stripe paths) — the audit's "lines are JSONB" was
    outdated. So this issue became: link lines to variants, not create the table.
  - **Done:** migration `20260610150000` adds `variant_id` (FK→product_variants,
    ON DELETE SET NULL) + `tax_rate_pct` to `order_items`; `create-checkout` now sets
    `variant_id`. Verified on scratch Postgres (idempotent; FK SET NULL keeps the line).
  - **Pending:** legacy backfill of any metadata-only orders; reconcile check;
    Stage-3 runtime verification. → `products.json#order_lines_normalized` = partial.

- [ ] **01.4 — Wire POS, checkout, invoicing to order_items + variants**
  - **Edge fns:** `create-checkout`, `place_order` handler, `send-order-confirmation`,
    `record_pos_sale_v2` write/read `order_items` with `variant_id`.
  - **Verify:** a POS sale and a web checkout of a variant both create normalized lines.

- [ ] **01.5 — Units of measure (foundation)**
  - **Migration:** `uom_categories`, `uoms` (factor to reference unit). Product gets
    `sales_uom_id`. Price resolution converts. Scope: data model + resolution only;
    purchase UoM is out.
  - Flips `products.json#uom` → partial.

- [ ] **01.6 — Per-line fulfillment (partial shipments)**
  - **Migration:** `order_items.qty_fulfilled`; derive order fulfillment_status from lines.
  - **Admin UI:** fulfillment panel shows per-line progress.
  - Flips `products.json#partial_shipments` → partial.

- [ ] **01.7 — Admin UI: variant editor**
  - `src/components/admin/` product editor gains attribute picker + generated
    variant grid (SKU, price delta, stock per variant).

## Dependencies & sequencing
01.1 → 01.2 → 01.3 → 01.4. 01.5/01.6/01.7 can follow 01.3 in parallel.
**Blocks EPIC-02** (valuation needs `variant_id` on stock moves + normalized lines).

## How we measure success
`bun run scripts/parity-report.ts` shows `products` ≥ 60%. A SQL check confirms
`SELECT count(*) FROM orders o WHERE NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id=o.id)` = 0.
