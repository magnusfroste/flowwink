# Benchmark landscape — who we measure against, beyond Odoo (2026-07)

> **Why this doc:** "mean parity 86%" measures our capability lists against
> **Odoo** — the broadest open-source suite and the right *suite-wide* yardstick.
> But per domain there are open-source "category kings" that set a higher or
> different bar than Odoo's corresponding app. This is the vetted map of which
> systems FlowWink's modules/processes correspond to, what each benchmark is
> good for, and the license discipline for borrowing. Web-verified 2026-07;
> pattern proven by `accounting-accounted.md` (the SE accounting reference).

## How to use this (the model)

1. **Odoo stays the primary suite benchmark** — the parity matrix doesn't change.
2. **Per module where a category king exists**, add a secondary reference card
   under `docs/parity/references/<module>-<system>.md` with a ranked gap list —
   exactly like `accounting-accounted.md`. Do this when a module approaches its
   Odoo ceiling (the card answers "what would a customer switching FROM the
   category king miss?").
3. **Sales language:** "an Odoo-class suite, with category-king depth in the
   places an SMB actually lives (booking, support, signing, billing)" — and the
   agentic layer on top, which none of the benchmarks have.
4. **License discipline (from the Accounted precedent):** AGPL/GPL systems =
   borrow the *feature set, workflows, and public standards* — never code.
   MIT/Apache systems = code borrowing possible with attribution, but prefer
   spec-level anyway to keep our architecture coherent.

## Suite-wide (the Odoo tier)

| System | License | Why it matters as a benchmark |
|---|---|---|
| **Odoo** (current primary) | LGPL core + proprietary EE | Broadest functional surface; our capability lists are derived from it |
| **ERPNext** (Frappe) | GPLv3 | The only 100% open-source full suite — strongest in manufacturing, HR/payroll and accounting depth; the natural "second opinion" when an Odoo capability is EE-only |
| **Dolibarr** | GPLv3 | The *simplicity* bar for micro-SMB (1–10 employees): one-hour setup, module toggles. Benchmarks our onboarding/first-hour experience, not feature depth |

## Per-domain category kings

| FlowWink module/process | Benchmark | License | What their bar teaches us |
|---|---|---|---|
| CRM / Lead-to-Customer | **EspoCRM** (mature, config-first) + **Twenty** (modern, ~45k★, momentum) | GPLv3 / AGPL | EspoCRM: 90% admin-panel configurability without forking. Twenty: data-model-first UX, developer-grade API — the bar for our MCP/skill surface story |
| CMS / Pages / blocks | **WordPress** (Gutenberg) | GPLv2 | The de-facto block-editor bar; our block system + AI compose is the differentiator, but Gutenberg defines visitor expectations |
| Blog / publishing + newsletter combo | **Ghost** | MIT | Publishing + built-in memberships/newsletter in one — benchmarks our blog↔newsletter seam |
| E-commerce / Order-to-Delivery | **WooCommerce** (SMB de facto) + **Medusa** (headless, module architecture) | GPLv3 / MIT | Woo: feature breadth an SMB shop expects. Medusa: clean commerce-module APIs (MIT — code-borrowable patterns) |
| Support-to-Resolution (chat-first) | **Chatwoot** | MIT | Conversation-first omnichannel inbox (email/WhatsApp/Telegram/IG) — exactly our multi-channel gap; MIT allows pattern lifting |
| Support (ticket/process-first) | **Zammad** | AGPL | Process control, SLA depth, omnichannel routing — benchmarks tickets+SLA+contact-center together |
| Support (lightweight) | **FreeScout** | AGPL | The "10 MB shared-inbox" simplicity bar; its extension catalog shows what SMBs bolt on first |
| Book-to-Meet | **Cal.com / Cal.diy** | ⚠️ core moved closed-source 2026; **Cal.diy** is the MIT community edition | THE scheduling feature bar: per-staff calendars, buffers, round-robin, routing forms, waiting lists — precisely our known gaps. Their closed-source pivot is also a *positioning gift*: FlowWink stays fully open |
| Newsletter / campaigns | **Listmonk** | AGPL | High-performance lists+campaigns+segmentation on one binary — benchmarks our newsletter module's send/segment depth |
| Marketing automation (bulk email + drip + consent) | **Mautic** | GPLv3 | Segments, drip builders, consent/preference center — the reference for our biggest marketing gap (crm bulk_email + consent_center) |
| Subscribe-to-Renew | **Lago** | AGPL | Usage-based metering, plans, coupons, dunning — the modern billing bar beyond our per-subscription invoicing (Kill Bill = the heavyweight alternative, Apache-2.0) |
| Quote-to-Cash: e-signing | **DocuSeal** (most feature-complete) + **Documenso** | AGPL both | Generic any-document signing (templates, audit trails, API) — the reference for generalizing our quote-sign machinery into Documents |
| Record-to-Report (SE) | **Accounted** (erp-mafia) | AGPL | Already adopted — see `accounting-accounted.md` |
| Hire-to-Retire | **Horilla** + **Frappe HR** | LGPL / GPLv3 | Recruitment→onboarding→attendance→payroll in one; Frappe HR benchmarks payroll structure depth |
| Projects / Quote-to-Cash delivery | **OpenProject** (classic) / **Plane** (modern) / **Leantime** (SMB-first) | GPLv3 / AGPL / AGPL | Gantt/baselines (OpenProject), modern issue UX (Plane), "for non-PM people" onboarding (Leantime) |
| KB / wiki / handbook | **BookStack** | MIT | The self-hosted docs bar: hierarchy (shelves/books/pages), permissions, revision diff — MIT, pattern-liftable. (Outline is BSL — not open source; don't cite it as OSS) |
| Surveys / forms | **Formbricks** | AGPL | In-product micro-surveys + link surveys with targeting — benchmarks surveys beyond our current form-first model |
| Analytics / visitor intelligence | **Matomo** (full) / **Plausible**, **Umami** (privacy-light) | GPLv3 / AGPL / MIT | Consent-friendly analytics bar; Umami (MIT) is pattern-liftable for our page_views pipeline |
| Register-to-Attend (paid events) | **pretix** (mature ticketing) / **Hi.Events** | Apache-2.0 / AGPL | Paid tickets, seat/quota management, check-in — our known webinars gap (paid tickets) has a spec-source here; pretix being Apache is code-borrowable |
| Automations | **Activepieces** (MIT) / n8n (⚠️ fair-code, NOT OSI) | MIT / — | Node-based automation UX bar; cite Activepieces as the open one, n8n only as market reference |
| Inventory (parts-level) | **InvenTree** | MIT | Part/stock tracking depth (BOM, suppliers, barcodes) for the light-manufacturing crowd |
| POS | Odoo POS (still the OSS bar) / ERPNext POS | — | No independent OSS category king; Odoo remains the reference |
| Field service | Odoo FSM (no OSS king) | — | Weak OSS category everywhere → opportunity: even L3 here is differentiating |

## What NONE of them have (our differentiator, keep saying it)

An autonomous operator (FlowPilot) + an outward MCP skill surface. Odoo/ERPNext
are adding AI *assistants*; none expose the whole business as ~465 typed,
trust-gated skills an external agent can run. Benchmarks above measure feature
floors — the agentic layer is what the comparison page should lead with.

## Suggested next reference cards (in order of module need)

1. `booking-calcom.md` — booking gaps (per-staff, buffers, waiting list) are
   already documented; formalize against the Cal.diy feature list
2. `newsletter-mautic-listmonk.md` — feeds the bulk-email + consent build
3. `esign-docuseal.md` — before generalizing quote signing into Documents
4. `subscriptions-lago.md` — usage-based billing when subscriptions pushes past 47%
5. `support-chatwoot-zammad.md` — contact-center is the lowest module (41%)
