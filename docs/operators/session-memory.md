# Session memory — Program 80 (living handoff)

> **Purpose:** everything a fresh Claude Code session (local or cloud) needs to
> continue the Program 80 grind without re-deriving context. Update this doc at
> the end of significant sessions. Last updated: **2026-07-08 (helicopter sync + audit)**.

## The program

**Program 80:** every module ≥80% Odoo parity, SMB-weighted (P1: CMS, CRM,
e-commerce, quotes/contracts/signing, invoicing). Two inviolable rules:

- **Stage-3 rule:** a capability flips to `done` ONLY on live runtime evidence
  on the dev instance (rzhj). Static inspection has repeatedly passed while
  runtime failed (ar_aging_report CTE bug, normalize_email drift, UoM
  foundation missing, kb_articles.answer column). Run it live or it isn't done.
- **Dual-surface law:** a capability needs BOTH the agent skill AND an admin UI
  surface to count as `done`.

Loop: **find → fix → deploy → re-verify live → flip scorecard**. Scorecards in
`docs/parity/capabilities/*.json` (put the live evidence in the `verify`
string); regenerate with `bun run scripts/parity-report.ts` before every push
(CI has a `--check` gate).

## Current standings (2026-07-08, helicopter sync + cloud-session audit)

**Mean parity 86%** across 55 benchmarked modules (61 → 64 → 86 in four
days). The Program 80 fleet target is passed at fleet level; kb and deals
are at **100%**. Read the number honestly: 86% of *our benchmarked
capability lists*, not 86% of Odoo's full surface — say "covers the
capabilities an SMB uses" in sales conversations.

**The 07-06 → 07-08 sprint (local session, ~266 commits):** eight parity
rounds (timesheets/fixed-assets/calendar → pricelists/multi-currency/wiki/
payroll → shipping/projects/sla/recruitment → field-service/pos/resume →
pages/crm/hr/kb → deals 100 w/ configurable stages+teams+history+FX), the SE
momsdeklaration (SKV 4700) built+flipped, CRITICAL accounting fixes (export
crash, book-button crash, unbalanced payroll GL, VAT-settlement template),
approval-system convergence (staging ops surface as approval_requests — one
review queue), autonomous-booking milestone (14 events, HIL off), and the
kb feedback+versioning surfaces.

**Cloud-session audit verdict (2026-07-08):** evidence bar HELD — verify
strings carry live gateway runs with concrete return values; independent
spot-checks 3/3 pass (list_shipping_options price-sorted carriers,
manage_pipeline_stage deals, payroll_timesheet_basis — and the PGRST202
self-correction hint fired perfectly on a wrong-param probe).

**⚠️ HISTORY REWRITE (2026-07-07/08):** a Lovable GitHub re-connect REPLACED
the repo's git history — main now roots at "template: new_style_vite_react_
shadcn_ts → Connect to Lovable Cloud" (~266 commits total). File content
verified complete (zero lost files vs the old tree), but old commit SHAs
cited in docs/verify strings no longer resolve on main, and branches from
the old history can't merge ("unrelated histories" — recreate them from new
main). If Lovable is ever re-connected again, expect the same: content
survives, provenance doesn't.

**UPDATE (late 2026-07-05/06):** a LOCAL Claude Code session took over the
Lovable-MCP-dependent work (local CLI connects to mcp.lovable.dev directly
and reliably; cloud-session connector enablement is flaky). It independently
found and fixed the same `kb_articles.answer` → `answer_text` bug (4c9b9ad0),
redeployed agent-execute, flipped **kb#search → done** (8201f2b8, kb now 79%)
and **products#uom → done** (0c4f3817, products 80%) directly on main, plus
fleet-tooling fixes (3d6930e7). (NB: these SHAs are from the pre-rewrite
history and no longer resolve on main — kept for the narrative.) The cloud
session verified the redeploy live from the outside (search_kb returns clean
results via the gateway) and reconciled PR #108 down to this memory doc.
**Coordination convention: whoever does substantive work updates THIS doc;
the other session watches git (`git ls-remote` polling) and the live gateway
surface.**

## The fleet & who deploys what

