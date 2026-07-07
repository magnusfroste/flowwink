---
title: "Accounting reference — Accounted (accounted.se) gap map"
source: competitor + Swedish accounting standards
license_note: Accounted is AGPL-3.0-or-later — DO NOT copy its code. Borrow the FEATURE SET and the public Swedish standards only.
---

# Accounting: FlowWink vs Accounted — parity gap map

**Goal (Magnus, 2026-07-06): FlowWink accounting should reach ~95% of Accounted** for a Swedish
small business (enskild firma + aktiebolag).

## ⚠️ Licensing constraint (READ FIRST)

Accounted (`github.com/erp-mafia/accounted`, formerly Gnubok) is **AGPL-3.0-or-later**. Copying its
source into FlowWink would force FlowWink to become AGPL. **Do not copy code.** What we legitimately
borrow:
- The **feature set / workflows** (what capabilities a complete SE accounting product has).
- The **public Swedish standards** it implements — these are law/format specs, freely implementable:
  BAS 2026 chart, SKV 4700 momsdeklaration form, SIE 4 interchange format, NE-bilaga / INK2 / SRU
  (Skatteverket), Bokföringslagen 7-year retention, sequential voucher numbering.

Build FlowWink's own implementation of those standards.

## Accounted's feature set (from its README)

Double-entry bookkeeping (BAS 2026, draft/commit, sequential voucher numbering) · Invoicing (mixed
VAT, PDF) · Bank reconciliation (PSD2 via Enable Banking, 4-pass matching) · VAT declaration (SKV
4700 mapping, per-rate, EU/export) · Tax reports (NE-bilaga, INK2, SRU export) · Supplier invoices
(input VAT) · Document archive (SHA-256 integrity, 7-year retention, ZIP export) · SIE import/export ·
Extension system.

## FlowWink coverage vs Accounted

| Capability | FlowWink today | Gap to 95% |
|---|---|---|
| Double-entry + BAS chart | ✅ manage_journal_entry, chart_of_accounts | ⚠️ **BAS chart incomplete** — journal lines reference 1210/2090/2641/7970 missing from the chart → balance sheet doesn't balance (fix in flight 2026-07-06). Complete BAS 2026 seed. |
| Sequential voucher numbering | ✅ list_voucher_gaps / explain_voucher_gap (gap detection) | Confirm strict per-series sequential allocation on commit |
| Invoicing (mixed VAT, PDF) | ✅ manage_invoice, generate-invoice-pdf | — (parity) |
| Bank reconciliation | ✅ rules engine + file import (CAMT/MT940/OFX/CSV/SIE) + OCR | **No live PSD2 bank feed** (Accounted uses Enable Banking). P2. |
| **VAT declaration (momsdeklaration)** | ⚠️ prepare_vat_return exists but **broken** (needs params; earlier: vatReturnAdapter references a missing edge fn) | **P0: working SKV 4700 form mapping** — per-rate boxes, EU/export handling, reverse charge |
| **Skatteverket tax reports** | ❌ none | **P1: NE-bilaga (enskild firma), INK2 (AB), SRU export** |
| SIE import/export | ⚠️ SIE **bank import** only (import_bank_file); CLAUDE claims SIE4/SAF-T export adapters | **Full SIE 4 ledger export + import** (verifications, not just bank lines) |
| Supplier invoices + input VAT | ✅ register_vendor_invoice, pay_vendor_invoice | — (parity) |
| **Document archive (Bokföringslagen)** | ⚠️ documents exist | **P1: 7-year retention enforcement + SHA-256 integrity + audit-archive ZIP export** |
| Year-end | ✅ year_end_readiness, run_year_end, propose_accruals | Likely ahead of Accounted here |
| Period close / opening balances | ✅ close_accounting_period, manage_opening_balances | ⚠️ 0 accounting_periods seeded on dev — verify period lifecycle |

## Ranked gaps to reach 95% (SE SMB)

1. **P0 — Complete BAS 2026 chart** (fix the orphan-accounts / balance-sheet bug; seed the full chart so no posting can orphan). *In flight 2026-07-06.*
2. **P0 — Working VAT declaration (SKV 4700)**: fix prepare_vat_return, map to the official form's boxes, per-rate + EU/export/reverse-charge.
3. **P1 — Skatteverket tax reports**: NE-bilaga (sole trader), INK2 (AB), SRU export file.
4. **P1 — Full SIE 4 ledger export + import** (verifications), not just bank-line import.
5. **P1 — Bokföringslagen document compliance**: 7-year retention lock + SHA-256 integrity hash on archived vouchers + full-archive ZIP export.
6. **P2 — PSD2 live bank feed** (Enable Banking or similar) to complement file/OCR import.

Each of these becomes a capability spec (skill + admin UI) under the parity program. Related:
docs/processes/record-to-report.md (the accounting process this feeds).

## CONSOLIDATED INVENTORY + BUILD PLAN (three-repo sweep, 2026-07-06)

Result of inventorying FlowWink accounting + aircount + airledger (all Magnus's IP / FlowWink's own).

### A. FlowWink accounting is FAR more built than assumed — L3 on the daily stack

**BUILT (L3):** 28 skills (20 accounting + 8 reconciliation). Core double-entry (`manage_journal_entry`,
`accounting_reports` = RR/BR/HB/trial balance), `manage_chart_of_accounts`, `manage_opening_balances`,
VAT (SKV 4700), period close/reopen, voucher-gap detection. **Reconciliation is already a unified
ROUTER** (`supabase/functions/reconciliation/index.ts`: import-file/import-image/auto-match/sync-stripe)
— and it already *parses* SIE into bank_transactions. **The template/learning infra already exists:**
`accounting_templates` (~30 BAS templates, %-based), `suggest_accounting_template`,
`manage_vendor_defaults` (per-vendor auto-coding), `record_accounting_correction` (learning log).
DB is rich (journal_entries + lines + voucher series, accounting_periods, tax_codes/tax_code_grids,
analytic_accounts, budgets, bank_transactions/matches/rules). SIE4 **export** exists (sie4-adapter).

