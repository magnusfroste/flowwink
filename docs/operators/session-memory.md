# Session memory — Program 80 (living handoff)

> **Purpose:** everything a fresh Claude Code session (local or cloud) needs to
> continue the Program 80 grind without re-deriving context. Update this doc at
> the end of significant sessions. Last updated: **2026-07-05 (evening)**.

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

## Current standings (2026-07-05)

Modules ≥80%: **products 80, ecommerce 81, invoicing 83, live-support 86,
webinars 89, companies 93, approvals/customer360/docs/forms/sales-intelligence
100**. Mean parity ~62%. 767+ vitest green, 56+ guardrail tests.

In flight: **PR #108** (draft) — after reconciliation vs main, effectively
just this memory doc (the code fix and flips landed on main via the local
session, see update below).

**UPDATE (late 2026-07-05/06):** a LOCAL Claude Code session took over the
Lovable-MCP-dependent work (local CLI connects to mcp.lovable.dev directly
and reliably; cloud-session connector enablement is flaky). It independently
found and fixed the same `kb_articles.answer` → `answer_text` bug (4c9b9ad0),
redeployed agent-execute, flipped **kb#search → done** (8201f2b8, kb now 79%)
and **products#uom → done** (0c4f3817, products 80%) directly on main, plus
fleet-tooling fixes (3d6930e7). The cloud session verified the redeploy live
from the outside (search_kb returns clean results via the gateway) and
reconciled PR #108 down to this memory doc. **Coordination convention:
whoever does substantive work updates THIS doc; the other session watches
git (`git ls-remote` polling) and the live gateway surface.**

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

## Open queue (next session starts here)

1. ~~agent-execute redeploy + kb#search flip~~ **DONE** (local session,
   2026-07-06). Next kb step: article_feedback surface gets kb over 80.
2. **Revoke/rotate** the temp `fwk_d0911…` gateway key (Magnus, in admin).
3. Data-quality: `support_agents` row with `current_conversations=24` vs
   `max_conversations=5` — stale counter, needs a reconcile (skill or cron).
4. UI-build backlog for remaining partials: reconciliation rule admin,
   expenses policy UI, SLA business-hours wiring, manufacturing shop-floor,
   kb article_feedback surface (see `docs/parity/ui-backlog.md`).
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
