---
title: "Point of Sale Module"
module_id: "pos"
version: "2.0.0"
category: "data"
autonomy: "view-required"
generated: true
generated_at: "2026-07-13"
---

# Point of Sale

> In-store register — sessions, receipts, split payments, stock-aware product catalog

Ships with **14 agent skills**, **4 database tables**.

## Quick Facts

| Property | Value |
|----------|-------|
| **Module ID** | `pos` |
| **Version** | 2.0.0 |
| **Category** | data |
| **Autonomy** | view-required |
| **Core** | No |
| **Capabilities** | `data:read`, `data:write` |
| **MCP-exposed skills** | 14 |
| **Owns tables** | 4 |

## Skills

These skills are seeded into `agent_skills` when the module is enabled and exposed via MCP.
External operators (FlowPilot, OpenClaw, Claude Desktop, custom MCP clients) can call them directly.

| Skill | Scope | Description |
|-------|-------|-------------|
| `open_pos_session` | internal | Open a cashier shift on a register with opening cash. Use when: cashier starts a shift in the morning. NOT for: closing the shift (close_pos_session). |
| `close_pos_session` | internal | Close cashier shift, count cash and compute variance. Use when: end of day/shift. NOT for: refunding sales. |
| `record_pos_sale` | internal | Record a completed in-store sale with line items and payment. Use when: cashier rings up a sale. NOT for: e-commerce orders (use place_order). |
| `list_pos_sales` | internal | List recent POS sales with filters. Use when: reviewing daily takings, finding a receipt, audit. NOT for: aggregated revenue (today_summary). |
| `record_pos_sale_v2` | internal | Odoo-style POS sale: split payments, product validation, stock event. Use when: cashier finalizes a basket. NOT for: e-commerce orders (use place_order). |
| `close_pos_session_v2` | internal | Close shift and generate Z-report with payments-by-method aggregation. Emits pos.session.closed event for batch journal posting. Use when: cashier ends shift / day-end POS closing / "close pos sess… |
| `add_tip` | internal | Add a tip to a completed POS sale (records tip_cents + a tip payment row). Use when: the customer leaves a tip after tendering. NOT for: the sale itself (record_pos_sale_v2). |
| `manage_gift_card` | internal | Issue and manage gift cards (balance ledger). Use when: selling/issuing a gift card, checking a balance, deactivating a lost card. NOT for: spending a card at checkout (redeem_gift_card). |
| `redeem_gift_card` | internal | Spend against a gift card balance (e.g. as a POS gift_card payment). Use when: applying a gift card at checkout. Guards inactive cards and insufficient balance. NOT for: issuing cards (manage_gift_… |
| `manage_loyalty` | internal | Loyalty/points program: enroll customers, check balances, earn/redeem/adjust points. Enrolled customers auto-earn 1 point per 10 currency units on completed sales. Use when: signing a customer up f… |
| `refund_pos_sale` | internal | Refund a POS sale, fully or per line (creates a negative sale linked via refund_of, restocks returned products, reverses loyalty points). Use when: customer returns in-store goods / receipt correct… |
| `pos_sale_to_invoice` | internal | Convert a POS receipt into a draft invoice linked back to the sale (B2B customers who pay on invoice or need a formal invoice for a store purchase). Use when: "can I get an invoice for this receipt… |
| `render_pos_receipt` | internal | Render a branded receipt for a POS sale: lines, payments, tax, tip, plus register receipt header/footer and site branding. Use when: printing/emailing a receipt, showing receipt details. NOT for: i… |
| `manage_pos_table` | internal | Table/seat management for food & beverage POS: create tables, seat guests (link a sale/tab), release. Use when: restaurant/café floor management, open tabs per table. NOT for: booking appointments … |

## Data Model

Tables created by this module (from migrations):

- `public.agent_trust_policies`
- `public.loyalty_accounts`
- `public.loyalty_transactions`
- `public.pos_tables`

All tables ship with Row-Level Security policies. See migration files for the exact rules.

## Module API Contract

**Actions:** `list_sales`, `list_sessions`, `today_summary`

**Input fields:** `action`, `register_id`, `limit`

**Output fields:** `success`, `data`, `error`

## File Map

| Purpose | Path |
|---------|------|
| Module definition | `src/lib/modules/pos-module.ts` |
| Migration | `supabase/migrations/20260630120000_f1a2b3c4-job-posting-slug-autogen.sql` |
| Migration | `supabase/migrations/20260707214000_pos-parity-r5.sql` |
| Migration | `supabase/migrations/20260709100000_pos-sale-resolve-product-name.sql` |
| Migration | `supabase/migrations/20260710080000_flowpilot-trust-posture.sql` |

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