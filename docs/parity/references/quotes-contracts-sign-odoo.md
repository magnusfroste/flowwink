---
title: "Odoo 18 reference — Quote → Contract → e-Signature"
cluster: quote-contract-sign (quotes, contracts, e-signature)
odoo_apps: ["Sales (sale, Community)", "Sign (Enterprise)"]
sources:
  - name: Odoo 18 docs — Sales quotations
    url: https://www.odoo.com/documentation/18.0/applications/sales/sales/sales_quotations/
    note: "send_quotations/* URLs now redirect to sales_quotations/*"
  - name: Odoo 18 docs — Sign
    url: https://www.odoo.com/documentation/18.0/applications/productivity/sign.html
    flag: docs-only   # Sign is Enterprise-only; no community source to verify behavior
  - name: Odoo community source, branch 18.0
    paths: [addons/sale/models/sale_order.py, addons/sale/controllers/portal.py]
date: 2026-07-04
---

# Odoo 18: Quote → Contract → e-Signature (offert → avtal → signering)

## 1. Process skeleton

**Documents:** one document — `sale.order` — is both the quotation and the order.
Odoo has no separate "contract" document for this flow; the signed quotation *is* the
agreement (standalone contracts are handled by the Sign app on arbitrary PDFs, §3).

**States** (`SALE_ORDER_STATE`, `addons/sale/models/sale_order.py` L41-46):
`draft` ("Quotation") → `sent` ("Quotation Sent") → `sale` ("Sales Order") → `cancel`.
Odoo 17+ replaced the old `done` state with a separate `locked` boolean (L93-97);
confirmed orders can auto-lock via the `sale.group_auto_done_setting` group
(`_should_be_locked`, L1183).

| Step | Actor | Transition / artifact |
|---|---|---|
| Create quotation (optionally from template) | salesperson | `draft`; lines, expiration date, online-confirmation flags |
| Send by email | salesperson | `action_quotation_sent` (`draft`→`sent` only, L1132); customer gets portal link with `access_token` |
| View / accept online | customer | portal page; signature and/or payment (see §2) |
| Confirm | system (on sign/pay) or salesperson | `action_confirm` requires state ∈ {draft, sent} (`_confirmation_error_message`, L1195); sets `sale`, optional confirmation email |
| Artifacts | system | quotation PDF re-rendered **with the signature** and posted to the record's chatter ("Order signed by …", `portal.py` L302-314); `signed_by`/`signed_on`/`signature` image stored on the order (sale_order.py L137-142); admin sees a "Customer Signature" tab ([get_signature_to_validate](https://www.odoo.com/documentation/18.0/applications/sales/sales/sales_quotations/get_signature_to_validate.html)) |
| Decline | customer | portal decline with mandatory message → `_action_cancel` + chatter message (`portal.py` L324-340) |

