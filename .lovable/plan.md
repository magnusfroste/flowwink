# Lyft accounting-modulen — Nivå 1 (neutral core)

**Mål:** Höj accounting-kärnan till GnuBok-paritet **utan** att låsa något till Sverige. Allt som byggs här är neutralt och fungerar lika bra för `se-bas2024`, `ifrs-generic`, framtida `de-skr04` etc.

**Princip:** Land-specifikt = locale pack. Universella primitiver = core. Den här PR:en rör bara core.

---

## Steg 1 — Staged-Operation Envelope för MCP-writes

GnuBok returnerar på varje write-tool:
```json
{
  "staged": true,
  "risk_level": "high|medium|low",
  "actor": "agent|user",
  "preview": { ...payload som skulle skrivas... },
  "period_status": "open|locked|closing",
  "message": "Will post journal entry 2025-V123...",
  "next": { "approve": "approve_pending_operation", "reject": "reject_pending_operation" }
}
```

**Vad vi gör:**
- Ny tabell `pending_operations` (id, skill_name, args, preview, risk_level, status, created_by, expires_at)
- Wrapper i `agent-execute` som — om en skill är markerad `requires_staging=true` — *inte* exekverar utan returnerar envelope + skriver `pending_operations`-rad
- 2 nya MCP-skills: `approve_pending_operation(id)`, `reject_pending_operation(id, reason)`
- Skill-flag `requires_staging` på `agent_skills`-tabellen (default false; sätts true för: `record_journal_entry`, `book_expense`, `mark_expense_paid`, `record_pos_sale_v2`, `close_pos_session_v2`, `close_accounting_period`, framtida `correct_entry`, `reverse_journal_entry`)
- `period_status` injectas automatiskt på varje date-bound write via helper i agent-execute (läser `accounting_periods.is_closed` för datumet)
- Approval-engine vi redan har återanvänds — staging är bara ett "preview-first" UX-lager ovanpå

**Neutralt:** Helt locale-agnostiskt. Bara MCP-protokoll-förbättring.

---

## Steg 2 — Voucher-Gap Detection

Svensk lag kräver obrutna verifikatnummer-serier, men **även** IFRS/GAAP/DATEV kräver kontinuitet — det är en universell god revisionspraxis.

**Vad vi gör:**
- Ny SECURITY DEFINER RPC `list_voucher_gaps(p_year int, p_series text default null)` → returnerar `[{ series, expected_next, last_seen, gap_size, gap_after_date }]`
- Ny RPC `explain_voucher_gap(p_series, p_voucher_number)` → letar i `audit_logs` efter delete/void-händelser kring numret, returnerar förklaring eller "unknown — investigate"
- 2 MCP-skills: `list_voucher_gaps`, `explain_voucher_gap`
- Ny tab i `/admin/accounting` "Voucher Integrity" som visar gaps + förklaringar
- DB-trigger på `journal_entries` insert som validerar att `voucher_number = max(voucher_number) + 1` per serie (skippar om explicit `allow_gap=true` i context — för migrations)

**Neutralt:** Verifikatserier finns i alla länders bokföring. SE använder "A", DE använder "SK", US ofta "JE" — alla får detta gratis.

---

## Steg 3 — Year-End Orchestration Skills

GnuBok har `run_year_end`, `propose_dispositioner`, `propose_accruals`, `propose_annual_depreciation`, `year_end_readiness`. Detta är bokslutsmekanik som är **universell** — bara konton/regler skiljer sig per pack.

**Vad vi gör (core):**
- Ny RPC + skill `year_end_readiness(p_year)` → checklista: alla perioder stängda? alla bankkonton avstämda? alla fakturor bokförda? alla expenses paid eller redovisade som payable? avskrivningar postade? VAT-period stängd?
- Ny RPC + skill `propose_accruals(p_year)` → letar opaid invoices/expenses med leveransdatum före årsskiftet och föreslår periodiseringar
- Ny RPC + skill `propose_annual_depreciation(p_year)` → körrutin på `fixed_assets`-tabellen (vi har modulen redan)
- Ny RPC + skill `run_year_end(p_year, p_confirm)` → orkestrerar i ordning, returnerar staged envelope om något kräver godkännande
- `propose_dispositioner` (SE-specifikt: periodiseringsfond, överavskrivningar) flyttas till **`se-bas2024`-pack** som `pack.year_end_proposals` callback — så core kan anropa pack-specifik logik utan att veta vad den gör

**Neutralt:** Orchestration-skalen är generisk. Land-specifik logik (dispositioner) blir pack-callback.

---

## Steg 4 — MCP-skill guardrail

- Utöka `scripts/verify-mcp-invariant.ts` (eller `lint:skills`) med:
  - Alla `requires_staging=true` skills MÅSTE returnera staged envelope (test som mockar agent-execute)
  - `tools/list`-payload < 50KB (förhindrar context-bloat)
  - Alla nya skills har `Use when:` / `NOT for:` i description
- Lägg till i `.github/workflows/mcp-regression.yml`

---

## Vad som **INTE** ingår (medvetet)

- `de-skr04`-pack (separat PR — gör den när core är stabil)
- SKV 4700 / AGI / NE-bilaga (SE-specifikt → flyttas till `se-bas2024`-pack senare)
- PSD2 live bank-feed (separat integration, inte core-fråga)
- Inline HTML widgets i agent UI (UX-polish, Nivå 3)
- Dynamic OAuth client registration (separat säkerhetsspår)

---

## Filer som skapas/ändras

**Migrationer:**
- `pending_operations`-tabell + RLS
- `agent_skills.requires_staging` kolumn
- `journal_entries` voucher-gap-validation trigger
- 6 nya RPC:er: `list_voucher_gaps`, `explain_voucher_gap`, `year_end_readiness`, `propose_accruals`, `propose_annual_depreciation`, `run_year_end`
- Seed 8 nya skills i `agent_skills`

**Edge functions:**
- `agent-execute/index.ts` — staging-wrapper + period_status-injection

**Locale pack-kontrakt:**
- `src/lib/locale-packs/types.ts` — ny optional `year_end_proposals?: (year: number) => Promise<AccrualProposal[]>` callback
- `src/lib/locale-packs/se/index.ts` — implementera dispositioner-callback (stub OK i denna PR)

**UI:**
- `src/pages/admin/AccountingPage.tsx` — ny tab "Voucher Integrity"
- `src/pages/admin/AccountingPage.tsx` — ny tab "Year-End" med readiness-checklista + körknapp
- `src/pages/admin/PendingOperationsPage.tsx` — ny sida för pending staged ops (eller tab i `/admin/developer`)

**Tester:**
- `verify-mcp-invariant.ts` utökas
- `src/lib/__tests__/staged-operations.test.ts`
- `src/lib/__tests__/voucher-gaps.test.ts`

**Memory:**
- `mem/accounting/staged-operations-envelope.md`
- `mem/accounting/voucher-gap-detection.md`
- `mem/accounting/year-end-orchestration.md`
- Index-uppdatering

**Docs:**
- `docs/modules/accounting.md` — sektion "Staging, Voucher Integrity, Year-End"
- `docs/processes/record-to-report.md` — uppdatera flödet

---

## Förslag på ordning

1. Migration: `pending_operations` + skill-kolumn + voucher-trigger
2. agent-execute staging-wrapper + 2 approve/reject-skills
3. Voucher-gap RPCs + skills + UI-tab
4. Year-end RPCs + skills + UI-tab + pack-callback
5. Guardrail-tester + CI
6. Docs + memory

Vill du att jag kör allt i en följd, eller delar upp i ~3 commits med stopp emellan så du hinner verifiera?
