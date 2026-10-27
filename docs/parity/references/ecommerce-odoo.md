---
title: "Odoo reference card — eCommerce / order flow"
module: ecommerce
odoo_apps: "Website eCommerce + Sales"
odoo_version: "18.0"
source: docs-only (public functional documentation)
date: 2026-07-04
description: Grounding card for the FlowWink ecommerce module (P1 cluster). 
category: parity
---

# Odoo 18 eCommerce + Sales — order-flow reference card

> Functional benchmark notes from Odoo's public documentation. No Odoo code or
> text is reused in FlowWink. See
> [`../../contributing/benchmarking-policy.md`](../../contributing/benchmarking-policy.md).

Grounding card for the FlowWink `ecommerce` module (P1 cluster). Sources:

- Docs root: https://www.odoo.com/documentation/18.0/applications/websites/ecommerce.html
  (sub-pages: `products`, `checkout`, `payments`, `shipping`, `order_handling`,
  `b2b_b2c`, `customer_accounts`, `performance`)
- Discounts/loyalty: https://www.odoo.com/documentation/18.0/applications/sales/sales/products_prices/loyalty_discount.html

## 1. Process skeleton (documents → states → actors)

```
Visitor adds to cart ──► sales order, status "Quotation"            [visitor]
Checkout: address + delivery method + extra info ──► still quotation [visitor]
Payment initiated ──► "Quotation Sent", payment pending              [visitor + payment provider]
Payment confirmed ──► confirmed ──► "Sales Order"                    [provider webhook / system]
  ├─► delivery order (stock picking) auto-created                    [warehouse/shop owner]
  │     pick → pack → label → ship; optional "shipped" email on done
  └─► invoice: automatic on payment (Automatic Invoice setting)
        or on-demand from the order                                  [system / admin]
Cancel path: "Cancelled" at any pre-confirmation point              [admin]
```

- **The cart IS the order document.** Adding to cart creates a sales order in
  quotation status; checkout and payment only advance its status — there is no
  separate cart entity. (order_handling docs)
- **Statuses**: Quotation → Quotation Sent → Sales Order → Cancelled. Recent
  versions have no separate "done" status; locking a confirmed order against
  edits is a separate setting, not a status.
- Delivery and invoicing are **separate documents spawned from the order**
  (delivery order on confirm; invoice auto or on-demand), not extra order
  states. (order_handling docs)

## 2. Checkout flow (…/ecommerce/checkout.html)

Steps, in order: **Review Order** (cart: quantities, prices, taxes) →
**Delivery** (delivery + billing address, shipping-method selection) →
**Extra Info** (optional configurable form step) → **Payment** →
**Order Confirmation** (summary page).

Configuration surface:
- **Guest vs sign-in**: guests checkout with email + address; "mandatory
  sign-in" policy available (B2B); signed-in customers pick saved addresses.
- Optional toggles (website editor): promo-code field, suggested accessories,
  wishlist/"save for later", **B2B fields (VAT, company name)**, newsletter
  opt-in checkbox, mandatory Terms & Conditions acceptance, **express checkout
  buttons** for supported providers.
- Add-to-cart behavior: stay on page / go to cart / dialog.

## 3. Payment (…/ecommerce/payments.html)

- Providers enabled per website: Stripe, PayPal, Adyen, Mollie, Authorize.Net, Razorpay, Worldline, etc.,
  plus wire transfer / SEPA direct debit; customer picks provider at the
  final confirm step.
- Also: eWallets and gift-card codes as tender (via the Discounts, Loyalty &
  Gift Card feature).
- Payment confirmation is what turns the quotation into a confirmed sales order
  (order_handling docs).

## 4. Delivery choice at checkout (…/ecommerce/shipping.html)

- Delivery methods shown at the Delivery step: **fixed price**, **rule-based**
  (e.g. free shipping over a threshold), or **carrier-computed rates** via
  connectors (FedEx, UPS, DHL, Sendcloud…), with optional margin/fee on top.
- Carrier connectors also generate labels + tracking; methods can be limited
  per website / destination / order content, and toggled test vs production.
- **Click & Collect**: reserve online, pay/collect in store, per-warehouse
  location selector with optional stock visibility.

## 5. Order handling, emails, abandoned carts (…/ecommerce/order_handling.html)

- **Confirmation email** on payment/order confirmation; optional second
  "shipped" email when the delivery transfer is done (Inventory setting).
- **Abandoned carts**: an unpaid cart with contact info counts as abandoned
  after a configurable per-website delay; an automated recovery email with
  configurable delay + template is sent once per cart. Requires the visitor to
  be logged in or to have left an email.
- **Returns/refunds**: customer submits a return via portal form; full refund
  from the order UI when the payment provider supports it.

## 6. Customer portal (…/ecommerce/customer_accounts.html)

Logged-in customers ("My Account") see: **quotations, orders, invoices**, and
other documents in one place; portal page customizable. Account creation is
**free sign-up** or **on invitation** (B2B gating; admin "Grant portal access"
action). Delivery tracking links surface on orders when carrier connectors
are used (shipping docs).

## 7. Product page (…/ecommerce/products.html)

- **Variants**: attribute-based; shown as a product list or as selectable
  options composing the variant on the product page.
- Multiple images (carousel/grid, zoom), stock display ("X left" under a
  threshold; "Continue selling" allows overselling), digital files delivered
  pre- or post-payment via the portal, cross-sell (accessories at cart) and
  upsell (alternatives on page).

## 8. B2B/B2C price display (…/ecommerce/b2b_b2c.html)

- **B2C: tax-included prices; B2B: tax-excluded** — a shop-wide display
  setting; product page can label "VAT incl./excl.".
- B2B extras: hide prices from anonymous visitors, invitation-only accounts,
  VAT/company fields at checkout, per-customer pricelist on approval.
- Odoo recommends **separate websites** for mixed B2B+B2C (a pricelist binds
  to one website) — this is multi-website machinery, not SMB core.

## 9. Promotions (…/sales/products_prices/loyalty_discount.html)

Six program types: coupons, loyalty cards, **promotions** (conditional rules),
**discount codes**, buy-X-get-Y, next-order coupons. Codes entered at
checkout; conditions (min quantity/spend, product/category scope) gate rewards
(percent/fixed discount, free product, free shipping). Shared across
Sales/eCommerce/POS.

## 10. SMB lens — what a small shop actually needs

**Core (parity targets):** product page with variant selection; cart → guest
checkout (address → delivery choice → pay); at least one real card provider
(Stripe) + manual wire-transfer fallback; order state machine with a paid/
confirmed transition driven by the provider webhook; confirmation email;
order list + fulfillment for the admin; customer order status/history in a
portal; a simple discount-code mechanism; abandoned-cart recovery email
(cheap, high-ROI for SMB); tax-incl vs tax-excl display toggle; flat-rate +
free-over-threshold delivery pricing; order → invoice generation.

**Enterprise extras → non-goal candidates for FlowWink:**
- Multi-website / website-scoped pricelists & providers (single-tenant
  FlowWink = one site by design).
- Full loyalty stack (points cards, eWallets, gift cards, buy-X-get-Y) —
  a plain discount code covers the SMB case.
- Cross-border tax engines (AvaTax-class), fiscal-position matrices.
- Native carrier rate connectors (FedEx/UPS/DHL live rating) — SMB depth per
  program-80: rates/labels via integration, tracking links, not WMS/rating.
- Click & Collect with multi-warehouse stock selectors.
- Express-checkout wallet buttons (Google Pay/Apple Pay) — nice-to-have, not
  gating.
