# Process catalog review — vs Odoo, through SMB eyes (2026-07-05)

> **What is this?** A structured review of `docs/processes/` against Odoo's
> process landscape, asking two questions: (1) what can be *described better*
> in the docs we have, and (2) which processes is an SMB going to ask about
> that we don't document (or don't have)? Findings are ordered by SMB impact.
> Staleness fixes identified here were applied in the same commit; the rest
> is backlog with a recommendation each.

---

## 1. Processes we HAVE but didn't document (found by this review)

The platform verifiably runs these; the process catalog was silent about them.
For a sales conversation that's the worst kind of gap — we undersell running
capability.

| Missing doc | Evidence it exists | Action |
|---|---|---|
| **Plan-to-Produce** (manufacturing) | 13 skills (BOM, MO lifecycle, work centers, routing, MRP reorder, procurement trigger); the full PO → goods receipt → MO → complete → finished-goods-stock chain was run uncoached by an external operator | ✅ **Doc written** ([plan-to-produce.md](./plan-to-produce.md)) |
| **Sell-to-Settle** (POS day cycle) | `open_pos_session` → `record_pos_sale(_v2)` (+tips, gift cards) → `close_pos_session(_v2)` with staged-operation guard into the ledger | ❌ Doc pending — the POS day (open → sell → count → close → books) is a real process for retail/café/salon SMBs, and ours ends in a balanced journal entry, which Odoo POS also does but spreadsheet-POS users never have |
| **Dispatch-to-Invoice** (field service) | `manage_service_order`, `create_invoice_from_service_order`, `invoice_completed_service_orders` | ❌ Doc pending — thin module (no scheduling board), but the invoice bridge is the part SMB installers/electricians care about; document honestly as L2/L3 |
| **Payroll runs** (inside Hire-to-Retire) | `create_payroll_run` → `approve_payroll_run` → `mark_payroll_paid`, `calc_sick_pay`, `apply_pension`, `list_payroll_lines` | ✅ **Fixed** — hire-to-retire.md claimed "Payroll ❌ Missing"; it now documents the run cycle and scopes the real gap (statutory tail: AGI, payslips, Fortnox Lön export) |

**Rule this exposes:** the process docs drift behind the parity grind the same
way the dev instance drifts behind main. The scorecards (`docs/parity/`) are
updated per-flip with live evidence; the process docs are narrative and rot.
Recommendation: when a scorecard flip touches a step that appears in a process
doc's flow/gap list, update the doc in the same PR (add to the PR checklist in
the verification loop).

## 2. Stale claims corrected (applied in this commit)

Each of these would have made us undersell — or contradict ourselves — in a
customer conversation:

- **lead-to-customer.md** listed forecasting and dedup as missing — both are
  done and Stage-3-verified (weighted pipeline forecast; merge with
  plus-addressing email normalization). Lost-reason analytics added too.
- **order-to-delivery.md** listed "Returns/RMA ❌" while return-to-refund.md
  documents the full RMA loop two files away; pick/pack/ship was marked
  human-only although `allocate_picking`/`confirm_pick`/`ship_picking` and
  partial fulfillment are agent-runnable. Cycle counting just went dual-surface.
- **register-to-attend.md** said reminders are "event emission only" — the
  `comms-send?kind=webinar_reminders` sweep now delivers all four windows itself and
  wires `follow_up_sent`. Bumped L3 → L4; parity 78% → 89% updated.
