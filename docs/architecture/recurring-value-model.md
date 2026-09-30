---
title: Recurring value across the sales chain — one dimensioned line, derived rollups
status: COMPLETE — steps 1–5 shipped (product cadence · quote recurrence/term/rollup · deal basis display · quote→contract→subscription inheritance · dimension-consistent pipeline sums + agent instructions)
audience: FlowWink core
description: A price is not a number. It is (amount, cadence, term, quantity). Today the chain stores a dimensionless scalar upstream and only grows the missing dimensions late:
category: architecture
---

# Recurring value: how a price keeps its dimension from deal to subscription

## The problem (why 120 000 in a quote feels wrong)

A price is not a number. It is **(amount, cadence, term, quantity)**. Today the
chain stores a *dimensionless scalar* upstream and only grows the missing
dimensions late:

| Stage | Amount fields today | Cadence? | Term? |
|---|---|---|---|
| `deals` | `value_cents` | ❌ | ❌ |
| `quotes` / `quote_line_items` | `total_cents`, line = `qty × unit_price` | ❌ | ❌ |
| `contracts` | `value_cents` **+ `billing_amount` + `billing_interval`** | ✅ born here | ❌ |
| `subscriptions` | `unit_amount` + `interval` + **`commitment_months`** | ✅ | ✅ complete |

So "10 000" and "120 000" travel with no unit. `120 000` could be TCV, ARR, or a
lump — the system can't tell, and the recurrence is *reinvented* at the contract,
disconnected from what the quote said. This is the number-dimension law
(AliExpress rule) turned inside out: **a number without its dimension forces a
lie downstream.**

One-time sales "just work" because for them cadence = *once*, term = 1, so
MRR = ARR = TCV = the scalar. **One-time is the degenerate case; recurring is the
general one.** We modelled the general as the special.

## The design principle (generic, Odoo-like, product-driven)

**The product is the source of the dimension. The pipeline reads it; the engine
never branches on "is this a subscription business."**

`products.type` is already `one_time | recurring`. That flag is the single
switch. A pure-product shop sets every product `one_time`, the recurring fields
stay NULL, every rollup collapses to the scalar, and **the current flow is 100 %
unchanged**. A telco sets products `recurring` and the same pipeline carries
cadence + term. A shop selling both (installation fee + monthly service on one
quote) is just a quote with a one-time line and a recurring line — no special
mode. This is exactly Odoo's model: the product's invoicing policy drives the
sale order line; one order handles mixed.

The rule mirrors the localization law: **behaviour is configured by data
(product.type + cadence), the engine has no `if subscriptionTenant` branch.**

## The one missing atomic fact

`products.type = recurring` says *that* it recurs, not *how often*. `Privat AI =
recurring, 10 000` is still dimensionless. So the minimal, load-bearing addition
is **cadence on the recurring product** — the one fact the product is first to
know, and the only new thing the deal needs.

## Schema deltas (all additive, all nullable, one-time unaffected)

```
products
  + billing_interval        text   NULL   -- 'month' | 'year'; meaningful iff type='recurring'
  + default_term_months     int    NULL   -- optional suggested binding term (e.g. 36)

quote_line_items
  + recurrence              text   NULL   -- 'one_time' | 'month' | 'year'; inherited from product on add
  + term_months             int    NULL   -- binding term for THIS line; falls back to quote/product default
  (line_total_cents stays "per period" for a recurring line — never pre-multiplied by the term)

quotes
  + default_term_months     int    NULL   -- one place to set "this offer is for 3 years"

deals
  value_cents  is redefined as a DERIVED cache of the chosen basis (see below),
  + value_basis             text   NULL   -- 'one_time' | 'mrr' | 'arr' | 'tcv'; default from a site setting

-- contracts + subscriptions need NOTHING new: billing_amount/billing_interval and
-- unit_amount/billing_interval/commitment_months already model it. This is the
-- proof the dimension belongs upstream, not that it's missing downstream.
```

Nothing is required. A one-time product leaves `billing_interval`,
`recurrence`, `term_months` NULL and behaves exactly as today.

## The derivations (pure functions of the line facts — never typed in)

Normalise any line to a monthly figure, then roll up. `qty` and discounts apply
first to get the effective per-period amount `p`.

```
monthly(p, recurrence) =
    recurrence = 'month' -> p
    recurrence = 'year'  -> p / 12
    else /* one_time */  -> 0

MRR (monthly recurring revenue) = Σ monthly(line.p, line.recurrence)
ARR (annual recurring revenue)  = MRR × 12
one_time_total                  = Σ line.p where recurrence = 'one_time'
TCV (total contract value)      = one_time_total
                                + Σ ( monthly(line.p, line.recurrence) × line.term_months )
```

Worked, Magnus's case — Privat AI 10 000/mån, 36 mån binding, plus a 5 000
one-time installation on the same quote:

```
MRR             = 10 000
ARR             = 120 000
one_time_total  =  5 000
TCV             =  5 000 + 10 000 × 36 = 365 000
```

The offer shows **all** of it, because the customer signs up to the cadence AND
the commitment — TCV is the consequence, not the headline you type.

