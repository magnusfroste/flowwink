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
