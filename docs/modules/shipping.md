---
title: "Shipping Module"
module_id: "shipping"
version: "1.0.0"
category: "data"
autonomy: "config-required"
generated: true
generated_at: "2026-07-13"
---

# Shipping

> Outbound shipping with multi-parcel support and carrier integrations. Built-in: PostNord, DHL, Bring. Tracking URLs are auto-rendered from per-carrier templates.

Ships with **13 agent skills**, **3 database tables**, **1 public block**, an **admin UI**.

## Quick Facts

| Property | Value |
|----------|-------|
| **Module ID** | `shipping` |
| **Version** | 1.0.0 |
| **Category** | data |
| **Autonomy** | config-required |
| **Core** | No |
| **Capabilities** | `data:read`, `data:write` |
| **MCP-exposed skills** | 13 |
| **Owns tables** | 3 |

## Integrations

**Optional:** `postnord`, `dhl`, `bring`

## Skills

These skills are seeded into `agent_skills` when the module is enabled and exposed via MCP.
External operators (FlowPilot, OpenClaw, Claude Desktop, custom MCP clients) can call them directly.

| Skill | Scope | Description |
|-------|-------|-------------|
| `manage_carrier` | internal | CRUD for shipping carriers (PostNord, DHL, Bring, custom). Use when: enabling/disabling a carrier, updating tracking-URL templates, or rotating API credentials. NOT for: creating shipments (use man… |
| `manage_shipment` | internal | Create/list/update shipments (parcels) for an order. Use when: warehouse books a parcel with a carrier and gets a tracking number. NOT for: marking the whole order as shipped (use manage_orders ful… |
| `manage_shipping_rate` | internal | Manage a carrier\ |
| `calc_shipping_rate` | internal | Compute a shipment\ |
| `list_shipping_options` | internal | Rate-shop across ALL active carriers: cheapest matching weight band per carrier for a parcel, sorted by price. Use when: comparing carriers for a shipment, quoting delivery options at checkout, pic… |
| `estimate_delivery_date` | internal | Estimate the delivery-date window for a carrier: ships next business day, then transit_days_min–max business days (weekends + business_holidays skipped). Use when: telling a customer when a parcel … |
| `manage_carrier_pickup` | internal | Schedule carrier pickups (book a time window, attach parcels, confirm/cancel). Use when: booking PostNord/DHL to collect parcels from the warehouse. NOT for: customer delivery booking (manage_booki… |
| `record_delivery_proof` | internal | Capture proof of delivery on a shipment: signature URL, signer name, photos. Marks the shipment delivered; when every outbound parcel of the order is delivered the order flips to delivered too. Use… |
| `create_return_label` | internal | Generate a return shipping label: creates a return-kind shipment linked to the original with a RET- tracking number and a label payload (customer address → merchant). Use when: an RMA/return needs … |
| `batch_shipping_labels` | internal | Collect labels for many shipments in one call — the print queue for the warehouse. Use when: printing the day\ |
| `select_shipping_carrier` | internal | Pick a carrier with automatic failover: tries the preferred carrier first and falls back through the remaining active carriers by priority until one has a matching rate. Use when: a preferred carri… |
| `validate_address` | internal | Validate a shipping address before booking: required fields + per-country postal-code format (16 countries seeded in postal_code_rules). Use when: checking a customer address before creating a ship… |
| `manage_shipment_customs` | internal | International shipping customs: set customs data (value, incoterm, contents type, HS-coded items) on a shipment and generate a CN22-style declaration. Use when: shipping outside the customs union; … |

## Data Model

Tables created by this module (from migrations):

- `public.postal_code_rules`
- `public.public`
- `public.shipping_pickups`

All tables ship with Row-Level Security policies. See migration files for the exact rules.

## Module API Contract

**Actions:** `list_carriers`, `list_shipments`, `create_shipment`

**Input fields:** `action`, `order_id`

## File Map

| Purpose | Path |
|---------|------|
| Module definition | `src/lib/modules/shipping-module.ts` |
| Admin page | `src/pages/admin/ShippingPage.tsx` |
| Public block | `src/components/public/blocks/ShippingInfoBlock.tsx` |
| Migration | `supabase/migrations/20260707120000_parity-r3-shipping-tickets-subscriptions.sql` |
| Migration | `supabase/migrations/20260708010000_shipping-parity-r6.sql` |

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