**Quotation templates** ([quote_template](https://www.odoo.com/documentation/18.0/applications/sales/sales/sales_quotations/quote_template.html)):
a template carries name, **Quotation Validity (days)**, **Confirmation Mail** (email
template sent on confirmation), invoicing journal, **Online Signature / Online Payment
flags (with prepayment %)**, and a Lines tab (products, drag-drop sections, notes) plus
optional products. Both signature and payment can be required simultaneously.

**Optional products** ([optional_products](https://www.odoo.com/documentation/18.0/applications/sales/sales/sales_quotations/optional_products.html)):
configured on the product form (Sales tab → Upsell & Cross-sell) and on quotation
templates; auto-suggested on quotes and in the e-commerce cart.

## 2. Customer-portal mechanics (the part FlowWink's accept-token maps to)

- **Link auth:** public route `/my/orders/<id>/accept` (`auth="public"`) guarded by a
  per-document `access_token` (`_document_check_access`, `portal.py` L274-281) —
  same shape as FlowWink's `accept_token`.
- **Signature gate:** `_has_to_be_signed()` = state ∈ {draft, sent} AND **not expired**
  AND `require_signature` AND no signature yet (sale_order.py L1980-1992).
- **Payment gate:** `_has_to_be_paid()` = state ∈ {draft, sent}, not expired,
  `require_payment`, amount > 0, confirmation amount not reached (L1993-2015).
  Prepayment: confirmation amount = `amount_total × prepayment_percent` (L2122-2125),
  so a quote can confirm on e.g. a 20% deposit
  ([get_paid_to_validate](https://www.odoo.com/documentation/18.0/applications/sales/sales/sales_quotations/get_paid_to_validate.html)).
- **Sign-and-pay in one step:** portal shows one "Sign & Pay" / "Accept & Pay" button →
  "Validate Order" popup: name auto-filled, signature via **Auto / Draw / Load**, then
  payment-method chooser if payment is also required
  ([get_signature_to_validate](https://www.odoo.com/documentation/18.0/applications/sales/sales/sales_quotations/get_signature_to_validate.html)).
  Accept writes `signed_by/signed_on/signature`; if no payment is due it calls
  `_validate_order()` (= confirmation) immediately (`portal.py` L288-300).
- **Expiry:** `validity_date` defaults from company "Default Quotation Validity" days
  (`_compute_validity_date`, L361-367); `is_expired` = draft/sent AND
  `validity_date < today` (L743-750). **An expired quote can no longer be signed or
  paid** — both gates check `not self.is_expired`. Expiry date is shown on the portal
  preview ([deadline](https://www.odoo.com/documentation/18.0/applications/sales/sales/sales_quotations/deadline.html)).
- **Notification:** the salesperson is "instantly notified" on online confirmation
  (docs, both signature and payment pages).

## 3. E-signature — Odoo Sign (Enterprise; `source: docs-only`)

All claims from [sign.html](https://www.odoo.com/documentation/18.0/applications/productivity/sign.html); no community source exists.

**Table stakes** (SMB-relevant core):
- Upload any PDF, place fields; fields auto-fill from partner data.
- **Roles**: each field belongs to a role (Customer, Company…); a request maps roles → real people.
- **Field types**: Signature / Initials (draw, auto-generate, or upload image), Text,
  Multiline Text, Checkbox, Selection.
- **Sequential signing order**: toggle "Specify Signing Order" with numeric order; each
  recipient is notified only after the previous one signed.
- **Templates** for recurring documents; **validity deadline + automatic email reminders**
  at a configurable interval.
- **Audit trail / legality**: a hash "to ensure traceability, integrity, and
  inalterability", visual security frame on signatures, timestamped access logs;
  produces *simple electronic signatures* under eIDAS and US ESIGN/UETA.

**Enterprise extras** (candidate non-goals): SMS identity verification and itsme®
(BE/NL only), both consuming IAP credits; qualified/advanced signature levels.

## 4. Gap table — Odoo capability → FlowWink status → recommendation

FlowWink side: `docs/parity/capabilities/quotes.json`, `contracts.json`,
`supabase/functions/quote-sign/index.ts`, `contract-sign/index.ts`,
`src/pages/PublicQuotePage.tsx`, `PublicContractPage.tsx`.

| Odoo capability | FlowWink today | Recommendation |
|---|---|---|
| Quote state machine draft→sent→sale→cancel (+lock) | `quotes#lifecycle` done (draft/sent/viewed/accepted/rejected) | **verify** — states align; no lock equivalent needed for SMB |
| Templates with validity-days, confirmation mail, sign/pay flags | `quotes#templates` done | **verify** template carries default validity + confirmation-email choice |
| Expired quote **cannot** be signed/paid | `quote-sign` checks only `status ∈ {sent,viewed}` — no `valid_until` check (index.ts L62) | **build** (small): reject accept when `valid_until < now`, mirroring `is_expired` |
| Expiry shown + reminder before deadline | `quotes#expiry_reminders` partial (sweep exists, unverified) | **verify** (Stage-3) |
| Portal signature Auto/**Draw**/Load | Endpoints accept `signature_data` (any payload + IP/UA → `quote_signatures`/`contract_signatures`), but both public pages send **typed name only** (PublicQuotePage.tsx L105) | **build** (small): draw-pad + optional typed, store image. Reframe `quotes#esignature` / `contracts#esignature_integration` — native signing largely exists; the gap is capture UI + evidence artifact, not a provider |
| Signed PDF artifact attached to the record | None — acceptance stored as DB rows + audit_logs only | **build**: render signed quote/contract PDF (signature + timestamp + IP) and store in document storage |
| Sign-and-pay (incl. prepayment %) confirms order | Accept auto-creates **draft invoice** (quote-sign L117-176) but no payment step | **build later** (P1-adjacent): offer pay-now link (create-checkout exists) after accept; prepayment % optional |
| Salesperson notified instantly | Done — admin email on accept/reject (quote-sign L217-243) | **verify** only |
| Auto-invoice from accepted agreement | `contracts#auto_invoicing` missing — but quote-sign already auto-invoices | **verify/reframe** for quotes; contracts recurring invoicing stays open |
| Customer portal list of own quotes/orders (`/my/orders`) | `quotes#customer_portal` missing (account portal exists) | **build** — small, high SMB trust value |
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