| Instance | Ref | Owner | Deploy channel |
|---|---|---|---|
| dev.flowwink.com | `rzhjotxffjfsdlhrdkpj` | **Lovable-managed** — Magnus has NO DB secrets | Lovable nudges (MCP `send_message` or Magnus's Lovable chat); `query_database` via Lovable MCP can run SQL directly |
| www / demo / liteit / autoversio | (see `provisioning-and-updates.md`) | Magnus | `supabase db push` / `functions deploy` / `sync:skills`, or `scripts/deploy-edge-via-api.sh`; GitHub Action `.github/workflows/supabase-deploy.yml` (prod fleet only, needs secrets set) |

**A site is 4 layers** — schema (migrations), skills (bootstrap/sync), edge
functions (deploy), frontend (Vercel auto from `main`). They drift
independently. Skills come from `skillSeeds` via **/admin/modules → "Sync
skills from code"** — never from migrations.

**Migration-ledger drift (root-cause class, 5+ hits):** any migration
timestamped below the ledger HEAD is **silently skipped** on the managed
instance. All fixes for rzhj must be **forward-dated + idempotent**. CI guard:
`scripts/check-migration-forward-dated.ts` (blocking).

## How OpenClaw is reached & how we use it

OpenClaw is the external autonomous operator (Magnus's own service on
liteit.se) that exercises the FlowWink MCP gateway **uncoached** — our QA
executor and the source of Stage-3 evidence "from the outside".

```bash
curl -s -X POST https://openclaw.liteit.se/v1/responses \
  -H "Authorization: Bearer <OPENCLAW_TOKEN — ask Magnus; dev token, rotate freely>" \
  -H "Content-Type: application/json" \
  -d '{"model":"openclaw","input":"<natural-language task>"}'
```

Response: OpenAI Responses-style JSON — the answer is in
`output[].content[].text`, token usage in `usage`. Calls are synchronous and
can take minutes for multi-step chains; set a generous curl timeout.

**Division of labour (proven):** OpenClaw = eyes/executor (runs business
chains via the gateway, uncoached). Claude Code = strategist/claws (validates
each finding false-positive vs real, fixes at the engine level, pushes to
`main`, re-verifies live). OpenClaw findings are **frequently false positives**
(wrong param guesses read as "missing function") — only a live call or
`pg_proc` is authoritative.

Gotchas:
- Prompt it to use the **`execute_skill` tool** (`execute_skill({name,
  arguments})` in `?mode=dispatch`). Left to itself it sometimes issues raw
  JSON-RPC methods (`{"method":"convert_uom"}`) → `-32601 Method not found`
  with `data.method` = the skill name. That error signature means *OpenClaw
  misdialled*, not that the skill is missing.
- Its model has had stability issues (drops mid-run); re-prompt rather than
  assume platform failure.
- Tell it explicitly NOT to retry with different parameter names when you're
  testing exact schemas — otherwise it self-corrects and masks the defect.

**Direct gateway verification (no OpenClaw needed):** the REST mirror on the
dev instance —

```bash
BASE="https://rzhjotxffjfsdlhrdkpj.supabase.co/functions/v1/mcp-server"
curl -s -X POST "$BASE/rest/execute" -H "Authorization: Bearer <fwk_ gateway key>" \
  -H "Content-Type: application/json" \
  -d '{"tool":"<skill_name>","arguments":{...}}'
# dispatch mode: POST "$BASE/rest/execute?mode=dispatch" with tool search_skills / execute_skill
```

Gateway keys (`fwk_…`) live in the instance's admin (API keys). The temp key
used in the 2026-07 sessions is **due for revocation** — mint a fresh one.
The rzhj **anon key** is public (frontend bundle) and fine for PostgREST reads
where RLS allows and for `--no-verify-jwt` public functions.

## Lovable channels (dev instance)

- **Lovable MCP** (`mcp.lovable.dev`): project id
  `fac5f9b2-2dc8-4cce-be0a-4266a826f893`. `query_database` runs SQL directly
  (DML+DDL, free); `send_message` tasks Lovable's agent (**costs credits** —
  batch requests). Cloud-session caveat: connector enablement is per-session
  and flaky in claude.ai/code web sessions (toggles don't propagate into a
  running session until a platform reconnect); local Claude Code CLI connects
  directly and is more reliable.
- **Magnus's own Lovable chat** — the fallback nudge channel; paste a numbered
  deploy list (migration → edge deploys → skill seeds → verification SQL).
- Lovable hand-seeds skills when nudged ("seed skill X") and **gets handlers
  wrong** — it seeded `search_kb` as `edge:agent-execute` (recursive 400
  `skill_id or skill_name required`). Prefer asking for **"Sync skills from
  code"** (updates all definition fields from bundled seeds, preserves
  trust_level) or fix the row yourself via `query_database`.
- Lovable auto-deploys NOTHING from a `main` push except what Vercel builds
  (frontend). Migrations and edge functions ship only when nudged.
- **⚠️ Re-connecting Lovable ↔ GitHub rewrites repo history** (see HISTORY
  REWRITE above): content survives, git provenance does not. Avoid re-connects;
  if one must happen, snapshot branches/tags first.

## Open queue (next session starts here)

1. ~~kb over 80~~ **DONE** — kb at 100 (feedback + versioning live-verified
   2026-07-07). Remaining sub-80 tail: contact-center 41, media 57,
   accounting 58 (SE statutory P1s: NE-bilaga/INK2/SRU, SIE 4 ledger
   export/import, BFL retention; then storno correction flow).
2. **Revoke/rotate** the temp `fwk_d0911…` gateway key (Magnus, in admin —
   still valid as of 2026-07-08, used for the audit spot-checks).
3. Data-quality: `support_agents` row with `current_conversations=24` vs
   `max_conversations=5` — stale counter, needs a reconcile (skill or cron).
4. ~~UI-build backlog~~ largely DONE in the 07-06/07 UI wave (reconciliation
   rules, SLA business hours, expense policies, budgets, gift cards, shipping
   rates, milestones/subtasks, document tags, timesheets/fixed-assets UIs,
   kb feedback). Remaining: manufacturing shop-floor (manufacturing 52%).
5. Prod-fleet secrets for `.github/workflows/supabase-deploy.yml` when Magnus
   chooses to enable auto-deploy.
6. Honest-depth items intentionally left partial: crm scoring_basic (vs Odoo
   predictive), pos variant picker (skill-only today — dual-surface law).

## Hard-won operational rules

- Verify by **behaviour**, not existence: `pg_proc` by name says nothing about
  body/signature currency. PGRST202 = wrong param NAMES (or missing function);
  agent-execute enriches it with declared params (self-correction).
- SECURITY DEFINER admin functions need
  `(auth.role() = 'service_role' OR has_role(auth.uid(), <role>))` — the
  gateway runs with the service key where `auth.uid()` is NULL.
- Never `.single()` on get-by-id paths — `.maybeSingle()` + `{found:false}`.
- Secret-bearing tables in generic CRUD need a `TABLE_SELECT_MASKS` entry
  (support_agents/voice_sip_password was leaked by `select *`).
- Dedupe-proof pattern for sweeps: run twice — second run sending 0 proves
  marker stamping.
- Commit footer convention and PR-as-draft; merges only on Magnus's explicit
  "merga".
