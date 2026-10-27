---
title: "Odoo 18 reference — Quote → Contract → e-Signature"
cluster: quote-contract-sign (quotes, contracts, e-signature)
odoo_apps: ["Sales (Community)", "Sign (Enterprise)"]
sources:
  - name: Odoo 18 docs — Sales quotations
    url: https://www.odoo.com/documentation/18.0/applications/sales/sales/sales_quotations/
    note: "send_quotations/* URLs now redirect to sales_quotations/*"
  - name: Odoo 18 docs — Sign
    url: https://www.odoo.com/documentation/18.0/applications/productivity/sign.html
date: 2026-07-04
source: docs-only (public functional documentation)
description: In Odoo's sales flow the signed quotation is itself the agreement — there is no separate contract document; standalone contracts go through the Sign app on arbitrary PDFs (§3).
category: parity
---

# Odoo 18: Quote → Contract → e-Signature (offert → avtal → signering)

> Functional benchmark notes from Odoo's public documentation. No Odoo code or
> text is reused in FlowWink. See
> [`../../contributing/benchmarking-policy.md`](../../contributing/benchmarking-policy.md).

## 1. Process skeleton

**Documents:** one sales order document is both the quotation and the order.
There is no separate "contract" document in this flow; the signed quotation *is* the
agreement (standalone contracts are handled by the Sign app on arbitrary PDFs, §3).

**Statuses:** Quotation → Quotation Sent → Sales Order → Cancelled. Recent versions
have no "done" status; locking a confirmed order against edits is a separate setting,
which can be applied automatically on confirmation.

