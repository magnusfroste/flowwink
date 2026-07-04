---
title: Process Coverage Sweep — do docs/processes/ cover what FlowWink supports?
date: 2026-07-04
category: concepts
status: proposal
---

# Process Coverage Sweep

**Question (product owner):** does `docs/processes/` cover the processes FlowWink
supports today? Odoo is the inspiration — world-class at taking complex process
management to something simple, yet flexible without added complexity.

**Verdict in one line:** 11 processes documented · **3 undocumented but demonstrably
supported** (booking flow, event/webinar flow, campaign-to-lead) · **process-gaps.md
and 4 of the 11 docs are stale** against code shipped 2026-06-12 → 2026-07-03.

---

## § Findings

### F1 — Inventory: 11 documented, 8 proposed/gap

Documented ([docs/processes/README.md](../processes/README.md), core table):
`lead-to-customer` (L4) · `quote-to-cash` (L3) · `procure-to-pay` (L3) ·
`order-to-delivery` (L3) · `hire-to-retire` (L3) · `content-to-conversion` (L4) ·
`record-to-report` (L3) · `support-to-resolution` (L3) · `subscribe-to-renew` (L3) ·
`return-to-refund` (L3) · `acquire-to-retire` (L3).

Proposed in [process-gaps.md](process-gaps.md): P1 subscribe-to-renew ✅shipped ·
P2 return-to-refund ✅shipped · P3 plan-to-produce · P4 forecast-to-stock ·
P5 campaign-to-lead · P6 acquire-to-retire ✅shipped · P7 forecast-to-plan (opt) ·
P8 register-to-attend (opt).

### F2 — Module→process matrix (declared in manifests)

All 66 files in `src/lib/modules/*-module.ts` declare `processes:`. Aggregated:

| Process | # modules | Declaring modules |
|---|---|---|
| lead-to-customer | 16 | booking, browser-control, calendar, chat, companies, company-insights, crm, customer360, deals, forms, newsletter, sales-intelligence, surveys, voice, webmeet, webinars |
| content-to-conversion | 13 | analytics, blog, browser-control, docs, global-blocks, growth, kb, media, newsletter, pages, products, site-migration, webinars |
| hire-to-retire | 11 | calendar, contracts, documents, expenses, handbook, hr, payroll, recruitment, resume, timesheets, wiki |
| order-to-delivery | 11 | documents, field-service, inventory, maintenance, manufacturing, pos, pricelists, products, returns, shipping, sla |
| quote-to-cash | 10 | accounting, contracts, deals, invoicing, multi-currency, pricelists, projects, quotes, subscriptions, timesheets |
| support-to-resolution | 10 | analytics, chat, customer360, field-service, kb, live-support, sla, surveys, tickets, voice |
| procure-to-pay | 9 | accounting, approvals, documents, expenses, inventory, invoicing, manufacturing, purchasing, reconciliation |
| record-to-report | 9 | accounting, analytics, expenses, fixed-assets, invoicing, multi-currency, payroll, pos, reconciliation |
| **subscribe-to-renew** | **0** | — |
| **return-to-refund** | **0** | — |
| **acquire-to-retire** | **0** | — |
| *(empty array)* | 9 | composio, developer, email, federation, flowpilot, flowtable, river, templates, workspace-chat |

**(a) Declared but undocumented:** none in manifests — the vocabulary is closed to
the original 8. BUT the roadmap already uses two process ids that have neither doc
nor manifest entry: EPIC-06 serves "content-marketing / **campaign-to-lead**" and
EPIC-08 serves "**plan-to-produce**" ([roadmap.md](roadmap.md) § Round R1 table).