## Where each number is shown

- **Product form** — `type` (exists) and, when `recurring`, a cadence picker
  (`/month` · `/year`) and optional default term. A one-time product never shows
  these fields.
- **Deal** — headline = the configured `value_basis` (default **ARR** for a
  recurring pipeline so a 10 000/mo deal isn't shown as 12× smaller than a
  120 000 one-time deal; **total** for a one-time pipeline). The card shows
  "10 000 kr/mån", never a naked 10 000. Basis is a site setting →
  configurable, not hardcoded.
- **Quote** — each line renders in its own dimension ("10 000 kr/mån", "5 000 kr
  engång"). A summary block replaces the single total:
  `Engångskostnader 5 000 · Månadskostnad 10 000 · Bindningstid 36 mån ·
  Totalt kontraktsvärde 365 000`.
- **Contract** — `billing_amount` = the recurring line's per-period amount,
  `billing_interval` = cadence, `commitment_months` = term. TCV printed as an
  informational figure (and `{{contract.number}}` already names it).
- **Subscription** — `unit_amount` + `billing_interval` + `commitment_months`,
  already complete. It is *born* from the contract line, not re-entered.

## The red thread, rebalanced

Each stage dresses on exactly the one fact it is first to truly know — and never
a rollup:

```
product   → price + cadence           (10 000 /månad)   ← the dimension is born WITH the product
deal      → product + qty             (estimate: ARR)   ← inherits cadence, headlines a derived basis
quote     → term / binding            (36 mån)          ← the negotiation lever; TCV now derivable
contract  → term binding + cadence    (already fields)  ← confirmed, not re-typed
subscription → unit+interval+commit   (already fields)  ← born, not re-entered
```

The **same dimensioned line** `(Privat AI, 10 000, /månad, 36 mån)` travels the
whole chain and is *confirmed*, never rewritten. `value_cents` on deal/contract
becomes a derived cache, not a source of truth. No new number per stage — one
number, carried with its dimension. That is the balance: not front-heavy (we
don't force term at the deal — it's NULL until the quote), not back-heavy (price
isn't deferred to the contract — it rides in from the product).

## Invariants worth a guardrail

1. A monetary amount never travels without its cadence (product/line carry
   `recurrence`; a bare recurring amount is a bug).
2. `deals.value_cents` / `contracts.value_cents` are **derived caches** — the
   truth is the line facts + the derivation, recomputed, never hand-typed over.
3. The engine branches on `product.type` / `line.recurrence` only — never on a
   tenant-level "subscription business" flag. One pipeline, product-configured.

## Build order

- ✅ **Step 1 — shipped.** `products.billing_interval` + `default_term_months`, product-form cadence picker.
- ✅ **Step 2 — shipped.** `quotes.default_term_months`; per-line `recurrence`/`term_months` in the JSONB line shape; "Add from product" inheritance; MRR/one-time/term/TCV summary; `src/lib/recurring-value.ts` derivations.
- ✅ **Step 3 — shipped.** `sales_pipeline.deal_value_basis` site setting (`per_period`/`arr`/`tcv`, default ARR; select under Deals → Teams & templates); kanban card + table render via `dealHeadline` — a recurring deal shows e.g. "120 000 ARR · 10 000/mo", a one-time deal renders exactly as before. TCV falls back to ARR when no term is known.
- ✅ **Step 4 — shipped + live-proven.** The quote→contract prefill carries `deriveContractBilling(lines)` (single cadence kept; mixed normalises to monthly; one-time lines excluded), the binding term derives start/end dates visibly in the dialog, TCV becomes the agreement value, and both create paths write `billing_amount_cents`/`billing_interval` (billing_enabled stays the operator's dial). Verified live on optic: a 10 000/month contract with 36-month dates births a subscription `unit=10 000 · interval=month · commitment=36mo · provisioning · provider=contract`.
- ✅ **Step 5 — shipped.** One dimension per sum: `useDealStats` and `PipelineSummary` normalise every deal through `dealHeadline` (basis-keyed query cache, product facts joined) before anything is summed; one-time deals pass through unchanged. `manage_contract` instructions teach the MCP operator the same inheritance the UI got (per-period billing in its own cadence, term-derived dates, TCV as value, one-time items on the first invoice, billing_enabled = operator's dial) — synced to `agent_skills` on optic/liteit/www/demo and read back.

Original ordering, for reference:

1. `products.billing_interval` (+ default_term) + product-form cadence picker.
   Backfill: existing `recurring` products → `'month'` (safe, matches the telco
   data). One-time products untouched.
2. `quote_line_items.recurrence` (inherit from product on add) + `term_months`
   + quote `default_term_months`; quote summary block (MRR/one-time/term/TCV).
3. Deal `value_basis` + site setting for pipeline default; deal card shows the
   dimension.
4. Ensure `create_subscription_from_contract` maps the recurring line's cadence
   + term into the subscription (mostly wired; verify interval + commitment).
5. Guardrail tests for the three invariants + the four rollup formulas.

Steps 1–2 are the whole win; 3 is polish; 4 is verification of an existing seam.
```
