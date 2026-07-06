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
