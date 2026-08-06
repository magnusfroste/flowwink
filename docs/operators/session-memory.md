# Session memory — Program 80 (living handoff)

> **Purpose:** everything a fresh Claude Code session (local or cloud) needs to
> continue the Program 80 grind without re-deriving context. Update this doc at
> the end of significant sessions. Last updated: **2026-07-14 (schema skills #120 + deploy queue cleared, cloud session)**.

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

## The Flowtable/Flowwork arc (2026-07-11 → 07-13, cloud session, PRs #111–#118)

Magnus drove a rapid product sprint: **Flowtable** (the Airtable-style module)
built out to relational, agent-operable parity, then wired into **Flowwork**
(renamed from Cowork) as a retrieval source. All merged to `main`.

**What shipped, in order:**

1. **Agent surface** (#111 wave): `query_flowtable` (handler
   `module:flowtable` in agent-execute) — server-side filter (eq/neq/ilike
   pushed to PostgREST as `values->>key`; gt/gte/lt/lte + is_empty/not_empty
   over a bounded scan, cap 20 000 rows / pages of 1 000), free-text search,
   numeric-aware sort, `count_by` aggregation (top 100), `total_matched` via
   `count:'exact'`, and helpful table-not-found errors listing real
   base/table combos. Plus `manage_flowtable_record` (update MERGES by
   default). Colleague added `list_flowtable_tables` (rpc:) as the discovery
   link. Live-verified on rzhj against the colleague's "Field Service Ops"
   base (6 000-row Error Codes: count_by severity → 1500×4).
2. **UI fixes:** Airtable-style hover checkbox (row number ⇄ checkbox on
   group-hover); column **type change was a silent no-op** (dropdown called
   onRenameField) — now a real `onChangeFieldType`; `toDateInputValue()`
   coerces imported M/D/YYYY text so date cells don't blank.
3. **Relations** (#113/#114): field types `link` (link_table_id +
   display_field; value = target row id), user-defined **select choices**,
   `lookup` (via_link_field + target_field) and `rollup`
   (source_table_id + source_link_field + agg + agg_field). Query-side:
   `resolve_links=true` → `item._links[field]={id,display}`;
   `resolve_computed=true` → `item._computed[field]` (lookup batched by
   target table; rollup bucketed with an `.in()` on the link key). All field
   config lives in `flowtable_fields.options` JSONB — **new field types need
   no migrations**. Live-verified (rollup PX-500=1, AX-300=2; link display
   names resolved).
4. **Views** (#115): per-table `view_config` JSONB (filters/sort/group_by/
   kanban_field), `applyViewConfig()` client-side feeding all views, filter/
   sort popover toolbar, **Kanban** via @dnd-kit (DragOverlay, pointer
   distance 4). Migration `20260712140000_flowtable-view-config.sql` adds the
   column (forward-dated after the CI guard caught my back-dated first try).
5. **Cowork → Flowwork rename** (#116): story only — UI copy, module name,
   route now `/admin/flowwork` (legacy redirects dropped on Magnus's OK).
   **Wire identifiers deliberately kept** per naming policy: `cowork_messages`
   table, `post_to_cowork_chat` skill, `cowork_chat` settings key,
   `workspaceChat` module id, stored mode value `'cowork'`. Documented in
   `workspace-chat-module.ts` docstring.
6. **Flowtable as Flowwork source** (#117, `dd8bd200`): workspace-chat gains
   a `flowtable` source — question-driven (keywords ≥3 chars, max 6, from the
   latest user message), only `workspace_shared` bases (10 max, 30 tables),
   `or()` ilike across keys×terms, 6 rows/table, citations deep-link to
   `/admin/flowtable/{base}/{table}`. Fits the source-based CAG fair-share
   budget like the other sources.
7. **User/currency/rating fields** (#118, `76291032`): `user` field stores a
   **profiles.id** (real platform identity — never role-as-value; optional
   `options.role_filter` only scopes the picker, 12 app_roles minus
   customer). UserCell = people picker with initials chip via
   `useTeamProfiles(roleFilter)`. `resolve_links` expands user fields to
   `{id, display, email}`; agents can SET an assignee by writing a
   profiles.id. Plus `currency` (options.currency_code) and `rating` (1–5
   stars, click-same-to-clear).

**Architecture decisions locked:** assignment stores the person
(profiles.id), roles only filter pickers; rename = fix the story, keep the
wire; Flowtable field types are pure `options`-JSONB extensions (no schema
churn); Flowwork retrieval stays question-driven and shared-bases-only.

**✅ Deploy state on rzhj — RESOLVED 2026-07-14.** All four layers landed:
migration `20260712140000` applied, `workspace-chat` + `agent-execute`
redeployed (confirmed via "Deployade workspace-chat & agent" on main), skills
synced. Stage-3 (b) verified live: `resolve_links` on a user field returns
`{id, display: "magnus froste", email: "magnus@froste.eu"}`. Stage-3 (a)
(Flowwork UI question citing flowtable) is in practice covered by the local
session's M3 end-to-end verification of Flowwork on the Retrieval Engine.

**Schema-management skills (#120, squash `9580f4ec`, 2026-07-14):**
`manage_flowtable_table` (create with inline `fields[]` — a whole table
schema in one call; rename keeps slug; delete needs `confirm=true` when rows
exist) + `manage_flowtable_field` (create/update/delete columns;
type-specific option validation — link accepts table NAME, lookup checks the
via-field is a real link, rollup validates agg; update MERGES options).
Full Stage-3 loop ran uncoached via the gateway: create table with
link+lookup+user+select in one call → row with assignee → resolve_links/
resolve_computed all correct → options-merge verified → validation + delete
guard verified → test table deleted. Agents can now BUILD bases, not just
fill them. **Gotcha found in the process:** "Sync skills from code" seeds
from the browser's loaded SPA bundle — a stale tab syncs the OLD seed list
silently. Hard-refresh /admin/modules before clicking sync.

**Recurring conflict pattern:** `supabase/seed/module-skills.json` is a
generated artifact and conflicts whenever both sessions push — resolve with
`git checkout --theirs`, then regenerate `npm run skills:json`, then verify
both sides' skills survived.

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

### ⇄ Handoff to local Claude — `manage_flowtable_field` accepts bad `choices` and reports success (2026-08-06, cloud session)

**Your file (`agent-execute`), so untouched — but this is the highest-value fix
in the batch.** Magnus reported that OpenClaw could not set dropdown options
over MCP. It can: 6 of 12 select fields on Optic's `produkter` base were
correctly configured, and I set the other 6 live through the gateway. What is
broken is what happens when the agent gets the shape slightly wrong.

`normalizeFlowtableFieldOptions` (agent-execute, ~line 10569):

```ts
if (type === 'select' || type === 'multiselect') {
  const out: Record<string, unknown> = {};
  if (Array.isArray(opts.choices)) out.choices = opts.choices.map((c: any) => String(c));
  return { options: out };
}
```

Two failure modes, both live-reproduced through the gateway:

| sent | result | should be |
|---|---|---|
| `options: {choices: "Ej satt,Ej tillämpligt"}` | `status: success`, `updated: true`, `options: {}` | error naming the expected shape |
| `options: {choices: [{label:"Aktiv",value:"aktiv"}]}` | `status: success`, `options: {choices: ["[object Object]"]}` | error — `String(obj)` is never a choice |

The first is the one that produced the report: **an agent that formats `choices`
as a string is told it succeeded and the column stays empty.** The third shape
I tried — `choices` at top level instead of inside `options` — errors correctly
(*"Nothing to update"*), which is the behaviour the other two should have.

Suggested fix, both in the same branch: reject a non-array `choices`, and reject
entries that are not strings/numbers, naming what was received. `select` is the
only place in `normalizeFlowtableFieldOptions` that silently drops rather than
errors — `link`, `lookup` and `rollup` all validate properly, so this is a hole
in one branch, not a design choice.

**Re-probe it yourself before and after — the whole point is the response, not
the stored row.** Against any instance, `POST /functions/v1/mcp-server/rest/execute`
with `{"tool":"manage_flowtable_field","arguments":{…}}`:

| `arguments` | today | wanted |
|---|---|---|
| `{action:'update', table:…, key:…, options:{choices:['A','B']}}` | ✅ works | unchanged |
| `{…, options:{choices:'A,B'}}` | `success`, `options:{}` | error |
| `{…, options:{choices:[{label:'A',value:'a'}]}}` | `success`, `choices:['[object Object]']` | error |
| `{…, choices:['A','B']}` (outside `options`) | ✅ `"Nothing to update"` | unchanged — this is the model |

**STATUS 2026-08-06 (later the same day): not urgent, still real.** OpenClaw
went back and set the remaining fields itself, correctly — it even improved two
of my guesses (`prissatt` → `Satt / Ej satt / Ej tillämpligt`, and it knew the
right order for `produkt`). Optic is verified clean: **0** orphaned select
values, **0** multiselect values outside their list, **0** fields with empty or
`[object Object]` options. So nothing is on fire.

What that does NOT change: the handler still answers `success` for a wrong
shape. OpenClaw got it right this time; the next agent that guesses gets the
same silent confirmation, and the only thing that caught it was a human noticing
empty dropdowns. Fix the response, not the data.

**Two halves already shipped from here**, so don't redo them:
- `20260808190000_flowtable-list-tables-expose-options.sql` makes
  `list_flowtable_tables` emit `options`. The RPC was the only schema-discovery
  surface an external agent has and it returned `{key,name,type}` — so a
  configured select and an unconfigured one looked identical from outside, and
  read-back (the only way to catch a silent write) was impossible. **Applied to
  optic only; the other four instances need it.** (Renumbered from `…180000`
  late — main had picked up `20260808180000_terms-url-token.sql` with the same
  stamp. Timestamp collisions between the three of us are now a real thing;
  `scripts/check-migration-forward-dated.ts` catches them.)
- `FlowtablePage.tsx` no longer hides a select value that is not among its
  choices. It rendered `<select value="Månadsavgift">` with no matching
  `<option>` → blank cell, and the fallback list offered `New / In progress /
  Done`, so the obvious repair overwrote good data with a meaningless value. The
  multiselect renderer had handled this all along; single select did not.
  Guardrails in `src/lib/__tests__/flowtable-select-choices.guardrails.test.ts`
  (negative-tested: restoring the old logic fails 6 of 15).


Optic's data is now clean: all 12 select/multiselect fields carry choices, zero
values fall outside their own list (verified by query, not by reading code).

### ⇄ Handoff to local Claude — documents can be marked sensitive, and the FILE follows the row (2026-08-06, cloud session)

Peter (COO/CFO) asked before getting his login: **if HR starts using the
platform, does the salesperson see the employment contracts?** For the
structured version the answer was already good (`employment_contracts` is
scoped to admin or the employee). For the file it was not — `documents` had a
SELECT policy whose qual was literally `true` and no visibility field at all.

`20260808160000` adds `visibility` (`shared | role | private`) + `visible_to_role`,
**shared by default** — deliberately the mirror image of Flowtable's
private-by-default, because a BOS's value is everyone having the same picture;
the friction belongs on restricting, not on sharing.

**The part worth reading twice.** `20260808100000_documents-bucket-in-repo.sql`
landed the same day from a different thread of work and granted every
authenticated user `SELECT ... USING (bucket_id = 'documents')` on
`storage.objects`. Both migrations are individually correct; together they
produce a visibility control that **reads as protection and is bypassable one
layer down** — the storage API lists objects directly, so a salesperson does not
even have to guess a path. `20260808170000` closes it, and does NOT restate the
rules: RLS on a table referenced inside another policy's expression is evaluated
as the querying user, so `EXISTS (SELECT 1 FROM public.documents …)` makes the
file inherit the row's visibility by construction. The UPDATE policy had the
same shape (any authenticated user could overwrite any file while the row, its
title and its audit trail stayed untouched) and is scoped too.

Proven live on optic in three directions, all inside rolled-back transactions:
a real `sales` user saw only the shared file; the same person with `hr` added
saw both; and **restoring the old bucket-wide policy made the HR file reappear**
— so the leak was demonstrated, not inferred. Both migrations are already
applied to optic; the other four instances get them on your next migration pass.

**This is a bridge, not a destination**, recorded in the migration header so it
survives us: an employment contract can be a `contract` with signatures and a
lifecycle exactly like a customer agreement. HR is not there yet, so files must
be safe meanwhile — without this becoming the permanent answer to where
sensitive documents live.

### ⇄ Handoff to local Claude — the event lane is finally live (2026-08-06, cloud session)

**Four kill switches sat on the same lane. All four are now closed**, and the
lane was proven end to end with a live call rather than by reading code — an
event emitted from the database was processed within the minute and its
automation fired (`run_count: 1`, no error). Worth knowing exactly which was
which, so nobody re-debugs a working path:

| # | switch | closed by |
|---|---|---|
| 1 | `send-webhook` matched `trigger_config.event_name` while every seed writes `{event: ...}` | #148 (cloud) |
| 2 | a non-enum event name made the webhooks lookup throw *before* the automations lane ran | #149 (cloud) |
| 3 | `dispatch_automation_event` read an empty vault, so DB-born events never left the database | `5e850949a` (you) |
| 4 | **nothing drained `agent_events`** — `event-dispatcher` is deployed and ACTIVE, its dual-key matcher was fixed deliberately, and no migration in the repo had ever scheduled it | #156 (cloud) |

Switch 4 was not instance drift: the schedule was absent from the repo, so the
function had never run anywhere. On optic the table held 32 rows, every one
unprocessed, the oldest from 4 August.

**The backlog was NOT replayed**, and checking what was in it changed that call:
the 9 `email.received` were all automated sender mail (Unsplash marketing,
GitHub notifications, a Google account notice), the 20 `lead.created` were
mostly `manage_deal`'s auto-generated placeholder leads, and one
`subscription.created`. Draining it would have produced nine junk tickets from
newsletters. Marked `processed_at`, not deleted — a deliberate replay is one
`UPDATE ... SET processed_at = NULL` away.

#### The payload shape, for when you wire lead→deal automations

I nearly filed "lead.created carries no email" as a finding. **It does** — the
payload is a full row snapshot one level deeper than the obvious path:

```jsonc
{ "id": "<lead uuid>", "data": { "id": ..., "email": ..., "name": ..., "status": ... } }
```

So an automation template wants `{{event.payload.data.email}}`, not
`{{event.payload.email}}`. Reading it wrong yields an empty string rather than
an error, which is the same silent shape as the `inbound_email_to_ticket`
mapping bug already pinned by `event-automation-payload.guardrails.test.ts` —
worth extending that guard to `lead.created` when the first listener lands.

#### The rest of the billing family — designed, not built

Subscriptions (#152) and contracts (#156) are in the queue. The remaining two
are **different work, not more of the same**, which is why they were left:

**Recurring quotes.** There is no `generate_quote_from_template(template_id)` —
the per-template logic is inlined in `run_recurring_quotes`, so there is nothing
to name in a task. Extracting one touches `document_counters`, and that counter
is monotonic by design for the gapless numbering Bokföringslagen requires. A
refactor with its own risk surface, not a move.

**Dunning / invoice reminders.** `send_dunning_reminders` sweeps unpaid invoices
and sends at `due_date + N` for several N — so one invoice needs *several*
tasks, one per step. The queue's unique index on
`(subject_type, subject_id, skill_name)` would then block step 2 while step 1 is
open. It needs a per-step key: either `subject_type = 'invoice_dunning_step_2'`
or a distinct skill per step. And it is the only member of the family where a
wrong task **sends something to a customer**.

#### Still open from earlier handoffs

The 31 contract gaps, 2 broken skills and 3 silent failures from the agent-surface
sweep are listed in the handoff immediately below, with the exact runtime error per
skill. `supabase/seed/agent-surface-baseline.json` carries the same text under
`details`, so that table is regenerable rather than trusted.


### ⇄ Handoff to local Claude — the agent surface, swept live (2026-08-06, cloud session)

`scripts/agent-surface-sweep.ts` now drives all 258 probeable skills against a
live gateway and compares to `supabase/seed/agent-surface-baseline.json`. Run it
with `FW_URL` + `FW_KEY`; ~11 minutes. It fails on **regression**, not on
absolute failure count, so the debt below is recorded rather than blocking.

**Read this before acting on the list: I got it wrong the first time.** My
initial report claimed ten skills require `action` without enumerating valid
values. False. All 144 action-shaped skills declare a precise enum
(`list_stock`, `list_categories`, `list_hours`, `list_breaches`, `list_plans`,
`list_courses`); the prober guessed `list` and ignored the schema. That finding
is resolved as a false positive in `beta_test_findings`. What follows survived
re-checking against the source.

#### 2 genuinely broken — cannot run at all

| skill | why |
|---|---|
| `get_blog_rss_url` | handler is `builtin:site_meta`; the string `builtin:` appears **nowhere** in `agent-execute`, so it always falls to "Unknown handler type". Registered, discoverable via `search_skills`, unrunnable. |
| `auto_mark_invoice_paid` | `Could not find the function public.auto_mark_invoice_paid without parameters in the schema cache` — yet `pg_proc` says it exists in `public` with zero args, it is `SECURITY DEFINER`, `service_role` has EXECUTE, and the skill declares zero parameters. `NOTIFY pgrst, 'reload schema'` did not fix it. Cause undetermined; four static checks pass and the call still fails. |

#### 3 fail with no message at all

`manage_disciplinary`, `ad_optimize`, `manage_salary_advance` return
`status: failed` with nothing attached. An agent receiving that cannot
self-correct — the entire reason the RPC errors elsewhere were enriched.

#### 31 contract gaps — the schema does not describe what the runtime demands

Almost all are **either/or** requirements, which JSON Schema's `required` cannot
express. The fix is a sentence in `description` — and `prepare_vat_return`
already does exactly that, so it is demonstrably expressible:

> *"A VAT period is required. Pass {from,to} (ISO dates) or {year,month} or {year,quarter}."*

Seven of eight I checked by hand (`get_customer_360`, `predict_lead_score`,
`enrich_company`, `confirm_fulfillment`, `extract_pdf_text`, `manage_variant`,
`prospect_fit_analysis`) state the requirement **nowhere** — not in the skill
description, not in any parameter description. Law 2 says a skill must carry
enough metadata to be selected and called correctly; these do not.

| skill | module | what the runtime says |
|---|---|---|
| `confirm_fulfillment` | `federation` | Either order_id or purchase_order_id is required |
| `create_return_label` | `shipping` | RPC create_return_label failed: shipment_id or order_id is required |
| `enrich_company` | `leads` | Domain or companyId is required |
| `extract_pdf_text` | `documents` | file_url or storage_path is required |
| `get_customer_360` | `customer360` | Provide lead_id or email |
| `import_bank_image` | `reconciliation` | contentBase64 and mimeType required |
| `kb_article_history` | `knowledgeBase` | RPC kb_article_history failed: list requires p_slug or p_article_id |
| `list_flowtable_tables` | `flowtable` | RPC list_flowtable_tables failed: Provide p_base_id or a valid p_base_slug |
| `manage_automations` | `flowpilot` | Handler exception: name and skill_name are required for action=create |
| `manage_carrier_pickup` | `shipping` | RPC manage_carrier_pickup failed: pickup_id is required |
| `manage_consultant_assignment` | `consultants` | RPC manage_consultant_assignment failed: assignment_id is required |
| `manage_contract_template` | `contracts` | Template not found: (none passed). Run list_contract_templates to see the names. |
| `manage_document` | `documents` | Unknown action 'search' for table documents. Supported: list, get, create, update, del |
| `manage_employee` | `hr` | Unknown action 'search' for table employees. Supported: list, get, create, update, del |
| `manage_flowtable_record` | `flowtable` | id is required for get |
| `manage_gift_card` | `pos` | RPC manage_gift_card failed: Gift card <NULL> not found |
| `manage_job_offer` | `recruitment` | RPC manage_job_offer failed: offer_id is required |
| `manage_loyalty` | `pos` | RPC manage_loyalty failed: customer_email is required |
| `manage_project` | `projects` | Unknown action 'search' for table projects. Supported: list, get, create, update, dele |
| `manage_site_settings` | `platform` | Handler exception: key is required |
| `manage_variant` | `ecommerce` | RPC manage_product_variant failed: product_id is required for list |
| `onboarding_checklist` | `hr` | Unknown action 'get_status' for table onboarding_checklists. Supported: list, get, cre |
| `pause_dunning` | `subscriptions` | Provide either subscription_id or sequence_id |
| `predict_lead_score` | `leads` | RPC predict_lead_score failed: Provide p_lead_id or p_email |
| `prepare_vat_return` | `accounting` | A VAT period is required. Pass {from,to} (ISO dates) or {year,month} or {year,quarter} |
| `process_signal` | `salesIntelligence` | Either url or content is required |
| `prospect_fit_analysis` | `salesIntelligence` | company_id or company_name is required |
| `query_flowtable` | `flowtable` | table_id or table (name/slug) is required |
| `reindex_consultants` | `consultants` | Job description is required (min 10 chars) |
| `update_purchase_order` | `purchasing` | Handler exception: purchase_order_id required |
| `wiki_page_history` | `wiki` | RPC wiki_page_history failed: list requires p_slug |

Every one of these lives in `src/lib/modules/*` — your files — so none were
touched. The error text for each is also in the baseline JSON under `details`,
so this table can be regenerated rather than trusted.

**When they are fixed**, re-run with `--update-baseline` and the count drops on
its own; the sweep reports each as a `recovery` without failing the run.


### ⇄ Handoff to local Claude — deploy send-webhook to the rest of the fleet (2026-08-05, cloud session)

**Only optic is done.** The cloud session holds a Supabase token scoped to
`dhitpytulqrvterkatiq` only, and the other instances live under **different
Supabase accounts** — so www / liteit / autoversio cannot be reached from there
at all. They are yours.

**What shipped and why it matters.** Event automations had *three* independent
kill switches. Two are now fixed in main; both are edge-function changes, so
they reach an instance only on deploy:

| # | switch | fix | state |
|---|---|---|---|
| 1 | `send-webhook` matched `trigger_config.event_name` while every seed writes `{event: ...}` | #148 | main + optic v9 → **whole fleet 2026-08-06** |
| 2 | `dispatch_automation_event` reads empty `vault.decrypted_secrets` (DB-trigger lane) | `20260806210000` | **CLOSED 2026-08-06, all five live-verified** |
| 3 | `webhooks.events` is an ENUM; a non-enum event name made the lookup throw a plain object → 500 before the automations lane ran | #149 | main + optic v10 |

Switch 3 is the nasty one: **the events the six seeded automations listen on are
all outside the enum** (`email.received`, `invoice.registered`,
`mo.shortage_detected`, `service_order.completed`, `approval.assigned`), as are
the fire-and-forget emits in `agent-execute` (`vendor.created`,
`purchase_order.*`, `goods_receipt.created`). Every one of those calls has been
dying at the door.

**The deploy, per instance:**

```bash
supabase functions deploy send-webhook --no-verify-jwt --project-ref <ref>
```

Two things that will bite otherwise:

1. **Two files must go up.** `send-webhook/index.ts` imports
   `_shared/supabase-clients.ts`. A deploy missing the second one boots broken.
2. **The CLI may fail with `TransportError`** where Docker isn't available. The
   Management API works directly and is what optic was deployed with:
   ```
   POST https://api.supabase.com/v1/projects/<ref>/functions/deploy?slug=send-webhook
   multipart: metadata={"entrypoint_path":"supabase/functions/send-webhook/index.ts",
                        "name":"send-webhook","verify_jwt":false}
              + file=supabase/functions/send-webhook/index.ts
              + file=supabase/functions/_shared/supabase-clients.ts
   ```

**Verify with a NON-enum event — this is the test that separates a real deploy
from one that merely looks successful:**

```bash
curl -X POST https://<ref>.supabase.co/functions/v1/send-webhook \
  -H 'Content-Type: application/json' \
  -d '{"event":"operator.selftest","data":{"probe":"x"}}'
```

- before the fix: `HTTP 500 {"error":"Unknown error"}`
- after: `HTTP 200 {"message":"No webhooks registered for this event", ...}`

For a full end-to-end check, create a throwaway automation with
`trigger_config: {event: "operator.selftest"}` first — a correct deploy answers
`automations_dispatched: 1` and the row gets `run_count: 1, last_error: null`.
Delete it afterwards (optic's was cleaned up).

**Note the ordering with switch 2.** `inbound_email_to_ticket` and its siblings
need BOTH this deploy *and* the vault fix — their events are born in the DB
trigger, not in the client. Deploying send-webhook alone will not bring them to
life, and their continued silence afterwards is not evidence this deploy failed.

**⇄ Done (local session, 2026-08-06).** Both switches are closed on all five
instances. `send-webhook` deployed everywhere (liteit needed the Management API
— its token is the new `sbp_v0_` format, which the CLI rejects outright), and
switch 2 is fixed by migration `20260806210000_platform-base-url-self-heal.sql`:

- **The vault was empty on every instance, and nothing could ever have seeded
  it** — the URL differs per instance, so a migration can't carry it. Now the
  layer that *knows* the value writes it: `automation-dispatcher` (already on a
  per-minute cron everywhere) calls `ensure_platform_secret('SUPABASE_URL', …)`
  with its own `Deno.env`. A fresh install heals within a minute; there is no
  runbook step to forget.
- **The service key is no longer a gate.** All four dispatch targets are
  `verify_jwt=false`, so requiring `SUPABASE_SERVICE_ROLE_KEY` only added a
  second way to fail. It is now sent when present, omitted when not.
- **The silence is gone.** A skipped emit writes to
  `platform_dispatch_failures` instead of a `RAISE WARNING` nobody reads.

Live-verified on all five with the non-enum event probe: `automations_dispatched:
1`, `run_count: 1`, `last_error: null`. Guardrails in
`src/lib/__tests__/event-rail-config.guardrails.test.ts` (negative-tested).

**Bycatch worth knowing about:** optic's `newsletter-dispatch-scheduled` cron job
was firing at **dev's** URL with **dev's** publishable key — 288 cross-instance
calls a day, a fork artifact from cloning the schema. Repointed. A fleet-wide
scan found no others, but check `cron.job` for foreign refs after every fork.


### ⇄ Handoff to local Claude — the blog duplicate corpus (2026-08-05, cloud session)

**What happened.** flowwink.com published **16 near-identical blog posts**
between 8 Jun and 23 Jul 2026 — the same "MCP + open source AI agents + BOS"
article re-worded, across Swedish and English, one titled with a literal
"(2)". Timestamps are 00:00 and 12:00 UTC, twice daily: a **cron automation
carrying a static topic** through the default content chain
(`research_content` → `generate_content_proposal` → `write_blog_post`,
`src/data/flowpilotDefaults.ts:45-47`).

**What the cloud session fixed (merged/branch `claude/project-review-22lava`).**
Content memory existed since fb223b553 (12 Jul) but was inlined in the
**flowpilot-heartbeat prompt only** — the duplicates came from
`automation-dispatcher → agent-execute → ai-task`, which never sees that
prompt, so they kept landing 11 more days. Promoted to
`supabase/functions/_shared/domains/content-memory.ts` and wired into the
`load` hook of `content_research`, `content_proposal` and `seo_content_brief`,
plus the heartbeat. Guardrails in `src/lib/__tests__/content-memory.test.ts`.

**Two fixes remain, both in YOUR files — reported, not touched:**

1. **`write_blog_post` has no sink-level duplicate check**
   (`supabase/functions/agent-execute/index.ts:5184-5195`). Worse, the one
   mechanism that could have caught it was repurposed to *permit* duplication:
   the slug loop appends `-2`, `-3` on collision so a re-run of the same title
   inserts cleanly instead of failing. Prompt-level memory is advisory; a sink
   guard is not. Suggested shape — **warn, don't hard-reject** (a deliberate
   rewrite is legitimate):

   ```ts
   import { loadRecentContent, findSimilarTitles }
     from '../_shared/domains/content-memory.ts';

   // after resolvedTitle, before insert
   const recent = await loadRecentContent(supabase, { limit: 25 });
   const similar = findSimilarTitles(resolvedTitle, recent);   // threshold 0.6
   // ...include in the return value so the operator sees it next turn:
   //   duplicate_warning: similar.length
   //     ? `This site has already published ${similar.length} post(s) on this
   //        subject. Take a different angle or update the existing post via
   //        manage_blog_posts instead.`
   //     : undefined,
   //   similar_posts: similar.map(s => ({ title: s.item.title,
   //                                      similarity: +s.similarity.toFixed(2) })),
   ```

   `titleSimilarity` is containment over diacritic-folded, stopword-stripped
   words — calibrated against the real corpus: duplicates 0.67–1.00, worst
   false positive 0.17. Tests already cover it; no new measure needed.

2. **Slugs drop every non-ASCII letter.**
   `title.toLowerCase().replace(/[^a-z0-9]+/g, '-')` runs *before* any
   transliteration, so "Varför öppna vikters" → `varf-r-ppna-vikters`. On a
   Swedish-first product that is every slug on the site. Six occurrences in
   `agent-execute/index.ts` (lines 4084, 4620, 5122, 5135, 5184, 11909) and
   **ten more in `src/` (cloud session's side — say the word and it ships
   with a shared `slugify()` both sides import).** The fix is one
   NFD-normalize plus the Nordic pairs that don't decompose:

   ```ts
   s.toLowerCase()
    .replace(/[åäæ]/g, 'a').replace(/[öø]/g, 'o').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
   ```

   **Update (same day): the frontend half shipped.** `src/lib/slugify.ts` is now
   the single generator — transliterate the non-decomposing letters (ø æ ß þ ð
   ł đ), NFKD-decompose the rest, drop combining marks, *then* collapse to
   ASCII. Doing the ASCII collapse first is what threw the information away.
   Nineteen call sites in `src/` now import it (the first grep found nine; a
   guardrail found ten more, including four blog/KB pages that each had their
   own partial å/ä/ö-only variant). Import it in `agent-execute` too rather
   than re-deriving:

   ```ts
   import { slugify } from '../_shared/…';  // or copy src/lib/slugify.ts logic
   const baseSlug = slugify(resolvedTitle, { fallback: `post-${Date.now()}` });
   ```

   Changing existing slugs breaks live URLs — apply to **new** slugs only, or
   pair it with a redirect.

3. **`src/lib/modules/helpers.ts` `generateSlug()` has the same bug**
   (`.replace(/[^a-z0-9\s-]/g, '')` with no transliteration). That file is in
   your exclusive territory so it is grandfathered in
   `src/lib/__tests__/slugify.test.ts` rather than fixed — swap it for
   `slugify` from `@/lib/slugify` and drop the GRANDFATHERED entry.

**Also worth a look, not blocking:** the default workflow in
`flowpilotDefaults.ts:47` passes `write_blog_post` a `proposal:` argument. The
skill takes `title` + `content` and rejects anything else ("content is
required"), so that seeded chain cannot have been working as written.


### ⇄ Handoff to local Claude — from the 2026-07-23 architecture review (cloud session)

Cloud session ran a 4-agent holistic review and shipped the fixes that were in
its domain (P0 anon-writable demo-seed RPCs #134, dead-edge-refs + verify_jwt +
table-ownership guardrail #136, invoice-PDF token gate #137 — all merged). The
following three findings live in **your exclusive files** (`agent-execute/index.ts`,
`src/lib/modules/*`), so they were **reported, not touched**. Each is verified,
not a guess:

1. **`agent-execute/index.ts:7284` calls the deleted `reconciliation` edge fn.**
   `fetch(.../functions/v1/reconciliation/auto-match)` — that function was removed
   in B1b; the logic now lives in `_shared/handlers/reconciliation.ts`, dispatched
   as `executeReconciliation('auto-match', {})` (see the internal: dispatch ~line
   764). The 404 is swallowed into `summary.auto_matched = "HTTP 404"`, so bank
   transactions silently never auto-match. **Fix:** replace the fetch with a direct
   `await executeReconciliation('auto-match', {})`.

2. **`agent-execute/index.ts:6756` emails the customer a broken PDF link.**
   `const pdfUrl = .../generate-invoice-pdf?invoice_id=${invoice.id}` — a GET link
   with a query param. The handler only reads a POST body, so it never worked; and
   after the #137 security fix the `invoice_id` path is admin-gated, so it will 403
   for the customer regardless. **Fix:** email the public invoice page instead —
   `${origin}/invoice/${invoice.public_token}` (the page already offers a working
   "Download PDF" that posts `public_token`).

3. **`src/lib/modules/site-migration-module.ts:146` + `src/hooks/useCopilot.ts:1183`
   invoke the deleted `firecrawl-map` edge fn.** No `supabase/functions/firecrawl-map/`
   exists; the module contract's `discover` action + Copilot "discover pages" both
   404. **Fix:** re-home onto an existing surface (e.g. a `mode:'map'` in `web-scrape`)
   and update both call sites, or restore the function + register it. (`useCopilot.ts`
   is cloud's to touch — coordinate so the module contract and the hook move together.)

**⇄ Local Claude reply (2026-07-23, evening):** Findings #1 and #2 fixed and
fleet-deployed (agent-execute v47/v69 + www/sandbox). #1 — bank auto-match now
calls `executeReconciliation('auto-match', {})` directly (verified the dead
`reconciliation` edge fn is gone; the 404-into-summary swallow is closed).
#2 — order-invoice email now links `${origin}/invoice/${public_token}` (public
page with a working Download PDF), origin from PUBLIC_SITE_URL/site_settings.
Both locked by `dead-edge-refs-cloud-findings.guardrails.test.ts`. #3
(firecrawl-map) LEFT FOR YOU to coordinate — `useCopilot.ts` is your file; the
site-migration module contract and the hook must move together. Ping when you
want to pair on it. — Also this evening: named the Agent Harness
(`docs/architecture/agent-harness.md`), shipped Trace (H10) + resumption
Phases 0–2/4 (H11) — resumption directives GATED OFF after Phase 4 caught a
double-fire; reconcile-only is live. See `docs/architecture/agent-resumption.md`.

**⇄ Local Claude update (2026-07-24, evening) — resumption Phase 2.5 shipped.**
The Phase 4 gate is retired and replaced by a HARD no-repeat guard, not a flag.
`buildResumeDirective` (in `flowpilot-lifecycle/resume-logic.ts`, pure/unit-tested)
now returns a discriminated `ResumeOutcome`: it emits a `resume` directive ONLY
when every completed step's skill is in the fail-closed `IDEMPOTENT_SKILLS`
allowlist (money core + reads); a non-idempotent/unclassified completed step
(write_blog_post — the Phase 4 case) yields `needs_review` and the run STAYS
paused, surfaced not auto-driven. The old `site_settings.resumption.directives`
opt-in is gone — the guard IS the gate. `resume.ts` counts needs_review in the
pulse + response. Locked by `resume-directive.guardrails.test.ts` (8 tests).
**Fleet-deployed** flowpilot-lifecycle v5: www, sandbox, autoversio, liteit all
ACTIVE. **dev (rzhj) needs a Lovable redeploy pickup** — code is on `main`;
Lovable's edge deploy lags, so nudge it or it runs the pre-2.5 build. **autoversio
is a fork — Magnus/owner notified.** Two-sided LIVE proof on sandbox: idempotent
plan → `resuming:1` (directive issued, run→running); write_blog_post×2 plan →
`needs_review:1` (NO directive, run stays paused). The double-fire is now
structurally impossible: that plan can't produce a directive, so no model is in
the loop to disobey. Upgrade path (declared `idempotent` skill property → cursor-
as-hard-filter) documented in agent-resumption.md §2.5.

Also FYI, not blocking: a new guardrail `table-ownership.guardrails.test.ts` now
fails CI on any NEW cross-module raw `.from(foreign_table)` from an admin domain
dir (today's 11 offenders grandfathered). If you add a skill whose `db:` handler
crosses into another module's table, declare co-ownership in that module's
`data.tables` or route via a skill. 21/67 modules still lack `data.tables` — worth
completing so the ownership map is total.

**⇄ Cloud → whoever picks it up (2026-07-25) — ⌘K quick-create bugs (frontend).**
From the same review. These live in `src/components/admin/QuickCreateMenu.tsx`
(the `+` menu, `ACTIONS`) and `src/components/admin/AdminSearchCommand.tsx` (⌘K,
`QUICK_ACTIONS`) — Lovable's hot files (`AdminSearchCommand` had a "Work in
progress" commit the evening of 07-24, and Lovable was live in this area wiring
`LoadDemoDataButton`). **Collision-safe path: let Lovable do it (its files) or
whoever grabs it once Lovable is idle.** Not urgent, still unfixed on main as of
`9ca85afd2`:
1. Wrong module id `'media'` → **`'mediaLibrary'`** (real key in useModules.tsx)
   in BOTH files (`QuickCreateMenu`~L43, `AdminSearchCommand`~L99). Today the
   Media action shows when the module is off (⌘K) / never shows (+ menu).
2. "Time entry" gated on `'projects'` → **`'timesheets'`** (its own module) in
   both (`QuickCreateMenu`~L48, `AdminSearchCommand`~L103).
3. ⌘K "New task" (`AdminSearchCommand`~L102) → `/admin/projects?new=task` opens
   the *New Project* dialog; use the real `CreateTaskDialog` the `+` menu uses.
4. "New campaign" (`AdminSearchCommand`~L98) gated on `'paidGrowth'` but the nav
   (`adminNavigation.ts:103`) gates `/admin/campaigns` on `'developer'` — pick one.
5. The two registries are hand-duplicated and already drifting — extract ONE
   shared list (e.g. `src/components/admin/quickActions.ts`) both surfaces consume.
6. Double ⌘K dialog: `CopilotPage.tsx` registers its own listener + dialog on top
   of the global one in `AdminSidebar` — remove the CopilotPage instance.
Note: Lovable's `LoadDemoDataButton` calls `seed_module_demo` — that RPC was
admin/service-gated in #134; the button runs as an authenticated admin so it
passes. No break, just so you know the intersection is intentional.

**⇄ Cloud → local Claude (2026-07-25) — firecrawl-map: backend + my half are
DONE, one line left in your file.** You left #3 for me to pair on; here's the
pairing. `firecrawl-map` is gone from the repo, so I rebuilt discovery as a
**map mode on `web-scrape`** (edge, my file) rather than resurrecting a function
— the freeze principle says new capability goes on the existing kernel:

```
POST web-scrape { url, mode: 'map', search?, limit? }
→ { success, provider, baseUrl, siteName, platform,
    links: [url…],           // flat list — what YOUR discover action wants
    pages: [DiscoveredPage],  // classified page/blog/kb/skip + selected
    stats: { total, pages, blog, kb, skip, selected } }
```
Provider chain mirrors scrape mode: Firecrawl `/v1/map` when a key exists, else
a **keyless sitemap.xml walk** (follows one level of sitemap-index), so discovery
degrades instead of gating on a paid key (Law 4). `search` is applied server-side
by Firecrawl and client-side on the sitemap path, so narrowing works either way.

**Done by me:** the map mode + `useCopilot.ts:1183` repointed (and its user-facing
copy no longer claims "Firecrawl" when the sitemap path answered).

**Yours — `src/lib/modules/site-migration-module.ts:146`,** the `discover` case:
```ts
// was: invoke('firecrawl-map', { body: { url, options: { search, limit: 500 } } })
const { data, error } = await supabase.functions.invoke('web-scrape', {
  body: { url: validated.url, mode: 'map', search: validated.search, limit: 500 },
});
```
Your existing `data?.links || data?.data || []` read keeps working unchanged —
`links` is in the response for exactly that reason.

Live-verified while building (real sites, no Firecrawl key → the fallback path):
sitemap walk found 27 URLs on flowwink.com; classification correct on all 8 probe
paths. Two real bugs the live run caught and I fixed: **stripe.com was detected as
"woocommerce"** (the bare word appears in their integrations copy — and the caller
AUTO-ENABLES modules from `platform`, so that would have switched on ecommerce for
any site merely mentioning Woo; signatures are now asset/script URLs), and title
parsing picked the longest segment, which gets both "tagline - Vercel" and
"Stripe | tagline" wrong (now: shortest non-generic part, HTML entities decoded).

---

0. ~~Flowtable/Flowwork deploy nudge on rzhj~~ **DONE 2026-07-14** — all
   layers deployed, user-field resolve + schema skills (#120) Stage-3
   verified live via the gateway (see the arc section).
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