| Step | Actor | Transition / artifact |
|---|---|---|
| Create quotation (optionally from template) | salesperson | Quotation; lines, expiration date, online-confirmation options |
| Send by email | salesperson | Quotation Sent; customer gets a private portal link |
| View / accept online | customer | portal page; signature and/or payment (see §2) |
| Confirm | system (on sign/pay) or salesperson | only a quotation (sent or not) can be confirmed; becomes a Sales Order, optional confirmation email |
| Artifacts | system | the quotation PDF is regenerated **with the signature** and logged on the record; signer name, date and signature image are stored on the order; admin sees the customer signature on the order ([get_signature_to_validate](https://www.odoo.com/documentation/18.0/applications/sales/sales/sales_quotations/get_signature_to_validate.html)) |
| Decline | customer | portal decline with a mandatory message → quotation cancelled, message logged |

**Quotation templates** ([quote_template](https://www.odoo.com/documentation/18.0/applications/sales/sales/sales_quotations/quote_template.html)):
a template carries a name, a validity period in days, a confirmation email, an
invoicing journal, **online signature / online payment options (with a prepayment
percentage)**, and lines (products, sections, notes) plus optional products. Signature
and payment can both be required at once.

**Optional products** ([optional_products](https://www.odoo.com/documentation/18.0/applications/sales/sales/sales_quotations/optional_products.html)):
configured per product and on quotation templates; suggested on quotes and in the
e-commerce cart.

## 2. Customer-portal mechanics (the part FlowWink's accept-token maps to)

- **Link auth:** the customer opens the quotation through a private link that carries
  a per-document access token — the same shape as FlowWink's `accept_token`.
- **Signature gate:** a signature is asked for only while the document is still a
  quotation, **not expired**, requires a signature, and is not yet signed.
- **Payment gate:** payment is asked for only while the document is still a
  quotation, not expired, requires payment, has an amount above zero, and the
  required amount has not been paid. With a prepayment percentage the quote confirms
  on a deposit, e.g. 20%
  ([get_paid_to_validate](https://www.odoo.com/documentation/18.0/applications/sales/sales/sales_quotations/get_paid_to_validate.html)).
- **Sign-and-pay in one step:** the portal offers one combined accept button; the
  customer's name is pre-filled, the signature can be generated, drawn or uploaded,
  then a payment method is chosen if payment is also required
  ([get_signature_to_validate](https://www.odoo.com/documentation/18.0/applications/sales/sales/sales_quotations/get_signature_to_validate.html)).
  If no payment is due, signing confirms the order immediately.
- **Expiry:** the expiration date defaults from a company-wide validity period.
  **An expired quote can no longer be signed or paid.** The expiry date is shown on
  the portal preview ([deadline](https://www.odoo.com/documentation/18.0/applications/sales/sales/sales_quotations/deadline.html)).
- **Notification:** the salesperson is notified as soon as the customer confirms
  online (docs, both signature and payment pages).

## 3. E-signature — Odoo Sign (Enterprise; docs only)

All claims from [sign.html](https://www.odoo.com/documentation/18.0/applications/productivity/sign.html).

**Table stakes** (SMB-relevant core):
- Upload any PDF, place fields; fields auto-fill from contact data.
- **Roles**: each field belongs to a role (customer, company…); a request maps roles to real people.
- **Field types**: signature / initials (drawn, generated or uploaded), text,
  multi-line text, checkbox, selection.
- **Sequential signing order**: optional numbered order; each recipient is notified
  only after the previous one has signed.
- **Templates** for recurring documents; **validity deadline + automatic email reminders**
  at a configurable interval.
- **Audit trail / legality**: a document hash for traceability and tamper evidence, a
  visual frame on signatures, timestamped access logs; the result is a *simple
  electronic signature* under eIDAS and US ESIGN/UETA.

**Enterprise extras** (candidate non-goals): SMS identity verification and itsme®
(BE/NL only), both consuming paid credits; qualified/advanced signature levels.

## 4. Gap table — Odoo capability → FlowWink status → recommendation

FlowWink side: `docs/parity/capabilities/quotes.json`, `contracts.json`,
`supabase/functions/quote-sign/index.ts`, `contract-sign/index.ts`,
`src/pages/PublicQuotePage.tsx`, `PublicContractPage.tsx`.

| Odoo capability | FlowWink today | Recommendation |
|---|---|---|
| Quote state machine draft→sent→sale→cancel (+lock) | `quotes#lifecycle` done (draft/sent/viewed/accepted/rejected) | **verify** — states align; no lock equivalent needed for SMB |
| Templates with validity-days, confirmation mail, sign/pay flags | `quotes#templates` done | **verify** template carries default validity + confirmation-email choice |
| Expired quote **cannot** be signed/paid | `quote-sign` checks only `status ∈ {sent,viewed}` — no `valid_until` check (index.ts L62) | **build** (small): reject accept when `valid_until < now` (same rule as the benchmark) |
| Expiry shown + reminder before deadline | `quotes#expiry_reminders` partial (sweep exists, unverified) | **verify** (Stage-3) |
| Portal signature Auto/**Draw**/Load | Endpoints accept `signature_data` (any payload + IP/UA → `quote_signatures`/`contract_signatures`), but both public pages send **typed name only** (PublicQuotePage.tsx L105) | **build** (small): draw-pad + optional typed, store image. Reframe `quotes#esignature` / `contracts#esignature_integration` — native signing largely exists; the gap is capture UI + evidence artifact, not a provider |
| Signed PDF artifact attached to the record | None — acceptance stored as DB rows + audit_logs only | **build**: render signed quote/contract PDF (signature + timestamp + IP) and store in document storage |
| Sign-and-pay (incl. prepayment %) confirms order | Accept auto-creates **draft invoice** (quote-sign L117-176) but no payment step | **build later** (P1-adjacent): offer pay-now link (create-checkout exists) after accept; prepayment % optional |
| Salesperson notified instantly | Done — admin email on accept/reject (quote-sign L217-243) | **verify** only |
| Auto-invoice from accepted agreement | `contracts#auto_invoicing` missing — but quote-sign already auto-invoices | **verify/reframe** for quotes; contracts recurring invoicing stays open |
| Customer portal list of own quotes/orders | `quotes#customer_portal` missing (account portal exists) | **build** — small, high SMB trust value |
| Optional products upsell on quote | Not in scorecard | **non-goal for this cluster** (2026-07-04) — belongs to e-commerce cluster if anywhere |
| Sign: roles + sequential N-party signing | Single external signer per document | **build minimal**: two-party (customer + company countersign) is the SMB contract norm; N-party sequential = non-goal (enterprise-scale, 2026-07-04) |
| Sign: request reminders + request expiry | Nothing for contracts (quotes sweep exists) | **build** (small): reuse quote-expiry-reminders pattern for `pending_signature` contracts |
| Sign: hash/tamper-evidence + legality summary page | IP/UA/timestamp rows exist; no content hash, no customer-facing certificate | **build** (small): SHA-256 of signed content in signature row + printable "signature certificate" |
| Sign: PDF field placement (drag fields onto PDF) | Contracts use markdown templates + token substitution (`contracts#templates_tokens`) | **non-goal** (2026-07-04) — token templates fit agent-generated contracts better than pixel field placement |
| Sign: SMS / itsme® ID verification, qualified signatures | None | **non-goal / integration-only** (2026-07-04) — for Swedish market, BankID via a provider (Scrive/Criipto) if a customer demands it; never build in-house |

## 5. SMB lens (per program-80.md)

Minimal skeleton an SMB (offert → avtal → signering) actually needs — all of which
Odoo treats as the *free Community* portal flow, not the Enterprise Sign app:
**token link → view tracking → expiry enforced at accept → draw/typed signature →
instant confirm + auto-invoice → signed PDF + audit trail → admin notified**.
FlowWink already has ~5 of 7; the real gaps are **expiry enforcement at signing time,
a draw-signature capture UI, and a durable signed-PDF/certificate artifact**.
Everything Odoo gates behind Enterprise Sign (N-party sequential, ID verification,
field placement) is a non-goal or integration-only. Simple electronic signature with
timestamped logs is Odoo's own legal baseline (eIDAS "simple") — matching that, not
exceeding it, is the target.
