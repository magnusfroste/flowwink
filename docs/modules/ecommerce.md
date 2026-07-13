---
title: "Products Module"
module_id: "ecommerce"
version: "1.0.0"
category: "data"
autonomy: "config-required"
generated: true
generated_at: "2026-07-13"
---

# Products

> Create and manage e-commerce products

Ships with **15 agent skills**, **1 public block**, an **admin UI**.

## Quick Facts

| Property | Value |
|----------|-------|
| **Module ID** | `ecommerce` |
| **Version** | 1.0.0 |
| **Category** | data |
| **Autonomy** | config-required |
| **Core** | No |
| **Capabilities** | `content:receive`, `data:write`, `webhook:trigger` |
| **MCP-exposed skills** | 15 |
| **Owns tables** | — |

## Integrations

**Optional:** `stripe`, `resend`, `stripe_webhook`

## Skills

These skills are seeded into `agent_skills` when the module is enabled and exposed via MCP.
External operators (FlowPilot, OpenClaw, Claude Desktop, custom MCP clients) can call them directly.

| Skill | Scope | Description |
|-------|-------|-------------|
| `browse_products` | both | Browse the product catalog. Returns active products with prices, images, and stock info. Use when: a customer asks for available products; displaying items for sale; needing product details for an … |
| `manage_product` | internal | Manage products: create, update, delete, manage variants. Use when: adding a new item to the store; updating product details or pricing; handling product options (size, color). NOT for: managing in… |
| `manage_variant` | internal | Manage product variants (attribute combinations like size/color with their own SKU, price delta and stock). Use when: a product comes in multiple options; generating the variant set from attributes… |
| `manage_uom` | internal | Manage units of measure: list/get/create/update UoMs and their categories (Weight, Length, Unit, …). Each UoM converts to its category reference unit via a factor (kg=1, g=0.001). Use when: setting… |
| `convert_uom` | internal | Convert a quantity between two units of measure in the same category (e.g. 2500 g → 2.5 kg). Use when: normalizing quantities for stock, pricing or shipping weight. NOT for: listing/creating units … |
| `manage_inventory` | internal | Manage product inventory: list stock, update quantities, set low-stock alerts. Use when: adjusting stock levels; setting up low-stock notifications; auditing inventory counts. NOT for: managing pro… |
| `inventory_report` | internal | Generates product inventory status report. Use when: checking stock levels, reviewing inventory health. NOT for: updating inventory (use manage_inventory), managing products (use manage_product). |
| `lookup_order` | both | Look up order status by order ID or customer email. Use when: a customer inquires about their order; verifying order progress; retrieving order details for support. NOT for: managing orders (manage… |
| `manage_orders` | internal | Manage orders: list, get details, update status, view stats. Use when: reviewing customer orders; changing fulfillment status; analyzing sales trends. NOT for: checking status by ID (check_order_st… |
| `place_order` | external | Place an order as a customer — resolves products server-side, creates the order + line items. Accepts product_id or product_name per item. Use when: external agent creates an order programmatically… |
| `check_order_status` | external | Check the status of an existing order by ID. Use when: a user inquires about their purchase; verifying order progress; providing delivery updates. NOT for: managing orders (manage_orders); looking … |
| `cart_recovery_check` | internal | Lists orders with abandoned or incomplete status. Use when: reviewing abandoned carts, recovery campaigns, checking incomplete orders. NOT for: checking specific order status (use check_order). |
| `send_invoice_for_order` | internal | Convert an existing order into a sent invoice and email the customer a link. Closes the quote-to-cash loop. Use when: order is fulfilled or ready to bill, "fakturera order X", "send invoice for ord… |
| `fulfill_order_line` | internal | Record fulfillment of an order line (full or partial). Use when: shipping part of an order; marking a line picked/shipped. The order flips to shipped only once every line is fully fulfilled. NOT fo… |
| `manage_discount_code` | internal | Manage checkout discount codes: list, get, create, update, deactivate. Codes give a percent or fixed-amount discount at checkout, with optional validity window, usage limit and minimum order. Use w… |

## File Map

| Purpose | Path |
|---------|------|
| Module definition | `src/lib/modules/products-module.ts` |
| Hook | `src/hooks/useProducts.ts` |
| Admin page | `src/pages/admin/ProductsPage.tsx` |
| Public block | `src/components/public/blocks/ProductsBlock.tsx` |

## Contributing

To enhance this module, see [Contributing Guide](../contributing/contributing.md).

Key rules:
- Follow `ModuleDefinition<I, O>` contract pattern
- All schema changes require idempotent migrations
- Skills must be self-describing ([Law 2](../concepts/openclaw-law.md))
- Blocks are interfaces, not pipelines ([Law 3](../concepts/openclaw-law.md))
- New skills must pass the [Agent Contract Integrity](../../mem/architecture/agent-contract-integrity.md) checklist (`bun run lint:skills`)

---

*This file is auto-generated by `scripts/generate-module-docs.ts`. Do not edit manually — re-run the script after changing the module definition.*