- **support-to-resolution.md** listed multi-channel and CSAT as flat missing —
  email→ticket is verified E2E and feedback capture/analysis exists (the doc
  now scopes what's actually left: WhatsApp/Slack, per-case survey, macros).

## 3. What an SMB will ask about that we genuinely don't have

Cross-referencing Odoo's SMB-relevant apps against the catalog. Ordered by how
often a Swedish/EU SMB hits the need:

| Need (Odoo app) | Where it would live | Honest status | Recommendation |
|---|---|---|---|
| **VAT/tax filing** (Odoo Accounting localizations) | Record-to-Report | Bookkeeping + SIE export exist; no moms declaration, AGI, K10 | Keep positioning as "operational finance + export to your accountant" — but the SE plugin now has a reference implementation to borrow from: [erp-mafia/accounted](https://github.com/erp-mafia/accounted) (SKV 4700 rutor, NE-bilaga, INK2/SRU, 7-year archive). Full map + borrow plan: record-to-report.md § The Swedish statutory tail |
| **Bulk email / campaigns** (Email Marketing + Marketing Automation) | Lead-to-Customer / Content-to-Conversion | Newsletter sends exist; no audience segments, no unsubscribe-list management, no drip builder | The biggest *marketing* gap vs Odoo. `lead_nurture_sequence` is a start; a segments + consent + drip triangle would close both this and the GDPR row |
| **GDPR consent center** | Lead-to-Customer | Missing (scorecard: `consent_center`) | Every EU SMB asks. Pairs naturally with the bulk-email work — do them together |
| **Appointment resources** (Odoo Appointments) | Book-to-Meet | Availability is per service, not per employee/room; no buffers, no waiting list | Documented honestly already; per-staff calendars is the single most-requested upgrade for clinics/salons |
| **eSignature on any document** (Odoo Sign) | Quote-to-Cash / Contracts | Quotes have full sign-and-pay with tamper evidence; employment contracts have signing; but there is no generic "send any PDF for signature" | We're 80% there — the quote-sign machinery generalized to `documents` would match Odoo Sign for SMB purposes |
| **Recurring standalone invoices** | Subscribe-to-Renew | Cycle billing requires a subscription object; "invoice the same 3 lines every month" without one is not wired | Small gap, big spreadsheet-replacement value (rents, retainers) |
| **Purchase approvals by threshold** | Procure-to-Pay | The generic `approvals` engine exists and is wired for quotes/invoices — POs not yet | Cheap win: wire `purchase_orders` into the same engine |
| **Multi-warehouse** | Order-to-Delivery | Single-location stock | Defer — most target SMBs have one warehouse; say so in "Not for" |
| **Project profitability** (Odoo Project + margins) | Quote-to-Cash | Time → invoice works; no cost-vs-revenue rollup per project | Analytic accounts exist (`manage_analytic_account`) — a per-project P&L report would complete the consultancy story |

## 4. Describe-better: structural findings

1. **The adopter layer is the catalog's best asset — and 6 of 14 docs lack
   it.** procure-to-pay (expenses), quote-to-cash, subscribe-to-renew,
   return-to-refund, book-to-meet, register-to-attend have the full "How it
   works in practice" treatment (work story, state machines with
   transition-effects, spreadsheet mapping). lead-to-customer,
   content-to-conversion, order-to-delivery, support-to-resolution,
   hire-to-retire, record-to-report, acquire-to-retire (and the new
   plan-to-produce) don't. The state-machine tables are exactly what a
   spreadsheet-migrating SMB needs and what Odoo's docs *don't* give them.
   Priority order for adding: **order-to-delivery** (orders/pickings carry
   real state machines), **hire-to-retire** (leave + payroll-run states),
   **record-to-report** (journal entry / period states).
2. **Maturity levels are applied inconsistently.** The L4 definition ("an
   agent can execute parts autonomously") is met by nearly every process —
   the agent-coverage tables show 🤖 on most steps everywhere. Yet only 3 of
   14 carry L4. Either tighten the L4 bar (e.g. "the agent runs the *happy
   path* end-to-end unattended, humans handle exceptions") or re-grade. As
   written, sales can't use the levels to differentiate.
3. **"Known gaps" should cite scorecards, not restate them.** The docs that
   drifted (§2) all hand-maintained gap lists that the parity grind
   invalidated. return-to-refund/subscribe-to-renew/acquire-to-retire already
   do it right: one line + pointer to `docs/parity/capabilities/*.json`.
   Migrate the rest to that pattern; keep only gaps that have no scorecard id.
4. **An "Odoo terminology" line would cost little and help switchers.** One
   line per doc: "Odoo calls this CRM + Sales; our stages = crm.stage, our
   deals = opportunities." Several target customers evaluate both; mapping
   vocabulary removes friction. (Not done in this pass — needs a decision.)
5. **Voice/IVR is invisible in the catalog** except one row in book-to-meet.
   If phone intake works for booking + callbacks, it deserves its row in the
   README table's module column and in support-to-resolution (phone → case?).

## 5. Suggested priority (SMB-weighted)

1. ~~Plan-to-Produce doc~~ ✅ (this commit)
2. ~~Payroll truth in hire-to-retire~~ ✅ (this commit)
3. Adopter layer for order-to-delivery, hire-to-retire, record-to-report
4. Sell-to-Settle (POS) process doc
5. Bulk-email + consent (build + then document as Campaign-to-Nurture, or as
   sections in lead-to-customer)
6. PO approval-threshold wiring (cheap, closes a stated P2P gap)
7. Recurring standalone invoices
8. Dispatch-to-Invoice (field service) doc — after the module gets scheduling
9. Generic document eSign (generalize quote signing)
10. Maturity-level re-grade pass (decide the L4 bar first)