**(b) Documented but declared by zero modules:** the three processes shipped
2026-06-12 (`subscribe-to-renew`, `return-to-refund`, `acquire-to-retire`) were never
back-propagated into manifests. `subscriptions-module.ts:297` still declares
`['quote-to-cash']`, `returns-module.ts:203` → `['order-to-delivery']`,
`fixed-assets-module.ts:135` → `['record-to-report']` — exactly the remap that
process-gaps.md's own "Tell-tale" table called for. Consequence: any future
auto-generated coverage page (README footer's stated plan) would show three
documented processes as having no participating modules.

**(c) Empty `processes: []` but clearly participating (judgment, flagged only):**
- `email` (`email-module.ts:269`) — carries dunning, order/booking confirmations,
  and is an EPIC-05 mover for quote-to-cash (email 40→60, roadmap.md). Defensible
  as infrastructure, but it is the delivery rail of ≥4 processes.
- `templates` (`templates-module.ts:52`) — in the EPIC-06 content cluster
  (templates 50→90) yet declares no process; `content-to-conversion` fits.
- `flowpilot`, `composio`, `federation`, `developer`, `workspace-chat`, `river`,
  `flowtable` — genuinely cross-cutting/internal; empty is correct.

### F3 — Odoo taxonomy cross-check: supported in code, no process doc

Odoo 18's suite confirmed (odoo.com/documentation/18.0): Appointments/Calendar
(Productivity), Events + Marketing Automation/Email/SMS/Social + Surveys
(Marketing), Helpdesk + Field Service (Services), Subscriptions, Expenses, VoIP.
Mapping against FlowWink code:

| Candidate process | Odoo counterpart | FlowWink evidence | Verdict |
|---|---|---|---|
| **Booking / appointment flow** | Appointments + Calendar | `booking` L3, 59% parity, 19 caps, EPIC-05 (duration_rules Stage-3 verified, parity-matrix.md); booking-reminder edge function (commit 34fb7a3e); SLA monitors booking confirmations (`sla-module.ts:167`); voice module ships a booking-IVR (`voice-module.ts:110`); webmeet handles the resulting consultation. [lead-to-customer.md](../processes/lead-to-customer.md) never mentions booking despite the manifest declaration | **Undocumented, supported. Doc it.** |
| **Register-to-Attend (events/webinars)** | Events | `webinars` L3 at **78% parity** — 5th highest scored module (parity-matrix.md); "Plan, promote, run and follow up — lifecycle, lead-loop, reminders and content-loop" (`webinars-module.ts:218`). P8 deferred it as "webinars exists but thin" — **premise now false** | **Undocumented, supported. Doc it.** |
| **Campaign-to-Lead** | Marketing Automation / Email / SMS / Social | `growth` benchmarked *against* "Marketing Automation + Social Marketing" at 64%; `newsletter` L4; `forms` 100%; EPIC-06 already names the process | **Half-exists; see Proposal (merge question).** |
| Voice / receptionist intake | VoIP | `voice` is **L1, unscored** (parity-matrix "Unscored: 3") | Too early — no doc yet. |
| In-store sale (POS session→receipt→Z) | Point of Sale | `pos` L3 44%, mapped to order-to-delivery + record-to-report | Fold into order-to-delivery; no own doc. |
| Field-service visit flow | Field Service | `field-service` L2 44% | Too early; revisit at L3. |

### F4 — Staleness audit (docs vs code shipped since they were written)

**process-gaps.md:** header says "8 core processes" — it is 11, contradicted by its
own ✅-shipped markers. P7's "needs net-new budgeting model" is stale: budgets +
`budget_vs_actual` exist in `accounting-module.ts` (~lines 448–466) and EPIC-08
ships the budgets admin UI. P3's blocker `manufacturing#work_centers_routing` is
now *partial* (engine shipped June wave; matrix row → EPIC-08). P8's premise stale
(F3 above).

**Commit 74187584 (2026-07-02) "close top-3 process gaps — pay_vendor_invoice,
prepare_vat_return, manage_winback_campaign"** never reached the docs:
- [record-to-report.md](../processes/record-to-report.md):57,64 still says
  "Tax reporting ❌ Missing" — `prepare_vat_return` is live
  (`accounting-module.ts:35`).
- [subscribe-to-renew.md](../processes/subscribe-to-renew.md) skills table lacks
  `manage_winback_campaign` (`subscriptions-module.ts:129`).
- [procure-to-pay.md](../processes/procure-to-pay.md) agent table lacks
  `pay_vendor_invoice` (`purchasing-module.ts:36`).

**quote-to-cash.md is the most stale doc.** Three "❌" gaps are shipped features:
versioned price lists (`pricelists` module L3, "Odoo-style price lists",
`pricelists-module.ts:134`), multi-currency invoices (`multi-currency` module,
`multi-currency-module.ts:126`), invoice approval thresholds (`approvals` at 100%
parity, "Used by Purchasing, Expenses, Invoicing and Quotes",
`approvals-module.ts:293`). And its flow *starts at "Deal won"* — the entire
quote→e-sign→**sign-and-pay/prepayment** front (commit b45b3318, 2026-07-03:
Pay-now on accepted quotes, `prepayment_pct` deposits, signature certificates,
expiry gate — `quotes-module.ts:106`) is absent.

**README.md footer** ("Once `defineModule()` gains `processes` + `maturity`
metadata we can auto-generate…") is stale — all 66 manifests already carry both.

---

## § Proposal — the Odoo lesson, applied

Odoo's genius is one repeated skeleton — *documents → states → postings* — behind
every app; its failure mode is surface area (every option a visible knob). The 11
docs already encode the FlowWink answer: a fixed short template, honest L-levels,
and **"Best for / Not for"** as an explicit complexity valve. The new adopter layer
(work story → state machines → who-does-what → coming-from-spreadsheets) is the
right progressive-disclosure mechanism: simple story first, exact transition
effects for those who need them, statuses documented in exactly one place. Extend
that pattern; do not invent a new one.

**Add NOW (SMB-priority per program-80 tiers):**
1. **`book-to-meet`** (booking/appointment flow) — P2-tier module, L3, big shipped
   surface (F3), zero doc home; the single most common SMB "first process"
   (consultants, clinics, agencies). Modules: booking, calendar, email, sla,
   webmeet, voice(IVR), crm.
2. **`register-to-attend`** (promote → register → remind → attend → follow-up →
   lead) — promote P8; webinars at 78% makes this the cheapest doc-for-value on
   the board. Modules: webinars, newsletter, forms, crm, calendar.
3. **`campaign-to-lead`** — but as **one lane inside content-to-conversion, not a
   new doc yet.** The Odoo split (Email/SMS/Social/Automation as four apps) is
   exactly the complexity we refuse. Today the channels are newsletter + paid
   growth — already in content-to-conversion's module table. Split it out only
   when `sms-marketing`/`social-marketing` exist (breadth backlog). Until then,
   retitle content-to-conversion's scope line to own the campaign story and give
   EPIC-06's "campaign-to-lead" label a real target.

**Explicitly NOT now (dated non-goals, mirroring program-80's non-goal rule):**
plan-to-produce and forecast-to-stock (P3-tier, gated on EPIC-02; keep as gaps),
forecast-to-plan (defer until EPIC-08 budget UI lands, then it is cheap),
voice-intake (L1), field-service visit flow (L2), a POS process (fold into
order-to-delivery).

**Merge/split/rename among the 11:** no merges. Keep quote-to-cash and
subscribe-to-renew separate (one-shot vs recurring revenue — different state
machines, and each doc's "Not for" already points at the other). Lead-to-customer
stays one doc but its module table (6 rows) must catch up to its 16 declaring
modules — booking/chat/webinars/surveys/voice are its intake channels.

**Adopter-layer rollout order (next 3 after procure-to-pay § Expenses):**
1. **quote-to-cash** — the most coupled state machines in the product (quote
   draft→approval→sent→accepted/expired × invoice draft→partially-paid→paid ×
   sign-and-pay), and the transitions have non-obvious effects (accept auto-creates
   a draft invoice; Pay-now charges `prepayment_pct`; stripe-webhook accumulates
   `paid_amount_cents`). Brand-new (2026-07-03) and completely undocumented — write
   the adopter layer while fixing F4's stale gaps in one pass.
2. **return-to-refund** — the transition semantics that confuse operators most
   (CLAUDE.md ships a "gotchas" section for exactly this: partial refunds
   accumulate, restocking fee only settable in `received` via `inspect_return`,
   close on Σ or `p_final`). The doc is 42 lines; the state table is the missing
   half.
3. **subscribe-to-renew** — three coupled machines (subscription × cycle invoice ×
   winback campaign), proration credits vs adjustment invoices, and the strongest
   coming-from-spreadsheets story (the renewal-tracking Excel every SMB has).

---

## § Suggested next actions (smallest first)

1. Fix stale one-liners: process-gaps.md header 8→11; delete README.md's stale
   auto-generate footer sentence (manifests already have the metadata).
2. Back-propagate the three shipped process ids into manifests:
   `subscriptions-module.ts` +`subscribe-to-renew`, `returns-module.ts`
   +`return-to-refund`, `fixed-assets-module.ts` +`acquire-to-retire`; add
   `content-to-conversion` to `templates-module.ts`.
3. Patch the three 2026-07-02 skill ships into their docs (`prepare_vat_return`,
   `pay_vendor_invoice`, `manage_winback_campaign`) — three table rows.
4. Rewrite quote-to-cash.md: remove the three shipped "❌" gaps, add the
   quote→sign→pay front to the flow, and write its adopter layer (rollout #1).
5. Write `docs/processes/book-to-meet.md` and `register-to-attend.md` using the
   existing template + adopter layer; update process-gaps.md (promote P8, mark P5
   as "lane in content-to-conversion until SMS/social modules exist").
6. Adopter layers for return-to-refund and subscribe-to-renew (rollout #2, #3).
7. When EPIC-08's budget UI ships, reassess P7 with the now-existing engine.