**PARTIAL (L2):** year-end (`year_end_readiness`, `run_year_end`, `propose_accruals`,
`propose_annual_depreciation` — proposes, doesn't auto-book); SE pack stubs `se-periodiseringsfond`
+ `se-overavskrivningar` (amounts=0, wait on skatteuträkning); fixed_assets table (no UI).

**MISSING (L0) — exactly the MVP gaps:** SIE4 **import of the full ledger** (chart+VER+IB, not just
bank lines) · **skatteuträkning** (taxable result) · **ÅR** generation · **INK2** · **SRU**.

### B. airledger = the agentic-bookkeeping pipeline to PORT (as skills)

The intent→match→propose→confirm→book loop, proven. Port the LOGIC as skills (not the chat/STT/vision UI):
- **Intent classifier** — LLM tool-call → `{intent enum, extracted_data (amount/date/vendor/vat), matched_template_hint, confidence, clarification_needed}`.
- **Template matcher** — 4-stage confidence cascade: exact hint **0.95** → category **0.7** → keyword
  **0.6–0.85** + **recency bonus** (+2/7d, +1/30d); **amount overrides** (e.g. >½ prisbasbelopp switches
  template); **warning rules**; returns top-3 candidates. Thresholds: **<0.50 clarify · <0.80
  disambiguate · ≥0.80 propose**. → this IS the confidence-gate.
- **Field collection** (multi-turn, calc expressions), **VAT calc engine** (6 rate×type variants +
  placeholders resolved at booking), **double-entry validation** (Σdr=Σcr ±0.01), **duplicate
  detection**, **opening-balance motkonto** (class-2 → pair 1930).
- **Template data model** worth aligning: `template_entries` JSONB with `vat_calculation` +
  placeholders (`{amount_excluding_vat}`/`{vat_amount}`/`{total_amount}`) — richer than FlowWink's
  current `accounting_templates`; borrow the placeholder/VAT-calc pattern.
- **KEY:** FlowWink already has the *templates + suggest + corrections*; the port is mostly the
  **intent→match→confidence→propose loop** on top, exposed as skills. Small.

### C. aircount = SIE4 IMPORT (the on-ramp)

- **Reusable:** `ImportPage.jsx` parser (#VER/#TRANS/#KONTO/#IB) + **`encodingUtils.js` CP437 decoder**
  (solves the legacy-encoding gotcha). Data model (debit/credit + `ver`).
- **Harden for production:** multi-line quoted fields, Σdr=Σcr per VER validation, `#UB`/`#KSUMMA`,
  **chart normalization to canonical BAS** (the 1932→1930 reconciliation), encoding auto-detect.
- **Home:** extend the existing **reconciliation router** (it already parses SIE for bank lines) to a
  full-ledger import, OR the SE pack — NOT a new edge function.

### D. Build order for the MVP gaps (respecting all constraints)

All as **surface-neutral skills** (MCP + FlowChat + FlowPilot), routed (agent-execute / reconciliation
router / one `accounting-se` router), on the **native ledger**, year-versioned data in the SE pack.

1. **Agentic batch-bookkeeping (lane 1)** — port airledger's intent→match→confidence→propose loop as a
   skill over FlowWink's existing `accounting_templates` + `suggest_accounting_template` + the
   staged→approve→posted flow. Batch the bank-event queue; auto-apply ≥0.80, stage; route <0.80 to
   review. **First, most-provable round** (Liteit's 17 events).
2. **Natural-language → verification (lane 2)** — the intent classifier + freeform-booking path as a
   skill, so "vi höll stämma, godkänn dispositionen" → the 2099→2091 appropriation entry. Enables the
   conversational close.
3. **SIE4 import** — aircount parser + CP437, normalize to canonical BAS, into the reconciliation router.
4. **Skatteuträkning** — RPC/handler: resultat före skatt + skattemässiga justeringar (ej avdragsgilla)
   + year-versioned bolagsskatt → beskattningsbar inkomst; unblocks periodiseringsfond cap + INK2.
5. **ÅR (K2) + INK2 + SRU** — generators reading the native ledger (SIE-in for external books); one
   `accounting-se` router (fold `accounting-vat-return-se` in as the first action).

## UI design: Bokio is the north star — but polish is LAST (decision, 2026-07-06)

Design inspiration for the accounting UI = **Bokio** (clean, fresh, task/todo-driven; see the Bokio
notes above). Sequencing decision, with one important distinction:
- **Functional / control UI is built ALONGSIDE the skills** — the review queue ("händelser att bokföra"
  the agent fills + human accepts/edits/rejects), agent-work visibility (which template/confidence/
  source), journal/reports/close, the transparent tax widget. This is the **trust + control layer** and
  is load-bearing — it is NOT deferred; each build round ships its functional UI.
- **Visual design polish** (making it look as fresh as Bokio) is the **last-mile correction**, done
  once the underlying ledger + skills + functional UI are stable. Polishing pixels before the data
  model settles = rework. Delegate this final design pass to **Lovable**, Bokio-inspired.

**So: no more UI input needed now.** Bokio is captured as the design north star; revisit at the polish
stage. Build the substance first (agentic bookkeeping + native ledger + the functional control UI),
then one Lovable design pass at the end.

## Backlog from the competitor sweep (what to add later)

Distilled from Accounted (feature set + SE standards — borrow features, never AGPL code), Bokio, Dooer:

- **BankID / e-legitimation integration — "a Composio for BankID"** (Magnus, 2026-07-06). Accounted uses
  BankID; we take it LATER. Concept: an aggregator/provider layer for Swedish e-legitimation (candidate
  provider: **e-identitet.se**), the way Composio aggregates tool integrations. Uses: **digital signing
  of the ÅR** (board signs → Bolagsverket), signing/auth for INK2 submission, and general auth/identity.
  Fits the "authority/submission = opt-in plugin" model — not core, layered on the year-end flow.
- **PSD2 live bank feed** (Accounted: Enable Banking, 4-pass auto-matching; Bokio/Dooer: bank feeds).
  Complements SIE/CSV/OCR import. P2 — the on-ramp works via SIE first.
- **Document archive compliance** (Accounted: SHA-256 integrity + 7-year retention + full-archive ZIP).
  Bokföringslagen. Pairs with the deferred immutability. P1.
- **Extension/plugin system** (Accounted's opt-in extensions: AI categorization, receipt OCR, email,
  calendar) — validates FlowWink's module/skill architecture; nothing to build, just confirms direction.
- **Aktiebok / shareholder register** (Dooer + Bokio have it) — small, expected by ABs. Cheap add.
- Full **SIE 4 ledger export + import** (we export; import is the on-ramp — see the SIE section above).

## Competitor: Dooer (dooer.com / go.dooer.com) — the closest overlap

Reviewed 2026-07-06 (public site + Magnus's logged-in Liteit account, structure only).

**Dooer has PIVOTED to almost exactly FlowWink's positioning:** a "Finansiellt operativsystem" — a
**layer on top of existing systems** ("Integrera – migrera inte" / integrate-don't-migrate), with an
**AI-CFO chat**, bank feeds (2000+ banks via PSD2), document OCR, multi-company. New Financial OS is
**closed beta**; they also run **free bokföring / fakturering / lön** as the adoption magnet, and have
a public GitHub. This is the nearest competitor in the "agent/AI + financial ops" space.

**Their accounting product (go.dooer.com) — feature/workflow map (from nav):**
inbox (doc/txn intake) · documents · verification-list (bookkeeping; entries are bank-fed
"EXTERNAL-V*") · **SIE4 import (`#import-sie4i`) right in the verification list** · vat-overview
(momsöversikt) · reports: ledger / vouchers / balance (BR) / pnl (RR) · fiscal-years · salaries ·
billing (fakturering) · purchases/invoices (leverantörsfakturor) · payments · **shareholder register
(aktiebok)** · "+ Ny bokning" (manual entry).

**What Dooer VALIDATES for us:** SIE4-import-as-on-ramp (it's front-and-center in their bookkeeping
view), free-bookkeeping-as-magnet, "integrate not migrate", AI-assisted finance. Our bets are sound.

**Where FlowWink can DIFFERENTIATE (the honest read):**
1. **Different core bet.** Dooer = a *layer on top* that reads/writes your existing systems. FlowWink =
   *the system of record itself*, a full **agent-operated BOS** (CRM, commerce, HR, …), not just a
   financial layer. Be clear which bet we're making — ours is "be the BOS, agent-native", not "overlay".
2. **The full agentic YEAR-END deliverable is our sharper wedge.** Dooer's nav shows bookkeeping +
   reports + fiscal-years, but the **årsredovisning + INK2/SRU file generation** (book → close → tax
   calc → ÅR → submission files) is NOT front-and-center. That end-to-end "året som gör sig självt" is
   exactly our MVP — and a cleaner, more complete magnet than "AI chat over your finances".
3. **External-agent operability (MCP).** Dooer is AI-*chat*-assisted inside their app; FlowWink is
   operable by ANY external agent over MCP. Different, more open surface.
4. Nice-to-note feature they have that we don't: **aktiebok (shareholder register)** — small, cheap,
   expected by ABs.

## Competitor: Bokio (bokio.se) — the incumbent free-ish SMB bookkeeper

Reviewed 2026-07-06 (public + Magnus's logged-in onboarding). Bokio = the popular incumbent for the
exact segment (Swedish SMB bookkeeping). Feature map: automatic bookkeeping suggestions from bank
transactions + templates · integrated moms declaration · **NE-bilaga auto-generated in-house (enskild
firma)** · **ÅR + INK2 + SRU via a PARTNER integration (Årsredovisning Online), with digital signing** ·
invoicing/e-invoicing · payroll (auto tax/holiday/employer contributions, pay Skatteverket) · Bokio
business account/card. Pricing: **paid tiers from ~319 kr/mo** (no longer a free wedge). Switching
users **import SIE files**.

**Takeaways:**
- **Bokio outsources the AB year-end deliverable** (ÅR/INK2/SRU) to a 3rd party (Årsredovisning Online).
  So the **full native/agentic AB year-end is an opening** — nobody in this set owns it end-to-end
  agentically. That's FlowWink's wedge.
- **SIE-import-on-ramp confirmed again** (Bokio, Dooer, Årsredovisning Online all take SIE-in). Universal.
- **Bokio went paid; Dooer offers free.** The free-magnet lane isn't crowded — a free agentic year-end
  is a sharp, uncontested entry.

**Bokio app nav / UX (logged-in, 2026-07-06 — fresher & more guided than Dooer):** Översikt ·
**Saker att göra (todo)** · Uppladdat · Rapporter · Bank · **"Bokföring och bokslut" (one item —
bookkeeping AND year-end close as a continuous, event-based flow)** · Fakturering · Försäljning
(dagskassor) · Leverantörer och inköp · Personal och löner · Utlägg · Integrationer ·
**Tilläggstjänster (add-on services — where the ÅR/tax partner + accountant marketplace lives)** ·
Inställningar. Heavy **guided wizards** ("Starta guiden", "Ställ in dina datum").

UX takeaways to steal:
- **Todo/checklist-driven UX** ("Saker att göra") — the perfect surface for the agentic year-end: an
  agent works the list (book these, run moms, close the year, generate ÅR + files). FlowWink should
  expose a **year-end checklist the agent drives** — "what's left" as first-class UX.
- **Bookkeeping + bokslut as ONE continuous flow**, not a separate silo. The year-end is the
  continuation of daily booking.
- Bokio puts the deep year-end deliverables in **add-on services (outsourced)** — FlowWink does them
  **natively + agentically** instead. Same slot in the UX, different (better) fulfilment.

### FlowWink accounting ONBOARDING pattern (adopt Bokio's clean wizard)

Bokio's setup captures exactly the config that parametrizes the SE accounting engine per company — a
minimal 4-step wizard FlowWink should mirror:
1. **Momsredovisningsperiod** — Årligen / Kvartalsvis / Månadsvis / Momsbefriad → drives the SKV 4700
   declaration frequency (we have the engine; onboarding sets the period).
2. **Redovisningsmetod** — **Fakturametoden (accrual) vs Kontantmetoden (cash)** → an ENGINE
   REQUIREMENT: affects when txns + VAT are recognised (cash = on payment; invoice = on invoice date).
   Confirm the engine handles both.
3. **Räkenskapsår** + **Första räkenskapsåret vs Annat** → fiscal calendar + whether opening balances
   are needed (first year = none; other = import IB, the SIE/IB path).

This config lives on the company/locale-pack binding, drives moms period + booking recognition +
opening balances. Small, high-value onboarding build; makes the whole stack "just work" per company.

## THE core differentiation: AGENTIC bookkeeping (not template-assisted manual)

Key insight from the Bokio walkthrough (Magnus, 2026-07-06): Bokio does the right *first* thing — a
**queue of events to book (todo list)** — but then makes the **human open EACH verification, SEARCH
for a template, and confirm the accounts**. Batch-booking the whole queue doesn't work (no automatic
match). So despite the template assist, **a human still books verification-by-verification.** That is
**NOT agentic bookkeeping** — it's manual bookkeeping with training wheels (Bokio's real aim is to
*educate* the small-business owner).

**FlowWink's differentiation = actual agentic bookkeeping:**
- The agent takes the **whole queue** and **classifies + books every event in a batch** — it does the
  account-selection + VAT + template-matching that Bokio makes the human do per verification. It uses
  the BAS chart, accounting templates, counterparty/description patterns, and prior bookings.
- The human's role flips from "book each one" to **"review the batch / handle only the low-confidence
  exceptions."** Same "saker att göra" surface — but the agent empties it, not the user.
- FlowWink already has the pieces: the staged-booking flow (create → staged → approve → posted,
  double-entry enforced) + `suggest_accounting_template` + `record_accounting_correction`. Agentic
  booking = run classification over the queue and drive that flow in batch.

**Correction model = rättelse genom OMBOKNING (reversal), never edit/delete.** If a posted verification
is wrong, you **reverse it** (a counter-entry) when discovered and **re-book it correctly** — the
audit trail is preserved (Bokföringslagen). `record_accounting_correction` is the seed. This is ALSO
why transaction **immutability is deferred but consistent**: posted entries are immutable; corrections
are new reversing entries, not edits. The agent can even *detect* likely mis-bookings and propose the
reversal+re-book.

**Positioning line:** Bokio/Dooer assist a human doing the books; **FlowWink's agent does the books,
the human reviews.** That's the wedge — and it's what makes the free agentic year-end credible.

**The mechanism is IDENTICAL — only the consumer differs (Magnus, 2026-07-06).** Bokio's
"Bokföringsförslag" per event ("purchases from <supplier> are often booked as <template>, 25% VAT")
is exactly what `suggest_accounting_template` does: a template picked by counterparty/pattern. Bokio
shows that suggestion to a **human who clicks it, row by row**. FlowWink points **the same suggestion
engine at the agent**, which applies it and books in **batch**. So the build is SMALL and highly
provable — not a new engine:
- For each queued bank event: `suggest_accounting_template` → proposed template (accounts + VAT) with
  a confidence signal (Bokio literally exposes "bokförs *ofta* som" — the same signal).
- **Confidence-gate:** auto-apply high-confidence, stage them, book the batch; route only the
  ambiguous/low-confidence events to human review. Missing `underlag` (receipt) is one such flag.
- That's it. The gap between "Bokio's manual click-through" and "FlowWink agentic batch" is a loop +
  a confidence threshold over machinery FlowWink already has (`suggest_accounting_template` + templates
  + the staged-booking flow). First, most-provable build round.

## THE MVP: prove the integrated year, end to end (Magnus, 2026-07-06)

**Priority decision:** the MVP is proving the **whole integrated process on one company for one year**,
NOT building interop or controls first. **SIE4 import/export = saved for LAST. Transaction
immutability / period-lock = deferred to AFTER the MVP.** Before MVP the point is to *prove the chain*.

**The MVP chain (in order):**
1. **Löpande bokföring** — book a full year of transactions. ✅ *have it* (manage_journal_entry,
   agent-verified: create → staged → approve → posted, books stay balanced).
2. **Årsmomsdeklaration** — run the VAT for the year → know the **skuld or fordran**. ✅ *have it*
   (SKV 4700, agent-run). Then **book the VAT settlement** (moms → 2650 → betalning) as part of close.
3. **Årsbokslut / close the year** — the **last transaction(s) that balance the year**: settle VAT,
   then move **årets resultat** to equity (close P&L → result). Skills exist (run_year_end,
   close_accounting_period) — verify the closing mechanics produce a balanced year.
4. **BR + RR** — check the balance sheet + income statement. ✅ *have it* (accounting_reports, balanced).
5. **Skatteuträkning (INK2 input)** — feed RR/BR into the tax calc: **identify the non-deductible
   transactions (ej avdragsgilla)** → adjust resultat före skatt → beskattningsbar inkomst → bolagsskatt.
   *This is the calculation Skatteverket's forms perform.* NEW — the core new engine.
6. **SRU files** — generate INFO.SRU + BLANKETTER.SRU from (5). NEW.
7. **Årsredovisning (K2)** — the presentable/signable ÅR from RR/BR + notes. NEW.

**What's NEW to build for the MVP:** (3) year-end closing entries (VAT settlement + move årets
resultat), (5) skatteuträkning engine (non-deductible flagging + corp tax, year-versioned rate),
(6) SRU file generator, (7) K2 ÅR generator. Everything else we already have and it's agent-run.

**The proof:** one company (Liteit 2025 fixture) goes book → close → VAT → tax → ÅR → SRU as one
**agentic** flow — "året som gör sig självt." That demo IS the adoption magnet.

### The Liteit test fixture + TWO classes of verification (Magnus, 2026-07-06)

The 17 Liteit business-account events (bank CSV export — Webhotell, Skatteverket, Datorbutiken,
Elbolaget, Faktura #12, Fruktkorgen…) are a clean test: few parallel transactions, **17 verifications
total** from the bank feed. **Signal-source is general** — today a CSV, later a PDF / photo / live
bank connection; downstream is the same (normalize → event → classify/book). The agent's booking
logic doesn't care about the input channel.

Then **more verifications are added by TALKING to the agent** — the deeper capability:

> "Vi höll bolagsstämma den 10 juni, 2025 års vinstdisposition godkändes — lägg 2025 års resultat till
> balanserad vinst (föregående års upplupna vinst)."

The human speaks a **business event in plain Swedish**; the agent produces the **correct verification**
(the year-end appropriation: move `2099 Årets resultat` → `2091 Balanserad vinst` per the stämma
decision; for Liteit: 19 537 + (−16 344) = 3 193 i ny räkning — matches the actual ÅR). This is
**natural-language → verification**, and it's how the *year-end closing/appropriation* entries get
made — not a wizard button, but the agent executing a spoken instruction.

**So agentic bookkeeping has two lanes:** (1) **batch-classify the bank feed** via
`suggest_accounting_template` (the 17), and (2) **natural-language → verification** for the events a
human dictates (stämma/vinstdisposition, accruals, corrections). Both land in the same staged →
approve → posted flow. Lane 2 is what makes the *close* and the *whole year-end* conversational —
"vi höll stämma, godkänn dispositionen" → the books close themselves.

### Prior-art / reference: airledger (Magnus's own MVP — reuse it)

`~/Code/github/airledger` ("Air Ledger — AI-Driven Bokföring") is Magnus's working MVP of exactly this
agentic-bookkeeping pipeline — **his own IP, fully portable** (no license issue). It de-risks the build:
the whole "talk to the agent → it books" mechanism is already designed and running. Reference
architecture to lift/adapt (React/TS/Supabase, same stack):
- **chat-assistant edge fn with a MULTI-AGENT split**: `booking-agent`, `advisory-agent`,
  `reporting-agent`, `dynamic-agent` — routed by intent. Maps to lane-2 conversational bookkeeping.
- **The proven pipeline (both files ~380 lines):** `classifyIntent(msg, templateNames)` → extracts
  `matched_template_hint` + `extracted_data` (amount/counterparty) → **`matchTemplateWithCandidates`**
  scores against the template library (**exact hint = 0.95 confidence**, partial, candidates) with
  amount-based overrides + warning rules → **propose ("tolkar det som **<template>**") → confirm →
  save** (`use_transaction_template` / `save_general_transaction` / `save_opening_balance`).
- **This IS the confidence-gate + propose/confirm loop** I described — already built. It maps 1:1 onto
  FlowWink's `suggest_accounting_template` + staged→approve→posted flow.
- Also there: `analyze-bank-statement` (lane 1 feed), `analyze-receipt` (PDF/photo signal), `voice-to-text`,
  opening-balance handling with auto-motkonto (1930), follow-up suggestions after a booking.

**Takeaway:** FlowWink's agentic-bookkeeping build is NOT greenfield — it's porting airledger's proven
intent→match→propose→confirm→book pipeline onto FlowWink's native ledger + skills. Biggest de-risk in
the whole accounting roadmap.

### DECISIVE architecture: DON'T build the conversational layer — be the ledger + MCP surface (Magnus, 2026-07-06)

Magnus's journey: **aircount** (SIE4 import/export, Dooer-like, MVP) → **airledger** (talk-in-the-mobile,
simple RR/BR, financial overview, MVP) → now folding those lessons into **FlowWink BoS**, where the
**agents are the main attraction** and **FlowWink SaaS is the ledger for the whole company's data.**

**The key lesson from airledger's STT struggle:** do NOT rebuild the conversational/voice layer inside
FlowWink. **The horizontal/frontier agents (Claude, ChatGPT, Gemini, the hyperscalers') already own
conversational + multimodal + voice** — and improve weekly. Building your own chat/STT is fighting the
frontier and losing. That was airledger's trap.

**The correct split:**
- **The agent is BYO / horizontal** — any frontier agent, connected over **MCP**. It handles the
  conversation, the voice, the "vi höll stämma…", the presentation. FlowPilot is *one* such agent, but
  the point is ANY agent works.
- **FlowWink is the LEDGER + the MCP skill surface** — the system of record for the whole company's
  data, exposing bookkeeping as clean, well-described skills (classify/suggest_template, book, close,
  VAT, tax, ÅR, SRU) with the guardrails (staged→approve→posted, double-entry) so a horizontal agent
  **can't book wrong.** FlowWink's moat is the ledger + guardrails + skill quality, not the chat UI.

**So what to reuse from airledger = the DOMAIN LOGIC, not the chat/STT UI.** The intent→template
matcher, confidence scoring, and the booking/close/VAT/tax skills become **MCP skills**; the
conversational wrapper is the horizontal agent's job. This is already FlowWink's core thesis
("operable by any agent, ships with one") — and **already proven**: OpenClaw (an external agent) books
correctly through FlowWink's MCP today (create→staged→approve→posted, books stay balanced).

**Business consequence:** FlowWink **rides the hyperscalers' agent adoption** instead of competing with
their conversational UX — a far stronger position than airledger (which had to build + defend its own
chat/STT). The job is: make FlowWink's MCP ledger surface *excellent* for horizontal agents to operate.
Horizontal agent + horizontal BOS ledger — never a vertical agent.

**Final priorities (Magnus, 2026-07-06):**
1. **External horizontal agents are the priority** — optimize the MCP ledger surface for them.
2. **Focus = the FlowWink BoS ledger** = the company's **private data**, **self-hosted OR in cloud**
   (single-tenant; the customer owns/hosts it). Data sovereignty is part of the pitch.
3. **Voice/STT: supported, not focus.** FlowWink *does* ship STT, so a user can talk to FlowWink's own
   operator (FlowPilot) directly — a supported convenience, NOT the moat. Don't over-invest there; the
   frontier agents carry the conversational load. Keep STT working, keep building the ledger + skills.

### The human GUI is the TRUST + CONTROL layer (hard requirement, Magnus, 2026-07-06)

**Priority is agentic bookkeeping — but a supporting human GUI is required**, and it is the **trust +
control layer**, not a nice-to-have. Two rules:
1. **GUI parity:** *everything the agent does must also be doable by a human in the GUI* (book manually,
   set opening balances, close the year, run the VAT/tax/ÅR). Agent and human operate the same ledger.
2. **Full visibility + editability:** the GUI must show *everything the agent did* — which entries,
   from which event, which **template**, what **confidence**, and let the human **change it** (edit →
   rättelse genom ombokning; reverse + re-book, never silent edit).

**Positioning line:** *"Let the agent book, or do it yourself — either way you see everything the agent
did and can change it."* Three modes on one ledger: **full-agent · manual · hybrid.**

**Why this is non-negotiable:** we will meet **oceans of skepticism** initially — always the case with
a new way of working. It releases when **someone who has actually done bookkeeping sees it works** and
sees they stay in control. So the GUI must make the agent's work **fully auditable** (what/why/which
template/confidence/source event — the existing Journal / General Ledger / Audit Trail / Voucher
Integrity tabs are where it lands) and **fully correctable**. Transparency + reversibility = the bridge
across the skepticism. The "händelser att bokföra" queue is agent-filled but human-inspectable
(accept / edit / reject each proposal). This is the FOURTH surface (human GUI) alongside MCP /
FlowChat / FlowPilot — and the one that earns trust.

### Agent-AUDITABLE: the auditor runs their OWN agent over MCP (Magnus, 2026-07-06)

The closing symmetry of the MCP thesis. If a company runs **agentic bookkeeping**, then the **auditor
(revisor)** doesn't import a SIE or log in — they **connect their own agent to the company's FlowWink
MCP surface from outside, read-scoped, and it verifies everything**: double-entry integrity, sample →
*full* voucher checks, trace to underlag, re-derive VAT/tax, confirm period locks, reconcile. Same
ledger, same MCP surface, different scope.

- **Company's agent BOOKS** (over MCP / FlowPilot / GUI). **Auditor's agent VERIFIES** (external,
  read-scoped, over MCP). Two agents, one ledger.
- **Already PROVEN, not theoretical:** OpenClaw already audits FlowWink over MCP today and filed real
  defects (the beta_test_findings loop). The auditor use case *is* that, formalized: a read-scoped
  `api_keys` key (scopes already exist) + the audit-read skills that already exist (`accounting_reports`,
  Audit Trail, `list_voucher_gaps`, `reconciliation_report`, ledger/entry reads).
- **Step-change in audit quality:** the auditor's agent checks **100%**, not a sample. That's both a
  better audit and a **selling point** — auditors prefer auditable systems and can recommend FlowWink
  to their clients. FlowWink isn't just *agent-operated*, it's **agent-auditable**.
- **Raises the value of the deferred immutability + audit trail:** an auditor's agent wants proof that
  posted entries weren't silently changed — corrections-by-reversal (ombokning) + the immutable audit
  trail are exactly what lets an external verifier trust the books. Build immutability with this in mind.
- Requirement: expose a clean, **read-scoped audit surface** over MCP (scoped API keys, read-only skill
  set), so a third-party agent can verify without write access.

Full trust story: **GUI** (human control) + **auditor's external agent** (independent verification) —
both on top of the same agentic ledger. Booking agent + audit agent + human GUI = trust from every angle.

### ONE skill layer, THREE surfaces (hard requirement, Magnus, 2026-07-06)

When exposing the **whole package** as MCP skills — the full process **bokföring → bokslut → ÅR →
INK2/SRU** — build it **once as skills** so the *same* capability is operable from all three surfaces:
1. **External horizontal agents over MCP** — the PRIORITY (what we believe scales FlowWink SaaS;
   hence the last month's MCP focus).
2. **FlowChat inside FlowWink** — the in-app chat must do the *same* year-end (no separate code path).
3. **FlowPilot** — turning on the built-in operator must do the *same* year-end.

This is already the platform's design and must be honored: skills live once in `agent_skills`; the
**Skill Relevance Engine + executeSkill are shared** between FlowPilot (in-process) and the MCP gateway,
and FlowChat runs over the same skills. So **build accounting as skills and all three surfaces come for
free** — the discipline is: **never hardcode year-end logic into one surface** (not into an MCP-only
handler, not into a FlowPilot-only path, not into a FlowChat-only UI). The skill is the single contract.

Design consequence for the propose→confirm loop: the **staged→approve→posted** pattern must be
**surface-neutral** — the confirmation can come from an external agent, a FlowChat user, or FlowPilot
(the `approve_pending_operation` staging already works this way, verified). Build the year-end skills
with agent-friendly propose/confirm semantics and they work identically across all three.

### Be SPARING with edge functions — reuse + router pattern (hard constraint, Magnus, 2026-07-06)

Edge functions cost deploy/cold-start/maintenance (and must be deployed per instance). **Do NOT spawn
one edge function per skill/deliverable.** Reuse; a **router** (one function, action-based dispatch)
is welcome. Precedent in-repo: the newsletter refactor consolidated **6 edge functions → 1 router**;
`agent-execute` already routes most accounting skills; SUBROUTE_FNS (a2a, agent-execute, content-api,
docs-sync, reconciliation) are established routers.

**Applied to the accounting/year-end build:**
- The year-end engine pieces (skatteuträkning, SRU export, ÅR generation, year-end close) must **NOT**
  each become a new edge function. Route them through **`agent-execute`** (where most accounting skills
  already live) OR **one SE-accounting router** with action dispatch:
  `{ action: 'vat-return' | 'tax-calc' | 'sru-export' | 'ar-generate' | 'close-year', period, … }`,
  all reading the year-versioned SE pack data.
- **Note:** `accounting-vat-return-se` was just built as a standalone function. Per this constraint,
  the next pieces should **join a router rather than proliferate** — and `accounting-vat-return-se` is a
  candidate to fold in as the first action of an `accounting-se` router (or move under agent-execute)
  when the tax/SRU/ÅR actions land. Don't churn it now; consolidate when the sibling actions arrive.
- Same discipline platform-wide, not just accounting: prefer reuse/router over a new function.

## SRU / NE-bilaga / INK2 — deliverable format (reference: srumaker.se)

The concrete deliverable for the Skatteverket statutory reports is **the SRU file-transfer format**,
NOT paper blanketter. Reference UX: **srumaker.se** — fill in figures → get **two files** →
upload to Skatteverket's *Filöverföring* in the declaration service. Standard for ~10 years.

The two files:
- **INFO.SRU** — identity block (`#DATABESKRIVNING`, `#MEDIELEV`, org/personnummer, name, contact).
- **BLANKETTER.SRU** — `#BLANKETT` records (e.g. `INK2`, `NE`) with `#UPPGIFT <field_code> <value>`
  lines. The **field codes are the SRU codes** — yearly-versioned, published by bas.se
  (SRU-kopplingar: BAS account → SRU code). This is the perishable data.

**Architecture (confirms the locale-pack thesis):**
- **Generic** = the two-file `.SRU` writer (INFO + BLANKETTER record format) — write once, country/year-agnostic mechanics.
- **Year-versioned data in the pack** = `se/sru-2026.ts` (BAS account → SRU field code) + the form
  field layout for NE / INK2. New year = add `sru-2027.ts`, no code change.

**FlowWink's edge over srumaker.se:** srumaker makes the user *type in* the figures. FlowWink already
**has the booked ledger** — the SRU files fall out of the existing journal automatically, and an
**agent** can generate + file them. Book the year → get the two SRU files. That's the agentic record-to-report payoff.

## The real deliverable: transparent tax calc + ready-to-submit files (forms are a byproduct)

Refined vision (Magnus, 2026-07-06): **the blanketter are an intermediate stage, not the goal.** Once
you have a balance sheet + P&L, the value is:
1. **The tax calculation happens automatically** (skatteuträkning) — resultat före skatt +
   skattemässiga justeringar → beskattningsbar inkomst → bolagsskatt (20.6% for 2025) → årets skatt.
2. **A transparent presentation of how the calc arrives at the number** (not a form to fill).
3. **"Here are your files to submit"** — INK2 + SRU for Skatteverket (filöverföring), and the
   **K2 Årsredovisning** for Bolagsverket.

The **Årsredovisning is itself a first-class deliverable** (K2, → Bolagsverket), and highly
templatable: förvaltningsberättelse (verksamhet, flerårsjämförelse, vinstdisposition) + resultaträkning
+ balansräkning + noter (redovisningsprinciper, eget kapital) + underskrifter. Structure is fixed;
only the figures change.

### Canonical test fixture: Liteit Svenska AB 2025 (minimal holding AB)
Real example (Magnus's own): 26 bank transactions/year — monthly Skatteverket debits, bank fees, one
related-party interest cost (−14 700), one tax refund. Nettoomsättning 0, resultat −16 344 (loss →
0 tax), balansomslutning 274 443. This is the **long tail of tiny ABs + enskild firma** where an
agent should do the *entire* year-end: 26 transactions → book → BS/P&L → K2 ÅR → skatteuträkning →
INK2/SRU files. If FlowWink nails this end-to-end for Liteit, it nails it for a huge SMB segment.

**Build shape:** a `skatteuträkning` engine (small, on top of resultat före skatt + year-versioned
tax rate + justeringar) → transparent calc view → INK2/SRU + ÅR generators. All year-versioned data
in the SE pack; the presentation + file export is the product, the forms are the wire format.

### The AB year-end TIMELINE and SEQUENCE (shapes the flow — Magnus, 2026-07-06)

For a calendar-year AB (close 2025-12-31), the real-world sequence FlowWink must model:

1. **Year closes** (2025-12-31) — books closed in FlowWink → RR + BR final.
2. **~4 months later: bolagsstämma** (AGM). The **ÅR (built from FlowWink's RR + BR)** is presented
   there. → so the **ÅR is the FIRST deliverable** and it must be ready for the stämma.
3. **Signed ÅR → Bolagsverket** (after the stämma).
4. **THEN: INK2 → Skatteverket** — submitted **via the SRU files if you have them** (the digital
   route; SRU is what makes it file-based instead of paper).
5. **Deadline: before 1 August** (digital INK2 filing for a Dec-31 fiscal year).

Implications for the build:
- **ÅR first, INK2/SRU second** — model them as two ordered stages of one year-end flow, not one blob.
- FlowWink should surface a **year-end checklist / deadline tracker**: close → ÅR (stämma →
  Bolagsverket) → INK2/SRU (Skatteverket, before Aug 1). This is the L4/L5 record-to-report UX.
- The stämma needs a **presentable ÅR** (K2 layout) generated straight from the booked RR/BR — that's
  the artefact the board signs; everything downstream (Bolagsverket filing, INK2/SRU) hangs off it.

### The ÅR generator's INPUT contract = SIE4 (reference: arsredovisning-online.se)

arsredovisning-online.se takes a **SIE4 file as input** — the universal export format every Swedish
bookkeeping program produces — and layers a **template** for the parts that aren't in the raw numbers
(the notes etc. you see in Liteit's ÅR). Then you submit.

This is the right input contract for FlowWink's ÅR/tax generators, and FlowWink is uniquely placed:
- **FlowWink already EXPORTS full SIE4** (`src/lib/locale-packs/se/sie4-adapter.ts` — `#RAR` + `#KONTO`
  + `#VER`/`#TRANS`, chart + balances + all verifications).
- So the chain is one flow for FlowWink customers: **ledger → SIE4 → ÅR / skatteuträkning / INK2 / SRU.**
- And because the generator's input is **SIE4, not FlowWink's own schema**, the SAME ÅR/tax stack works
  for a business that books in Fortnox/Visma/anything — **import their SIE4 → get the ÅR + files.** That
  is a massive horizontal reach (the whole SE market), not a vertical.

**The ÅR = financial statements + a template layer.** The RR/BR come straight from the SIE4/ledger.
The template layer adds what's NOT in the raw numbers: förvaltningsberättelse (verksamhet,
flerårsjämförelse, vinstdisposition), noter (redovisningsprinciper, Not eget kapital, Not
värdepapper, …), underskrifter. Some notes **auto-derive** (Not eget kapital from equity-account
movements; Not värdepapper from the 13xx holdings); the narrative parts come from a small form/template.

**Build shape:** `sie4-in → K2-ÅR-template → signable ÅR (PDF/iXBRL)`. Decoupled, testable against any
SIE4 — including a SIE4 exported from Liteit 2025.

### SIE4 vs SIE5 — format strategy (Magnus, 2026-07-06)

The input contract is **a normalized ledger model, NOT a specific file format.** Two realities:
- **SIE4** = the de facto standard for ~30 years. Flat text, `#`-records (#VER/#TRANS/#KONTO/#RAR/
  #IB/#UB/#RES), historically **CP437 / IBM-PC encoding**. Every existing Swedish program exports it —
  it's **table stakes / backward compatibility** (the whole installed base). Magnus already has a
  SIE4 import/export impl in his other project **aircount** (his own IP — portable, no license issue).
- **SIE5** = the new **XML-based** standard the industry is steering toward. Richer schema; adoption
  still ramping, but it's the forward bet.

**Architecture:** parse both `SIE4-in` and `SIE5-in` into the **same internal ledger representation**
that the ÅR / skatteuträkning / INK2 / SRU generators consume. Likewise two writers: SIE4-out (legacy
compat) + SIE5-out (future). The generators stay format-agnostic — new format = new parser, not a
generator rewrite. Support **SIE4 now** (reach the installed base), **be SIE5-ready** as the industry shifts.

**Interop note:** FlowWink's current `sie4-adapter.ts` emits **UTF-8** (browser-native). Strict
legacy interop wants **CP437/PC8** on export; import should accept both. Worth aligning with aircount's
proven impl when porting.

### SIE exists ONLY for interoperability — it is not the internal contract (Magnus, 2026-07-06)

Sharpening: **the internal contract is FlowWink's native ledger, not SIE.** SIE's only reason to
exist is compatibility with other systems, with exactly two purposes:
1. **Import = the on-ramp (capture).** "Bring your SIE4/SIE5 from wherever you book — we take it from
   here." This is how the adoption magnet ingests users who book elsewhere.
2. **Export = the off-ramp (anti-lock-in / trust).** "Your data is never trapped — export complete SIE
   anytime." This lowers perceived switching risk and is itself a GTM asset.

Consequences:
- The **ÅR / skatteuträkning / INK2 / SRU / reports generators run on the NATIVE ledger** (primary,
  fast path). SIE-import feeds the native ledger; the generators never depend on a SIE file.
- **Investment discipline:** SIE must be *complete and correct* (a lossy import breaks the magnet; a
  broken export breaks the no-lock-in promise) — but **not gold-plated**. Engineering investment goes
  into the native agentic year-end stack, not SIE feature-creep.
- So: earlier "the ÅR generator's input = SIE4" is only true for the *external-source* path. For a
  FlowWink-booked company it's ledger-direct; SIE is the bridge for everyone else.

### SIE import = a full bundle that must be NORMALIZED to our canonical chart (Magnus, 2026-07-06)

SIE is not just transactions — it carries a **whole chart of accounts** (#KONTO) plus verifications
(#VER/#TRANS) plus opening/closing balances (#IB/#UB). So SIE import is not "dump transactions"; it's:

**Parse SIE (chart + ver + trans + IB/UB) → RECONCILE the imported chart against FlowWink's canonical
BAS chart → normalize everything to the reconciled accounts → write to the native ledger.**

The reconciliation step:
- Imported account matches a canonical BAS account by number → **1:1 map** (the common case).
- Imported account is non-standard (e.g. cash on **1932** where our canonical is **1930**) → offer the
  user the standard remap question: "use the system's 1930 for cash instead?" — remap to canonical, or
  (advanced/överkurs) keep it as-is.
- A fully custom chart that doesn't follow the BAS template = **överkurs, out of initial scope.**

**Target-segment discipline (80/20):** the companies we go after first — simple SMBs on the standard
BAS template, agent-adopters — have charts that are **mostly identity-mapped** (standard numbers).
So the reconciliation is near-trivial for the 80%, and the **agent can do it automatically** (map the
standard accounts, flag the few oddities for a one-click confirm). The remap UI is the edge-case escape
hatch, not the main path — another agentic "it just works" moment.

**CSV/TSV** exports from other systems are usually **transactions-only** (no chart) → lower value than
SIE and lower priority. SIE is the real on-ramp precisely because it's the complete, chart-bearing bundle.

### GTM: the ÅR/year-end IS the adoption magnet (scope decision, 2026-07-06)

The strategic question — is a basic "årsredovisning online" in scope? **Yes — it's likely the single
best top-of-funnel wedge for the SE market.** Reasoning:
- **The job is painful, recurring, deadline-driven, and byrå-priced** (a tiny AB like Liteit pays
  5–15k SEK for something that's ~automatable from 26 transactions). That's the ideal wedge shape.
- **Zero-switching-cost entry:** because the input is **SIE4**, the free tool is "upload your SIE4 →
  get your Årsredovisning + tax files." They keep booking wherever they are — no commitment. Lowest
  possible friction to first value.
- **It proves the agentic thesis in one demo:** an agent produces what a byrå charges thousands for.
  That story pulls them toward "book directly in FlowWink next year" → and into CRM, invoicing, all
  modules. The magnet isn't a feature; it's **"the year-end that does itself."**

Scope discipline for the MVP:
- **MVP = generate + present transparently + export PDF.** A human reviews and **signs**; FlowWink is
  the tool, not the filer. This is both the safe posture (an incorrect filing has real consequences)
  and why "free" works — the human stays in the loop.
- **Online submission is a country+authority-specific PLUGIN** (Bolagsverket digital filing / iXBRL;
  Skatteverket SRU filöverföring). Opt-in, layered later. Do NOT gate the MVP on the submission API.
- Positioning stays **horizontal**: generic engine + SE locale pack (chart, VAT, SRU, ÅR template);
  the Bolagsverket/Skatteverket submission adapters are the only truly authority-specific pieces, and
  they're opt-in plugins — not the core.

### UI design language: the Resultatrapport reference (Magnus, 2026-07-06)

Magnus shared a live Resultatrapport screen with the note **"enkelt och clean — minimalistiskt"** as the
concrete visual north star (complements the Bokio "north star, polish last" decision above — Bokio =
structure/flow; this = the actual look). The design DNA to reproduce in the final polish pass:

- **Editorial serif display heading** (e.g. "Resultatrapport") on a warm off-white *paper* background —
  deliberately NOT default SaaS-sans. Signals calm/premium.
- **Single card**, soft border + rounded corners, minimal chrome.
- **Minimal control row**: year selector + a couple of quiet checkboxes ("Visa decimaler", "Visa inaktiva").
  Nothing else competing for attention.
- **Section groups** (Rörelsens intäkter / kostnader / resultat, …) with a muted, right-aligned year label
  acting as the column header.
- **Expandable account tree**: chevrons, `konto­nummer  Kontonamn`, indented children.
- **Right-aligned figures**; **bold only on summary/total rows**; thin hairline dividers.
- **Accent colour (purple) used sparingly** — only as a left-edge marker on the active/expanded group.
  Everything else is black/grey.
- **Whitespace-heavy, zero visual noise.**

This is the target aesthetic for ALL accounting reports (Resultatrapport, Balansräkning, the tax-calc
presentation, the review queue). Still the last-mile Lovable pass — captured now so it's not lost.

**Structural specs from the live Bokio reference (2026-07-06, "bokför endast två saker"):**

1. **Balansrapport is 3-column** — `Ing. balans 2026-01-01` | `Resultat` | `Utg. balans 2026-12-31`
   (opening balance → period movement → closing balance, the standard SE presentation). The
   **Resultatrapport is 1-column** (the year only). Same shell, different column set — build the report
   frame once, parameterise the columns.
2. **Graceful at sparse data** — with only two vouchers booked, the report still renders zero-rows
   (Anläggningstillgångar 0, Långfristiga skulder 0) and reads as calm/finished, not empty/broken. This
   is a hard requirement, not just polish: the first-run experience (agent has booked 1–2 things) must
   already look like a real, complete report. Design and test the low-volume state first, not last.
3. Both reports share identical chrome: serif heading, year selector + "Visa decimaler"/"Visa inaktiva"
   checkboxes, single card, expandable account tree with chevrons, purple left-edge accent on the active
   group, subtle grey highlight on the focused leaf row, right-aligned figures, bold on summary rows.

---

## Bokio bookkeeping flow — captured live (2026-07-06, LiteIT Svenska AB test company)

Walked the full "book a transaction" wizard on Bokio's own test account (Magnus logged in, explicit
"prova att bokför"). This is the reference flow to replicate — and it maps 1:1 onto our agentic
pipeline. **The human wizard IS the agent's decision tree made visible** — every step is a decision
the agent makes autonomously; the GUI is the trust/control surface over the exact same steps.

### The 6 steps (each = a pipeline stage)

1. **Skapa ny → Bokföring** — entry menu. Options: *Ladda upp underlag* (receipt→auto-suggest),
   *Utan underlag* (manual). Plus *Import: från bank / från fil* and *Skapa: Faktura / Lön*.
   → Our equivalent: an event arrives (bank feed, uploaded receipt, or agent-initiated).

2. **Välj kategori** (intent capture) — coarse event class:
   - *Standardhändelser:* **Leverantörsfaktura** ("faktura du betalar senare")
   - *Specialhändelser:* **Inköp från annat konto** (kreditkort/privat/osynkat) · **Övrig inkomst**
     (privat konto/kontant) · **Övrigt / Justering** (interna överföringar, skattebetalningar)
   - Right pane throughout: persistent **"Lägg till underlag"** dropzone (.jpeg/.jpg/.pdf/.png) +
     "Välj från uppladdat".
   → **= intent classification.** The agent picks this class from the source event automatically.

3. **Välj mall** (template match) — tabs **Sök | Alla mallar | Manuell**. Natural-language search box
   **"Vad betalade du för?"** + **"Dina vanligaste mallar"** (usage-ranked): *Insättning till
   skattekonto, Fruktkorg 6% moms, IT-produkter Inrikes 25% moms, Inköp förbrukningsmaterial 25% moms*.
   Each template name encodes **VAT rate + account family**.
   → **= our template confidence-cascade / Skill-Relevance-style scoring.** "Vad betalade du för?" is
   literally intent→template ranking exposed as UI. The agent scores templates on the event
   description; the human search box is the same ranking, typed.

4. **Fyll i detaljer** (parameter capture) — the human enters ONLY:
   - **Summa (SEK inkl. moms)** — gross amount
   - **Betaldatum** — date (**can be future-dated → scheduled verification**)
   - **Konto** — payment/counter account (default **1930 Företagskonto**)
   - Titel (prefilled from template), Kommentar (optional), **+ Lägg till mall** (multi-line: several
     template rows in one verification)
   → **= parameter extraction.** Template supplies the expense + VAT accounts and the split rule; the
   agent fills amount/date/account from the source event — exactly what the human does here.

5. **Granska** (the proposal) — "Så här kommer ditt verifikat se ut". Generated double-entry table,
   e.g. 1 000 kr on *IT-produkter Inrikes 25% moms*:
   | Konto | Debet | Kredit |
   |---|---|---|
   | 1930 Företagskonto | 0,00 | 1 000,00 |
   | 2640 Ingående moms | 200,00 | 0,00 |
   | 6230 Datakommunikation | 800,00 | 0,00 |
   Note the template booked to **6230** with 25% VAT auto-split (800 net + 200 VAT). Also present:
   **"Bokio AI kan förklara denna bokföring"** (AI-explain link) and **"Redigera verifikat"** (manual
   override). Primary action **Bokför**.
   → **= our `propose` / staged verification.** This is the review screen the control-UI must render;
   the agent produces exactly this object, a human (or auditor's agent) approves it.

6. **Klar** (committed) — success seal, **"Verifikation bokförd!"**, voucher number (**V5**), date,
   template. Follow-ups: **Lägg till tagg(ar)**, **Skapa periodisering** (accrual), **Bokför en till**,
   **Klar**.
   → **= our `approve → posted` (staged→post commit).** Voucher gets its sequential number here.

### Design/layout of the wizard (for the Lovable polish pass)
- **Two-pane wizard:** left = the step form (narrow, ~460px), right = persistent "Lägg till underlag"
  dropzone. Same shell every step.
- **Serif step title** (Välj kategori / Välj mall / Fyll i detaljer / Granska / Klar) with a **back
  chevron**, a top-right **"Avbryt"** and an **"…"** overflow. A thin **purple progress bar** under
  the title fills across the 5 steps.
- Radio-card lists for choices; usage-ranked "Dina vanligaste mallar"; inline "Fyll i nu" affordances;
  disabled primary button until required fields are set; big black primary CTA (Nästa / Bokför).
- Same calm/minimal/editorial system as the reports (serif, paper bg, one card, sparse accent).

### What this locks in for build round 1
- Our pipeline **classify → template-match → extract → propose → post** is confirmed correct — it is
  literally Bokio's wizard, and therefore "works with an agent as with a human bookkeeper" (Magnus's
  bar). Same skill layer; the agent runs steps 2–5 autonomously and batches, the human/auditor reviews
  step 5 via the control UI.
- **Templates are the unit of correctness** (VAT rate + account family baked in). Port aircount/airledger
  template families into `accounting_templates`; the SE locale pack owns the BAS accounts they map to.
- Features to carry: **future-dated/scheduled verifications**, **multi-line (+ Lägg till mall)**,
  **periodisering (accruals)**, **tags**, **AI-explain-this-entry** (a natural FlowPilot/MCP skill:
  "explain verification V5"), **manual override (Redigera verifikat)** before commit.
- Voucher numbering is assigned at commit (V-series), sequential — Bokföringslagen requirement, already
  in our model.

---

## Inventory verdict (2026-07-06): the core exists — round 1 is a thin batch layer

Full read of the FlowWink accounting infra (Explore agent, 45 tool calls). Mapped against the 6 Bokio
stages, **most of the pipeline already ships**:

| Bokio stage | FlowWink status | Reuse (do NOT rebuild) |
|---|---|---|
| 1. Classify intent | **PARTIAL** | keyword+vendor-default inference in `manage_journal_entry`; no explicit classifier/batch |
| 2. Template-match | **DONE (single tx)** | `manage_accounting_template` list + keyword×usage scoring; 80+ `BAS_2024_TEMPLATES`; **batch scoring missing** |
| 3. Parameter-extract | **DONE (structured)** | `{template_id, amount_cents}` → scaled `template_lines`; no OCR for unstructured |
| 4. Propose double-entry | **DONE** | template % expansion, balance-validated, multi-line |
| 5. Post / commit | **DONE** | `pending_operations` staged → `approve_pending_operation` → posted; period locks |
| 6. Voucher number + audit | **DONE** | `assign_voucher_number()` trigger, `list_voucher_gaps`/`explain_voucher_gap`, audit_logs |

**Canonical pieces to build on (all already there):** `manage_journal_entry` (the posting skill, template +
vendor learning built in), `manage_accounting_template`, `accounting_reports` (P&L/balance/trial/unbooked),
`suggest_accounting_template`, `record_accounting_correction` (learning feed), `manage_vendor_defaults`
(`default_account_code`/`last_used_template_id`), the SE pack (`BAS_2024_ACCOUNTS`, `BAS_2024_TEMPLATES`,
VAT rates, `sie4-adapter`, `vat-return-2026`), and the existing `/admin/accounting` tabs incl. **Approvals**
(`PendingOperationsList.tsx`), Journal, Templates, VoucherIntegrity, Year-End.

**The real gap = batch orchestration + a review queue (the "Granska" control surface).** Concretely, and
strictly reusing `agent-execute` (no new edge functions per policy):
1. **Batch intake → classify+match+propose** — take N raw events (bank rows / uploaded), for each run the
   existing template scorer + vendor default, emit a *proposed* verification with a **confidence** and the
   chosen template. This is agent reasoning over existing skills, looped/batched via `agent-execute`; the
   staged proposals land in `pending_operations` (already the staging store).
2. **Review queue UI** — Bokio's "Granska" as a *list*: one row per source event → proposed double-entry +
   confidence + template, with **accept / edit (Redigera) / reject**, and **approve-all / filter-by-category**
   (the batch affordances the single-item Approvals tab lacks). This IS the trust/control layer. Lovable
   build, Bokio look (serif/paper/one-card/sparse-purple, graceful at low volume).
3. **Batch approve → post** — commit accepted rows through the existing `approve_pending_operation` → posted
   path; vouchers auto-number on commit.

Fixture: **Liteit 2025, 17 bank events** (documented above). Round 1 = the **batch lane**; the
natural-language→verification lane (single "book my Slack invoice") is lane 2, layered after. Nothing here
requires touching the mature core — it's additive orchestration + one new UI surface.

---

## Bokio VAT-close ("stäng momsrapport") + report catalogue — captured live (2026-07-06)

Magnus set the test company to **annual VAT (årsmoms)** — the flow is identical to monthly/quarterly,
just a longer period. Captured on the LiteIT test company.

### The 10 reports Bokio offers (Rapporter menu)
For our report parity — FlowWink should cover this set:
1. **Resultatanalys** — result analysis / KPIs
2. **Resultatrapport** — income statement (P&L) *(have: `accounting_reports` income_statement + UI tab)*
3. **Huvudbok** — general ledger *(have: general_ledger)*
4. **Balansrapport** — balance sheet (3-col IB/Resultat/UB) *(have: balance_sheet + UI tab)*
5. **Momsrapport** — VAT report / SKV 4700 *(have: `accounting-vat-return-se` + MomsdeklarationTab)*
6. **Fakturarapporter** — invoice reports
7. **Kundreskontra** — accounts-receivable ledger (aged) *(gap? verify)*
8. **Leverantörsreskontra** — accounts-payable ledger (aged) *(gap? verify)*
9. **Lönerapporter** — payroll reports
10. **Taggrapport** — tag/analytic report *(have: analytic accounting)*

Likely FlowWink gaps to confirm: **Resultatanalys**, **Kund-/Leverantörsreskontra (aged AR/AP)**,
**Fakturarapporter**. These are report *views*, not new ledger — cheap to add on the existing data.

### The VAT-close flow is a guided 5-step wizard (`/reports/vat` → period)
Landing page **Momsrapporter**: table of periods with `Period | Status | Skatt senast | Skatt senast
utan EU-handel | Moms att betala`. Current period tagged "Nuvarande period". Opening a period gives a
big **"Moms att få tillbaka / betala"** headline + banner "Rapporten kan ännu inte sparas — vänta till
periodens sista dag" (can't close a period that hasn't ended — a natural guard).

The 5 steps (accordion, each gated on the previous):
1. **Avstämning** (reconciliation gate) — a **checklist** the operator confirms before anything:
   all income/expense booked · unpaid invoices year-end-adjusted (if kontantmetoden) · all Bokio
   invoices booked · previous period's VAT booked · payment accounts reconciled to bank statements ·
   all entries mapped to the correct VAT box. CTA **Bekräfta och fortsätt**.
   → For us: a `vat_period_readiness` check (mirror of `year_end_readiness`) — the agent runs this
   checklist automatically and reports exceptions before proposing a close.
2. **Granska rapport och stäng perioden** — renders the full **SKV 4700 momsdeklaration box grid**
   (see below) for review, then **Stäng perioden och fortsätt** (locks the period).
   → = our `close_accounting_period` + the `accounting-vat-return-se` box output rendered.
3. **Deklarera moms till Skatteverket** — the filing hand-off (gated until closed; shows the
   **deadline**, here 2027-02-26 / 2027-08-17 without EU-trade). This is the authority-specific
   submission step → our SRU/Skatteverket plugin, opt-in, layered later (do NOT gate MVP on it).
4. **Betala moms** — payment step.
5. **Bokför moms på skattekontot** — book the VAT settlement onto the tax account (skattekonto).
   → = a settlement journal entry (2650 redovisningskonto moms → 1630 skattekonto); a template.

### The SKV 4700 box grid Bokio renders (confirms our `vat-return-2026.ts` 1:1)
- **Momspliktig försäljning:** 05, 06 (uttag), 07 (vinstmarginalbeskattning), 08 (hyresinkomster) →
  output VAT **10 (25%), 11 (12%), 12 (6%)**
- **Momspliktiga inköp vid omvänd skattskyldighet:** 20 (varor EU), 21 (tjänster EU), 22 (tjänster
  utanför EU), 23 (varor Sverige), 24 (övriga tjänster) → output VAT **30 (25%), 31, 32**
- **Import:** 50 (beskattningsunderlag) → **60 (25%), 61, 62**
- **Övrig försäljning/omsättning:** 35, 36, 37, 38, 39, 40, 41, 42 (EU/export/trepartshandel/reverse)
- **Moms att dra av:** Summa utgående moms + **48 (ingående moms att dra av)**
- **49 (net)**: "Moms att betala / att få tillbaka" (here **3 016 kr refund** = box 48 input VAT, no output)

Our `accounting-vat-return-se` already computes exactly these boxes (05,10,11,12,20,21,22,30,31,32,35,
39,41,48,49) — the live Bokio grid confirms the box set and the section groupings. Remaining boxes to
verify we emit: **06,07,08 (uttag/vinstmarginal/hyra), 23,24, 36,37,38,40,42, 50,60,61,62** — mostly
zero for a simple SMB but needed for full-form parity.

### Build implication
VAT-close is its own guided wizard (later round, not build round 1), but it **reuses** the existing
`close_accounting_period`, `accounting-vat-return-se`, and a settlement template. The agentic version:
the agent runs step 1 (readiness) autonomously, presents steps 2 (box grid) for human/auditor sign-off,
closes, and books the step-5 settlement — with step 3 (Skatteverket filing) as the opt-in SRU plugin.
Same "human wizard = agent decision tree" pattern as the bookkeeping flow.

---

## Bokio "Bokföring och bokslut" — the bank queue + year-end wizard (captured live 2026-07-06)

The nav section **Bokföring och bokslut** has 5 sub-pages: **Händelser att bokföra** (bank inbox),
**Bokfört** (booked), **Bokslut** (year-end), **Tillgångar** (assets), **Periodiseringar** (accruals).
Also confirmed: Bokio has **offerter (Försäljning) + fakturor (Fakturering)** — FlowWink already at parity.

### "Händelser att bokföra" IS build round 1's review queue (exact reference)
The bank-feed inbox: a list of **unbooked bank events** (`datum · motpart · belopp · konto 1930`), e.g.
Elbolaget AB −2 500, SKATTEVERKET −3 000, Fruktkorgen AB −1 043, Webhotell AB −2 747 … "**13 händelser
att bokföra**". Controls: search, **Filter**, **"Bokför flera"** (batch toggle), **"Delad vy"** (split).

**Selecting an event opens a 3-pane split:**
- Left: the queue.
- Middle: **"Förslag på underlag"** — Bokio tries to auto-match a receipt to the transaction
  ("Bokio kunde inte automatiskt hitta rätt underlag" when none) + upload dropzone.
- Right: **"Välj mall"** with a **"Bokföringsförslag"**: *"Inköp från **Fruktkorgen AB** bokförs ofta
  som:"* → ranked templates (**Fruktkorg 6% moms**, **Inköp Varor 6% moms**), each one-click.

**This is the agentic auto-match rendered as UI**, and it's exactly our stack: the *"bokförs ofta som"*
ranking = `manage_vendor_defaults.last_used_template_id` + `suggest_accounting_template` (keyword×usage)
+ `record_accounting_correction` learning. The "B+" glyph marks agent-proposed items.

**Refined build-round-1 spec** (this is the surface to build):
- A **"Händelser att bokföra" queue** page: unbooked events (from bank import / reconciliation), each row
  = date · counterparty · amount · account.
- **Agent pre-fills each row** with a proposed template + confidence (vendor default → template score →
  fallback), so the human sees a ready proposal, not a blank.
- **Select → split view**: middle = source/receipt match, right = proposed double-entry + ranked
  alternative templates (accept / pick another / edit / reject).
- **"Bokför flera"** batch mode: multi-select high-confidence rows → book all at once (our batch commit
  through staged→post). Agent auto-books above a confidence threshold; the rest queue for review.
- Same Bokio look: serif, paper, calm, graceful at low volume.

### Bokslut (year-end) is a 5-step wizard — confirms our spec exactly
**Bokslut** page: tabs **Aktiva | Kommande | Avslutat**, one row per räkenskapsår (e.g. *Bokslut 2026,
2026-01-01–2026-12-31, Kommande*). Opening it shows the guided wizard **Bokslutsperiod 2026**:

1. **Avstämning** — reconcile everything (gate; "can't close until 2 bank days after year-end so all
   bank events are booked").
2. **Välj bokslutspaket** — choose the year-end package (DIY vs assisted / K2 level — Bokio's
   productisation tier).
3. **Bokslutsbokningar** — year-end adjustment entries (periodiseringar, avskrivningar, etc.; fed by the
   **Tillgångar** and **Periodiseringar** sub-pages).
4. **Skatt och resultat** — the **tax computation + result disposition** → this is Magnus's "transparent
   tax-calc presentation": show how bolagsskatt (20,6 %) is derived, then hand over the files.
5. **Färdigställ bokslut** — finalize: årsredovisning (K2) + INK2/SRU.

This is precisely our spec chain **book → close → VAT → tax → ÅR → SRU**. The wizard steps map to:
`year_end_readiness` (1) → package/scope (2) → `propose_accruals`/`propose_annual_depreciation` +
`run_year_end` (3) → tax calc + `vinstdisposition` (4) → ÅR generator + SRU/INK2 export (5). Steps 4–5
are the biggest build gap today (tax computation transparency + ÅR/SRU output); 1–3 largely exist.

### Net: the whole picture is captured
Three Bokio flows now documented as our build reference — **bookkeeping wizard** (round 1), **VAT-close
wizard** (later), **year-end wizard** (later) — all the same pattern: *human wizard = agent decision tree*,
built on the mature FlowWink ledger core, with the review/control UI as the trust layer.

---

## Bookkeeping intake = the existing FlowWink signals framework (Magnus, 2026-07-06)

Architectural lock-in: the "Händelser att bokföra" queue is **fed by the signals framework we already
have** — NOT a new intake pipeline, NOT new edge functions. Accounting becomes a new **signal consumer**.

**Existing intake surfaces (reuse):** `signal-ingest` (generic, `source_type` + content), channel
ingesters `telegram-ingest` / `twilio-ingest` / `voice-ingest` / `gatewayapi-ingest` / `elks46-ingest`,
`stripe-webhook`, `gmail-inbox-scan`. Dispatch: `signal-dispatcher` / `event-dispatcher` /
`automation-dispatcher`.

**Two lanes into the queue (the key distinction):**
- **Lane 1 — raw signals that need interpretation** (the agent's core job): emailed receipt to the
  company inbox (`gmail-inbox-scan`), bank feed line (bank ingest), Stripe payout / direct bank debit
  (`stripe-webhook`). These land as **proposed verifications** with template + confidence — the agent
  classifies → matches → proposes.
- **Lane 2 — structured business events that already carry their bookkeeping** (no interpretation):
  an eshop purchase **is an order directly** → order→invoice→payment→journal, the verification created
  automatically downstream as a byproduct. Same for issued invoices and payroll runs. These may surface
  in the queue for a confirmation but are high-confidence/auto.

So a signal is either **underlag to interpret** (lane 1) or a **finished business event** (lane 2,
already booked by its own module pipeline). Same signal framework, same staged→post commit, no new edge
functions — accounting just connects to the pipes the BOS already has. This is the intake half of the
"agent does the work, you feed it underlag" pitch: the "feeding" is any existing signal channel.

---

## Backlog (later): a per-tenant signal-mapping layer ("n8n-style virtual layer")

Magnus (2026-07-06): different companies receive signals differently (email receipts, bank API, Stripe,
forwarded from another system), so we'll eventually want a **per-tenant mapping/routing layer** on top of
the signals framework — a virtual orchestration layer, n8n-style: **source → normalize → function/skill.**
This is an *authoring* layer, not a new engine — the building blocks already exist.

Principles (so it doesn't become a mess of special cases):
- **Canonical contracts are the waist.** Every source maps to the same internal event model
  (`src/types/module-contracts.ts` Zod schemas). The mapping layer only translates "company A's odd
  input" → canonical event; nothing downstream cares where it came from.
- **Config/metadata-driven, never hardcoded** (same law as skill scoring) — a mapping is *data*, not an
  `if`-statement.
- **Skills = the nodes.** The MCP surface is already a function catalog, so the virtual layer wires
  `signal → skill`. We already own `automation-dispatcher` / `event-dispatcher` / `agent_automations`,
  and **n8n already exists as a provider** — so we can either build a light internal mapper OR delegate
  the truly custom flows to a real n8n that calls our skills as nodes.
- **Agent-authored wiring:** the agent can create/adjust the mappings itself ("this vendor always emails a
  PDF → route to receipt-parsing") — self-service, not a consulting engagement. Same "agent does the
  work" story, one layer up.

Sequencing: **later** (after build rounds 1–2 — the batch bookkeeping + review queue). Captured so it
isn't lost. Relates to the two-lane intake above and the existing signals framework.

---

## Does this scale? Localization discipline (self-critical, Magnus asked 2026-07-06)

The honest verdict: **the engine is genuinely country-agnostic and scales; Sweden is a pack, not a fork.
We only dig a hole if country logic leaks into the engine.** The "many ifs-and-buts" of Swedish
accounting must live as **data in the locale pack**, never as **branches in the engine**.

**Generic (no country in it — must stay that way):** the ledger (journal_entries/lines, double-entry,
staged→post, voucher numbering, periods), the pipeline (classify → match → propose → post), templates
as data (`template_lines` = %/accounts — structure generic, content packed), chart + VAT rates (generic
table + locale data), and crucially the **declarative VAT-return box map** (`vat-return-2026.ts`:
ledger account → form box). The engine reads the map; it hardcodes no boxes. UK VAT100 (9 boxes) is just
another declarative map. **Double down on this pattern everywhere.**

**The leak to fix (smell):** `accounting-vat-return-se` — a country-suffixed edge function with inline
box logic. If every country gets its own `-xx` function, that's the hole. **Refactor to a generic
`accounting-vat-return` that loads the locale pack's declarative map.** The `-se` suffix is the warning
sign; kill it early.

**The genuinely deep part (be honest — not a data swap):** statutory year-end filing. ÅR (K2) + INK2/SRU
+ iXBRL to Bolagsverket vs UK's Companies House accounts + CT600 + Making Tax Digital — each country's
authority filing is real engineering. Handle it right, not by pretending it's thin:
- A clean **plugin interface**: `StatutoryReportGenerator` + `AuthoritySubmissionAdapter`. A UK dev
  *implements an interface*, never hacks the core.
- **Opt-in; does NOT gate the generic product.** Generic BOS = ledger + VAT + reports. Year-end/filing =
  a country plugin on top.

**Can another dev easily build England?**
- Bookkeeping + VAT + reports: **yes, easily** — a new pack (chart, rates, templates, box-map, bank-format
  adapter). The 80%.
- Statutory filing: **not trivial, but clean** — implement the defined plugin interface. The effort is
  inherent to the domain, not imposed by our design — *as long as the engine never branches on country*.

**The one discipline rule that keeps us out of the hole:**
> **Country = data + adapters behind a stable interface. The engine never has `if (country === 'SE')`.**
Keep the Swedish stuff in the pack; clear the `-se` leak early. Follow this and it scales; break it —
one `-se` function here, one SE rule in a shared handler there — and we silently Sweden-ify the core.

---

## Market model: multi-market generic core + variable localization depth (Magnus, 2026-07-06)

The positioning that follows from the localization law: **FlowWink is multi-market/generic, but certain
countries have significantly broader support for certain modules — because someone invested in that
localization.** This is not a compromise; it's the proven model (cf. Odoo's `l10n_*` packs — generic ERP,
per-country packs of varying depth, many partner/community-contributed).

- **Depth-by-country is a function of who invested, not an architecture limit.** The architecture *permits*
  full depth everywhere; realized depth follows the work. Sweden is deep because we build it deep. Germany
  becomes deep when a German expert invests in its pack.
- **The agentic core works everywhere from day one.** A new country inherits the agent + ledger + review
  queue for free and only supplies local data. The bar is not "re-engineer the pipeline" — it's
  "understand the fine print" (the accounting domain), encoded as pack data, implemented against a defined
  interface without touching the engine.

**Localization depth ladder (how to talk about "broader support"):**
| Level | What | Effort |
|---|---|---|
| 0 | Generic ledger (chart + manual booking) | Day 1, every country |
| 1 | Agentic bookkeeping (pack: chart, VAT rates, templates, box-map, bank adapter) | **Easy — the 80%** |
| 2 | Statutory reporting (year-end, tax forms) | Plugin, real work |
| 3 | Authority e-submission + bank/identity (SRU/MTD, BankID/PSD2) | Deepest |

Sweden climbs toward level 3; a fresh country starts easily at level 1 and climbs as expertise invests.
"Certain modules have broader support for certain countries" = certain countries climbed higher.

**Ecosystem consequence:** packs are contributable (partner/community/certified/monetized). Sweden is the
flagship depth (proves the model + serves Liteit); Germany is open to anyone who knows the fine print.
The only thing that keeps this true is the same law: **the interface must be clean enough that a German
accountant-dev fills the pack without touching the engine.**

---

## SCOPE DECISION (Magnus, 2026-07-06): stop at ledger + RR/BR + SIE→ÅR-online

The chosen v1 scope line — **not a different architecture, just where on the depth ladder we stop:**
**FlowWink is the ledger + agentic bookkeeping + reports (RR Resultatrapport / BR Balansrapport), and we
hand off the statutory year-end via SIE export to a specialist (ÅR online / the accountant).** We do NOT
build ÅR/INK2/SRU/authority-submission in v1.

**Why this is the right cut (not a retreat):**
- The part we drop is exactly the deep, liability-heavy, country-specific tier (L2–L3). Hand it to
  specialists who already own it and carry the responsibility.
- **SIE is the free universal handoff** — SIE4 adapter exists, Swedish de-facto standard, every year-end
  tool imports it; interop-only by design (anti-lock-in).
- **Sharpens the value prop** to the agentic *daily* bookkeeping (our differentiation), not the once-a-year
  filing (where the accountant adds value).
- **De-risks localization scaling** (directly answers the "does this scale?" worry): a new country needs
  only the L1 pack + a standard export. The deepest country-specific tier is outsourced — "build England"
  never means building Companies House/CT600; you export and hand off.

**The honest tradeoff:** we give up the "the year closes itself *inside* FlowWink" GTM wedge. Mitigate:
- Keep a **transparent RR/BR + result & tax preview** inside FlowWink (cheap — just reads the ledger) so
  the user sees where they land continuously; then a clean SIE handoff for the formal ÅR.
- **Do NOT delete the in-house ÅR generator — park it as an opt-in plugin on the roadmap.** The wedge play
  stays available; we're just not gating v1 on it.

**What becomes load-bearing:** the **SIE export must be complete and rock-solid** — it's now the product
boundary. Full bundle: chart + opening balances + all verifications + dimensions/tags. Handoff quality =
whether the user trusts the cut.

**Net:** the pragmatic v1 line, fully consistent with the depth-ladder model, and it makes the generic-BOS
story *stronger* — it outsources precisely the tier that was hardest to scale. Build rounds 1–2 (agentic
batch bookkeeping + review queue + RR/BR + VAT) are unaffected and remain the priority.

---

## BUILD ROUND 1 — SHIPPED & VERIFIED E2E (2026-07-06)

The agentic batch-bookkeeping pipeline is live on dev and proven end-to-end by an external agent:

**Built (one session):**
- `propose_bookkeeping` skill (`db:propose_bookkeeping` in agent-execute, no new edge functions):
  unbooked bank events → template ranking (same scorer as the booking path) → gross→net derivation →
  proposed balanced debit/credit lines + confidence (auto ≥95 / propose ≥70 / escalate <70).
- `bank_transactions.journal_entry_id` FK (migration, forward-dated) + booking link in
  `manage_journal_entry` (pass `bank_transaction_id` → event leaves the queue).
- **"Händelser att bokföra" tab** (Lovable, 3.5 credits, one shot): queue + split view, proposal table
  (Konto|Debet|Kredit), Bokför / Byt mall / Hoppa över, "Bokför flera" batch mode, Bokio look.
- Liteit-2025 fixture: 17 realistic bank events seeded on dev.

**Verified by OpenClaw as external MCP agent (GLM-5.2):**
1. 17 proposals — **11 auto / 6 propose / 0 escalate — ALL balanced** (Σdebet = Σkredit per proposal).
2. Booking as external agent → **staged envelope** (trust layer engaged exactly as designed) →
   admin `approve_pending_operation` → re-invoke with `_approved_operation_id` → **posted**.
3. Posted entry V223 (`12fa074d…`): 5810 Biljetter 500 / 2640 Ingående moms 125 / 1930 kredit 625 —
   gross→net math correct; `source=mcp`; linked to `liteit25-16`; **event left the queue (16 remain)**.
4. Trial balance balanced before and after.

**Found & fixed during the round (the collab loop working):** OpenClaw filed a HIGH finding within
minutes — the manually-seeded `agent_skills` row lacked `mcp_exposed=true` (my INSERT omitted the
column; `module-bootstrap.ts` sets it correctly for bundled seeds). Fixed on dev, OpenClaw resolved its
own finding. **Lesson: when hand-seeding a skill row, copy ALL flag columns from a sibling row —
or better, run the module bootstrap.**

**Known tuning item (data, not pipeline):** the seeded `Resekostnader` template books 25% VAT; Swedish
rail is 6%. Template-content refinement — adjust template data, no code.

**Remaining for the daily-use MVP:** batch-book the remaining 16 fixture events via the UI, vendor-default
learning loop verification, then the VAT-close round (later). The CFO pitch is now demonstrably true:
*underlag in → agent proposes → human approves → posted, voucher-numbered, balanced.*

### Autonomous booking milestone (2026-07-06, same day)

Magnus turned HIL off for booking and challenged the agent to book autonomously. Findings:

- **The queue is a window, not a gate.** `propose_bookkeeping` is read-only; the actual HIL gate is
  `agent_skills.requires_staging` on `manage_journal_entry` (checked at agent-execute:246).
  `trust_level=notify` stays on — everything is still logged/notified post-hoc.
- **With `requires_staging=false`, OpenClaw booked the entire auto lane in one run:** 14 events
  (confidence ≥95) booked directly, **no approvals** — the 2 sub-threshold events (Kontorsgiganten 80%,
  Dustin 75%) correctly LEFT in the queue for human review. Trial balance balanced after.
  Final state: **15/17 fixture events posted, 15 distinct vouchers, 2 in queue.**
- **Template-gap loop closed the same hour:** Magnus's review of low-confidence rows revealed 3 missing
  standard templates (Insättning till skattekonto, El & energi, Kontorsfika & frukt — all present in
  Bokio's standard library). Added to the SE pack (data-only; guardrails caught wrong account
  names/codes → fixed to chart: 1630/5020/7290). Distribution went 10 auto/6 propose → **14 auto/2
  propose/0 escalate, the new matches at 100%**.
- **One transient voucher-number collision** during the rapid autonomous run, self-recovered by retry —
  the assign_voucher_number row lock held (no duplicate vouchers). Watch under batch load.

**The autonomy contract that emerges (the CFO pitch, now demonstrated):** the agent books the ≥95 lane
autonomously; 70–95 waits in the queue for a human click; <70 escalates toward template creation. HIL
is a per-skill dial (`requires_staging`), not an architecture change — turning it off/on changes nothing
about visibility (audit trail, voucher chain, linked bank events, post-hoc notify all remain).

### Review-surface model + Overview dashboard (decisions, 2026-07-06 evening)

**Two views, two questions (Magnus's clarification):**
- **Events to book** = the bookkeeping-adapted review surface: *"what should be booked, and how?"*
  (proposal, template, confidence, debit/credit). **The human's click here IS the approval** — when the
  skill dial is on `approve`, the queue's Book action auto-approves the staged envelope in the same
  click (no double gate). Trygghet mode = agent books nothing alone; every event waits for a click here.
- **Approvals (PendingOperationsList)** = the generic safety net for ledger writes that do NOT come via
  the queue (e.g. an external agent calling manage_journal_entry directly with custom lines). Booking
  operations there are rendered *as bookings* (template + debit/credit table), not raw JSON.
- The trust dial on the skill (approve ↔ info) is the master switch; UI bug fixed so the dial writes
  BOTH `trust_level` and `requires_staging` (approve ⇒ staged; else ⇒ direct). Bootstrap resyncs never
  touch either — the operator's dial survives. Fresh instances default to approve (ship-safe).
- Honest trade-off, per Magnus: hard to be generic AND great — resolved by giving bookkeeping its
  intimate surface while keeping the generic gate as fallback. Explainable.

**Accounting Overview dashboard (new default tab):** answers "what needs me today?" — cards:
Events-to-book count, **Agent activity** (the trust card: what agents booked this week), Result YTD,
VAT position + deadline, Estimated corporate tax 20.6% (the running transparent tax preview),
Period status + pending approvals. **Every card = standalone component + own hook**
(`components/admin/accounting/dashboard/`) so the best cards can be lifted into FlowWink's global
dashboard/analytics later without rework. Accounting-intimate first; platform borrows the summary.

### Approval-system convergence decision (Magnus caught it, 2026-07-07)

Magnus stopped a parallel-system drift: FlowWink has TWO approval stores — `approval_requests`
(approvals module: policy rules, escalation chains `chain_id`, `required_role` — approves *business
decisions* about entities) and `pending_operations` (staging: one-shot gate + `_approved_operation_id`
re-invoke handshake — approves *agent executions*). Different machines, no data duplication — but
building separate UI surfaces per store (tabs on /admin/approvals AND in accounting) would have created
parallel UX systems. Cancelled.

**Decided path:**
1. **Now (MVP): build no more approval UI.** Keep only the module-local accounting Approvals tab
   (with bookkeeping rendering). Do NOT touch the staging handshake — it is a live wire contract for
   external agents.
2. **Later — real unification: staging becomes a SOURCE of the approvals module.** A gated agent
   operation creates an `approval_request` with `entity_type='agent_operation'`. Agent gates then get
   the existing policy machinery for free: escalation chains, roles, amount thresholds ("agent bookings
   over 50k SEK require CFO role"). One policy engine, one inbox; /admin/approvals becomes THE page.
   Same reuse-the-framework move as bookkeeping intake reusing signals.
3. "Gated" badge/filter in the skills panel = config visibility, orthogonal, still wanted.

### Fiscal-year selector + derived year status (decision, 2026-07-07)

Borrowing Bokio's year principle but smarter (Magnus): **a fiscal-year selector in the Accounting page
header; the selected year is the default period context for every report tab** (Journal, RR, BR, ledger,
VAT, dashboard cards). Tabs keep finer-grained controls within the year. One selector, everything follows.

**Discipline rule (dual-axis lesson applied): year status is DERIVED, never stored.** No `fiscal_years`
table with its own status column (would drift against `accounting_periods`). Year status =
f(accounting_periods): Open (any period open) / Closed (all 12 closed + year-end run) / Upcoming (no
periods). Reopening a year = reopening its periods via the existing admin-gated
`reopen_accounting_period`. Dispatched to Lovable as a contained frontend build (FiscalYearContext +
header selector + tab defaults).

### Bank intake: agent-first, not Bokio's wizard page (decision, 2026-07-07)

Magnus's question: Bokio has a dedicated bank-connections page (per account: plusgiro, affärskonto…;
connect real-time or upload a period CSV). Do we copy it — or think agentically ("tell the agent what
it is, and it happens")? Bokio was built for an era when the owner sat in a UI.

**Decision — invert Bokio's priority. Separate three things Bokio bakes together:**
1. **Data structure — KEEP** (it's bookkeeping, not UI legacy): bank accounts are real (affärskonto
   1930, plusgiro 1920, kreditkort, skattekonto 1630); every transaction belongs to a `bank_account_id`
   mapping to a BAS account. Already in the model.
2. **The intake act — AGENT-FIRST**: the user *tells the agent what it is* ("här är affärskontots fil
   för 2025") — chat, email to the company inbox, or external agent over MCP. The agent does what the
   wizard did: identify format, pick/create the right bank account, import, dedup, propose bookings.
   **The conversation is the interface.** The litmus test proved it live: raw CSV + "book the year" →
   OpenClaw found import_bank_file unaided and imported 17/17.
   Gap exposed by the litmus: imports got no `bank_account_id` — with multiple accounts the agent must
   be told/ask which account a file belongs to (conversational metadata, not a form field). Add to
   import_bank_file instructions: resolve/confirm the target bank account.
3. **The control view — thin page for trust**: list accounts, connection status, last import, mapped
   GL account. A *view* for visibility, not the workflow. (Real-time = PSD2/open-banking connector
   feeding the signals framework — already on the backlog with BankID.)

Same law as everywhere: agents do the work; the UI exists to see and steer.

---

## LITMUS TEST: cold agent books the year from raw CSV (2026-07-07)

Magnus's test ("ett bra lackmustest"): wipe the fixture ledger, hand OpenClaw the raw Liteit 2025 bank
CSV with MINIMAL context ("You are the bookkeeper… book the year") — no skill names, no workflow hints.
Measures whether the skill surface alone carries a cold external agent (Law 2 at system level).

**Verdict: the surface carries — every stumble was a PLATFORM gap, not an agent gap, and each became
a permanent guard:**

| Finding | Root cause | Fix (platform, not agent) |
|---|---|---|
| Found `import_bank_file` unaided ✓ but reported *intent as result* ("importing…", nothing landed) | agent self-reports are narrative | "verify before reporting" in mission protocol; skills return verified outcomes |
| Verified import: **17/17, batch id, correct totals** ✓ | — | — |
| Assembled the pipeline unaided: `list_unmatched → propose_bookkeeping → manage_journal_entry`, correct accounts incl. the 3 new templates ✓ | — | Law 2 confirmed |
| Booked WITHOUT `bank_transaction_id` → events never left the queue | propose's instructions mention the link; manage_journal_entry's own did NOT | instruction fix on manage_journal_entry (seed + dev) |
| Transport death mid-run → retry created a **duplicate entry** | no idempotency | **guard: linked event ⇒ `already_booked`, never a duplicate** — the link IS the idempotency key |

**The meta-lesson became the core product principle** (saved to memory as "agent-safe by construction"):
an unreliable agent transport became SAFE for bookkeeping because correctness lives in the platform —
idempotency, verify-don't-trust, dials, incident→guardrail. The system gets safer for agents as it ages.

**Operational notes:** OpenClaw's /v1/responses is synchronous; Cloudflare kills ~100s connections and
its runtime aborts work on client disconnect (no `background` mode — improvement request for OpenClaw).
Long missions must be phased/bite-sized; with the idempotency guard, retries are harmless by design.
Completion state: 17 events re-imported and sitting safely unmatched in the queue — bookable any time
(agent rerun, FlowPilot, or one "Batch book" click in the UI).

---

## How Accounted makes the agent propose correctly (source study, 2026-07-07)

Read-only study of the AGPL source (approach only — no code copied). **Headline: the LLM NEVER picks
accounts.** Claude (Bedrock) only extracts document fields; their schema forcibly nulls any
accountSuggestion from the AI. Kontering comes from a deterministic multi-signal engine:

- **~130 curated booking templates** with VAT treatment class (standard_25/reduced/reverse_charge/
  exempt/export), risk_level (NONE→HIGH ⇒ requires_review), AB-vs-EF account variants, deductibility
  rules, Swedish specifics (representation caps, milk 12→6% 2026, mileage brackets).
- **Multi-signal matching:** MCC code +0.40, keywords +0.30 (capped), direction +0.10, × template
  confidence; bank-noise stripped pre-match. Direction is a STRUCTURAL filter (expense templates never
  see inflows) — same fix we shipped tonight.
- **Counterparty memory:** per-merchant category histogram; confidence 0.5+0.06×count capped 0.85
  ("booked X times before for this counterparty"); direction-checked; empty history = honest no-signal
  (they explicitly rejected global-frequency padding).
- **Risk gates orthogonal to confidence:** HIGH-risk templates always require human review regardless
  of match score. They NEVER auto-book — every suggestion is human-confirmed.
- **Learning loop:** every successful booking upserts the counterparty template + boosts mapping-rule
  confidence. Duplicate guard on (date, amount) with explicit allowDuplicate override.
- Their stated tradeoff: curated templates cost maintenance but keyword-only scoring produces expensive
  errors (reverse-charge, VAT deduction, entity-type). Compliance pays for the curation.

**Validation + BR2 adoption list (approach, not code):**
1. Graduated counterparty confidence (0.56→0.85 by count) replacing our binary vendor-default-98 —
   show "booked N times before" in the review UI.
2. Per-TEMPLATE risk_level ⇒ requires_review (orthogonal to confidence; complements our per-skill HIL
   dial) — representation/internal-transfer/reverse-charge templates always reviewed.
3. Richer template metadata as DATA: VAT treatment class, deductibility, AB/EF variants.
4. (date, amount) duplicate guard beside the bank-link idempotency key.
5. MCC signal when card feeds arrive.
Where we deliberately differ: our autonomy dial (auto-book ≥95 with HIL off) — they never auto-book;
their risk gates become our safety complement, not a replacement for autonomy.

### Receipts/underlag in the agentic flow (design, 2026-07-07)

Magnus: Bokio lets the bookkeeper attach underlag with a "+" — how do we think when the AGENT books?
**Answer: invert the flow — underlag is a lifecycle, not an attach-moment.**

1. **Book now, track the gap.** The agent books from the bank event immediately (books stay current);
   the verifikat gets a tracked `missing underlag` state. (Standard practice: verification = the bank
   event initially, completed later. BFL's 7-year archive gets completed over time, visibly.)
2. **Receipts arrive as signals** — email to the company inbox (gmail-inbox-scan), photo/upload
   (extract-receipt + OCR exist), forwarded supplier PDFs. The documents module is the pool
   (= Bokio's "Uppladdat").
3. **The agent matches pool ↔ verifikat continuously** on (amount, date, counterparty) — Bokio's
   "Förslag på underlag" pane as a standing bidirectional process. ≥threshold auto-attach + clear the
   flag; below → proposal in the review queue.
4. **Gaps are visible and CHASED**: dashboard card "N entries missing receipts" + journal filter; the
   agent nags the human ("receipt for the Dustin purchase 12/6 missing — reply with a photo").
   Compliance drudgery no human wants = ideal agent work.
5. The human "+" (Bokio gesture) remains in the review UI — the exception, not the flow.

**Build (BR2/BR3, mostly assembly):** journal_entries↔documents link (+ underlag_status), a
match_receipts skill (pool↔verifikat scoring), missing-receipts dashboard card + journal filter,
inbox-signal wiring. Existing pieces: documents module, extract-receipt, gmail-inbox-scan, signals.
