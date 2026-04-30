# POS — Point of Sale

Odoo-style register: an opt-in **module that reuses platform tables** (products, stock, customers, accounting) rather than running its own silo. POS is just one more consumer of `products` + `product_stock`, alongside e-commerce, B2B and invoicing.

## Architecture principle

> POS is a UI on top of existing ERP tables, plus three POS-specific things: **session-batched bookkeeping**, **split tender**, and (future) **offline cache**.

```
products ──┬── e-commerce (orders)
           ├── inventory (product_stock)
           ├── invoicing (invoices)
           └── POS (pos_sales)   ← just one more consumer
```

## What it does

- Open / close cashier shifts (sessions) with opening cash and Z-report on close
- Ring up sales with line items, multi-payment (split tender), tax breakdown
- Validate products against the central catalog (`products.available_in_pos`)
- Emit stock movements via the platform event bus (no direct stock writes)
- Aggregate session totals per payment method for batch journal posting

## Schema

| Table | Purpose |
|-------|---------|
| `pos_registers` | Physical/virtual cash registers (location, currency, default tax rate) |
| `pos_sessions` | Open/close shifts — opening/closing cash, variance, Z-report in `metadata.z_report` |
| `pos_sales` | Sale headers — totals, summary `payment_method` ('cash'/'card'/.../'split'), customer, status |
| `pos_sale_lines` | Line items (product, qty, unit price, discount, tax) |
| `pos_payments` | **N payments per sale** — split tender (200 cash + 300 card on one receipt) |

### Products integration (POS v2)

`products` table has three POS-specific columns:

| Column | Purpose |
|--------|---------|
| `available_in_pos` | Flag — product appears in the cashier's product grid |
| `pos_category_id` | Touch-grid category (FK to `product_categories`) |
| `barcode` | Unique scanner code |

No separate POS catalog. Same SKU drives web, B2B, and POS.

## RPCs (SECURITY DEFINER)

### v2 (current — Odoo-style)

- `record_pos_sale_v2(register_id, session_id, lines[], payments[], customer_id?, customer_email?, discount_cents?, metadata?)`
  - Validates each line's `product_id` is `available_in_pos`
  - Inserts N rows in `pos_payments` (split tender)
  - Emits `stock.movement` event per product line (stock module decrements; POS doesn't write stock directly)
  - **Does NOT post journal entries** — that happens at session close
- `close_pos_session_v2(session_id, closing_cash_cents, notes?)`
  - Aggregates `pos_payments` by method across the entire session
  - Returns Z-report (totals, variance, payments-by-method)
  - Stores Z-report in `pos_sessions.metadata.z_report`
  - Emits `pos.session.closed` event → accounting module / FlowPilot picks up and posts ONE journal per session (not per sale)

### v1 (legacy — kept for backwards compat until UI migrates)

- `open_pos_session(register_id, opening_cash_cents, cashier_name)`
- `close_pos_session(session_id, closing_cash_cents)`
- `record_pos_sale(register_id, session_id, lines[], payment_method, customer_email, discount_cents)`

## Skills (MCP-exposed)

- `open_pos_session`
- `close_pos_session` / `close_pos_session_v2`
- `record_pos_sale` / `record_pos_sale_v2`
- `list_pos_sales`

## Routes

- `/admin/pos` — register, session and history tabs

## Events emitted

- `stock.movement` — per line item with `product_id`, fan-out to inventory module
- `pos.session.closed` — full Z-report, fan-out to accounting (batch journal) + FlowPilot (Morning Briefing, low-stock alerts)

## Comparison to Sitoo / Odoo POS

| Capability | Status |
|---|---|
| Shared product catalog | ✅ via `available_in_pos` |
| Split tender | ✅ `pos_payments` |
| Session-batched bookkeeping | ✅ via `pos.session.closed` event |
| Stock decrement | ✅ via event bus (decoupled) |
| Pricelists per register/customer | ⏳ pending pricelist module |
| Returns linked to original receipt | ⏳ `refund_of` column exists, no flow yet |
| Barcode scanner | ⏳ `products.barcode` exists, WebUSB integration pending |
| Offline-first PWA | ⏳ requires IndexedDB + sync queue |
| Hardware (printer / kortterminal) | ⏳ WebSerial/WebUSB or IoT-box style proxy |
| SE Skatteverket kontrollenhet | ⏳ locale-pack adapter (separate module) |

## Future development

1. Migrate UI to use `record_pos_sale_v2` + `close_pos_session_v2`
2. Product picker in cart (search `available_in_pos = true`, barcode input)
3. Touch-grid by `pos_category_id` for fast ringup
4. `pos_returns` table linked via `original_sale_id`
5. Pricelist resolution per register/customer
6. Offline-first PWA (IndexedDB + sync queue)
7. Hardware abstraction (WebUSB barcode + ESC/POS printer)
8. Locale-pack `pos_fiscal_adapter` for SE certified control unit
