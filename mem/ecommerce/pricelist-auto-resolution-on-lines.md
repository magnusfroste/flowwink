---
name: Pricelist Auto-Resolution on Lines
description: Quote/invoice line items with product_id auto-resolve to best customer-specific price via resolve_pricelist_price RPC; locked rows skip resolution
type: feature
---

`src/lib/pricelist-resolver.ts` exposes `applyPricelistToLineItems(items, ctx)` som körs i `useCreateInvoice`, `useUpdateInvoice`, `useCreateQuote`, `useUpdateQuote` innan totals beräknas.

**InvoiceLineItem utökat med:**
- `product_id?: string | null` — krävs för pricelist-lookup
- `unit_price_locked?: boolean` — sätt till true när säljare manuellt overridar pris
- `pricelist_id?: string | null` — audit, sätts av resolvern
- `price_source?: 'pricelist' | 'product_base' | 'manual'` — audit

**Beteende:**
- Rader utan `product_id` → pass-through (free-text rows funkar fortfarande)
- Rader med `unit_price_locked=true` → pass-through, taggas `manual`
- Övrigt → RPC `resolve_pricelist_price(product_id, lead_id, company_id, qty, currency)` → skriver `unit_price_cents` + audit-fält
- RPC-fel → behåller original-pris + loggar warning (fail forward)

**Context-resolution:** `lead_id` från input/current row, `company_id` slås upp via `leads.company_id`-join.

**Inte hookat:** orders/order_lines (orders har egen tabell, inte JSONB) — separat sprint om order-flöden ska få pricelist också.
