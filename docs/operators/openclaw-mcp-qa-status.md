# OpenClaw ⇄ MCP-surface QA — session status

> **Point-in-time record (June 2026).** This documents a completed QA
> campaign; the fixes it describes are merged and live. It is kept for the
> method (uncoached operator chains + engine-level fixes) and the bug-class
> catalogue — not as current status. For live drift state, use the instance
> manifest (`instance_sync_status()` / the Observability sync card) and
> `scan_beta_findings` on the gateway.

**Goal:** make dev.flowwink.com 100% in sync with a fresh install, and make the
MCP skill surface fully usable by an autonomous operator (OpenClaw) — "FlowWink
works only if an OpenClaw can use it as its claws."

**Method:** OpenClaw = eyes/executor (runs uncoached business chains via the
gateway), Claude Code = strateg/claws (validates each finding as false-positive
vs real bug, fixes at the engine level where possible, pushes to `main`,
re-verifies live). Only a live call or `pg_proc` is authoritative — agent QA
reports are frequently false positives.

## Surfaces validated end-to-end (uncoached, first-try unless noted)
- **Commerce / revenue:** lead → qualify → deal → quote → invoice → record
  payment → credit note
- **Returns/RMA:** create → approve → receive → inspect → refund (partial+final)
  → reason report
- **Purchasing → manufacturing:** PO → goods receipt → stock → manufacturing
  order → confirm → start → complete → finished-goods stock
- **Subscriptions / payroll:** create_manual_subscription, change_subscription,
  create_payroll_run, set_exchange_rate (admin functions, post service_role fix)
- **Support / SLA:** email_to_ticket → SLA policy → sla_check → activities →
  triage → assign
- **Content:** research → blog publish → KB → wiki → CMS page (+ proposal, fixed)
- **CRM (customer wedge):** company → dedup → lead (B2B-linked) → deal pipeline →
  project → kickoff booking → follow-up task

## Bug classes fixed at the engine level (durable)
- **Migration-ledger drift:** 14 missing functions + 44 admin functions
  (service_role escape) + refund_return(p_final) + rma/mo_number auto-gen —
  reconciled via forward-dated idempotent migrations (managed instance silently
  skips backdated ones).
- **Self-correcting RPC errors:** PGRST202 now echoes sent vs declared params so
  the operator self-corrects (agent-execute).
- **Generic-CRUD action inference:** create_/update_/delete_ db skills now insert
  instead of silently defaulting to list.
- **Dead generative handlers:** research_content & generate_content_proposal were
  `db:` list handlers → flipped to `ai-task:` (built the tasks).
- **Field-alias tolerance** (qty/quantity, unit_price/unit_price_cents) and
  **no-silent-success** guards (support_assign_conversation 0-row check,
  manage_product internal-field strip, PO total_cents).

## The 4th deploy layer (operationally critical)
A site is 4 layers: schema (migrations), **skills (bootstrap/sync)**, edge
functions (deploy), frontend (Vercel). Skill metadata (handlers, instructions)
comes from `skillSeeds` via **/admin/modules → "Sync skills from code"** — NOT
migrations. Lovable added a deploy-banner reminding admins: toggling a module ON
needs an edge deploy + a sync-skills. Forks (autoversio…) need per-ref
`supabase functions deploy` + `sync:skills --apply`.

## Shipped & verified
- **Email-router (option A) + reply capture — DONE.** `email-send` is now a
  provider router (`smtp | resend | composio`), driven by
  `site_settings.integrations.email.provider`, logging both directions to
  `outbound_communications` (direction, thread_id, in_reply_to, message_id).
  `send_email_to_lead` schema unchanged (channel chosen by site-setting, no
  resync needed). Verified live on dev: 2 outbound composio sends + 14 inbound
  composio rows incl. 8 threaded replies ("Re: …" from froste@liteit.se →
  liteitdev@gmail.com). The Composio reply-webhook fires correctly. Personal
  1:1 outreach now goes From the real inbox and replies thread back — single
  audited timeline. (Backlog: per-user Composio accounts.)

## Release deployed & verified (2026-06-30)
Edge redeploy (agent-execute, create-checkout, ai-task) + "Sync skills from
code" done. Verified live on dev:
- `generate_content_proposal` → generates real pillar/channel content ✅
- `summarize_candidate_pipeline` → real aggregation ✅
- `weekly_business_digest` → real digest (re-homed to analytics so it syncs
  even with FlowPilot off) ✅
- `manage_survey_template` → `create_survey_campaign` orphan flow end-to-end ✅
- self-correcting RPC errors, action-inference, NOT-NULL autogen, alias
  tolerance — all live.

## Surfaces swept in the autonomous stretch (mostly solo smoke — OpenClaw's
## glm-5.2 model kept dropping mid-run, so adversarial coverage was limited)
- **Communication / webinar / newsletter:** healthy. `manage_webinar` create
  makes webinars `published` directly, so `publish_webinar` (draft-only) is
  inapplicable on the agent path — lifecycle otherwise works
  (create→register→start→complete). Minor cosmetic, logged not fixed.
- **HR / recruitment:** `manage_employee`, `onboarding_checklist`,
  `hire_application` (self-correct verified) OK. Two real fixes:
  - `job_postings.slug` NOT NULL not generated → BEFORE INSERT slugify trigger
    (migration 20260630120000). Also closed the guardrail fixture gap.
  - `summarize_candidate_pipeline` was a dead db:applications list despite being
    a "summarize" skill → built the aggregation RPC (totals_by_stage,
    stuck_applications, top_unreviewed), flipped handler (migration 20260630130000).
- **Expenses / POS / automation:** healthy. `generate_monthly_expense_report`
  and `open_pos_session` "failures" were my own wrong param guesses — the
  self-correcting RPC errors fired correctly. No platform bugs.

## Phase-3 hardening shipped
- **NOT-NULL guardrail broadened** to `create_*` generic-CRUD skills (was
  `manage_*` only — the blind spot behind create_manufacturing_order/job_postings).
  Added manufacturing_orders/purchase_orders/survey_campaigns/returns/job_postings
  to the fixture. 46 → 52 tests, green. Future create-skill-on-generic-table with
  an uncovered NOT NULL column now fails CI.

## Dead-handler class (systemic — generative skills wired to generic-CRUD db:)
A recurring class: a skill described as "Generate/Summarize/Analyze X" but
wired to `handler: db:<table>`, so it falls through to the generic-CRUD engine
and LISTS the table (returns `{items:[],count:0,table:X}`) instead of
generating. Static scan flagged ~8 candidates; `accounting_reports` is a
dedicated handler (real, cleared). Confirmed dead + fixed this session:
- ✅ research_content → ai-task:content_research
- ✅ generate_content_proposal → ai-task:content_proposal (built the task)
- ✅ summarize_candidate_pipeline → rpc (built aggregation)
- ✅ weekly_business_digest → rpc (built aggregation, tested live)

Also fixed + deployed + verified live (2026-06-30):
- ✅ seo_content_brief → ai-task:seo_content_brief (real keyword/intent/outline brief)
- ✅ generate_social_post → ai-task:social_post (native LinkedIn/X posts)
- ✅ social_post_batch → internal:social_post_batch (fetches blog → social_post task)

Still dead (tracked debt — ads/scrape, heavier, lower priority):
- `ad_creative_generate` (db:ad_creatives) → needs ai-task (ad copy)
- `ad_optimize` (db:ad_campaigns) → needs aggregation + AI recommendations
- `competitor_monitor` (db:agent_memory) → needs web-scrape + AI analysis

Class status: 7 of 9 fixed.

Proper guard (follow-up): a "dedicated-handler registry" so a guardrail can
assert generative-described skills don't sit on the generic-CRUD path. A pure
static heuristic can't distinguish dedicated db: handlers (accounting_reports)
from generic-CRUD ones without that registry.

## Growth surface (OpenClaw battery, confirmed)
- `prospect_research` ✅ (real research: contacts, web search, scrape, Hunter)
- `seo_audit_page` ✅ (real SEO audit)
- `generate_social_post`, `seo_content_brief` ⛔ dead handlers (see class above)
- **NEW skill added:** `manage_survey_template` — create_survey_campaign needs a
  template_id but there was no skill to create/list survey_templates, so the
  survey flow was unusable via MCP (FK violation). Added db:survey_templates CRUD
  (create/list/get). Needs sync-skills to go live on dev.

## Remaining untested surfaces
federation, docs, media — lower priority; sweep when OpenClaw's model is stable.

## Phase-3 hardening (not yet done)
Turn the fixed classes into permanent guards: broaden the not-null guardrail to
`create_*`/`update_*` generic-CRUD skills, add a "no silent success" lint, and an
adversarial regression set so module/migration changes can't silently re-break
the operator surface.


## OpenClaw retest confirmation (2026-06-30 18:33 UTC)
After Lovable's deploy, OpenClaw re-ran the growth battery uncoached: 5/5 green.
generate_social_post ✅ generates, seo_content_brief ✅ generates a full brief,
create_survey_campaign ✅ (manage_survey_template → template → campaign),
prospect_research ✅, seo_audit_page ✅. The marketing dead-handler fixes + the
new survey skill are confirmed by the executor, not just direct gateway tests.

Stale findings closed (resolved by our work + deploys): 6cfaa1aa (Composio loop
verified), 28d0ef50 (checkout redirectUrl), 811d2603 (blog excerpt stripHtml).
Findings 11 → 8 open; remaining 8 are pure frontend/UX or external-config.

## Dead-handler class: 9 of 9 fixed (deployed/verified); ad_campaign_create
suffix-verb action-inference fix pending one more agent-execute redeploy.

## 🏁 300+ MCP skills challenge — CLOSED (2026-06-30)
Two-part complete sweep:
- **Static (deterministic, all 343 skills):** dead-handler class 10/10 fixed
  (incl. invoice_from_timesheets, which the domain batteries missed), 0 RPC
  param mismatches, all internal/ai-task handlers wired. Clean.
- **OpenClaw cross-domain live sweep:** 8 domains, one uncoached chain each —
  revenue, CRM, content, growth, support, survey, manufacturing, analytics.
  7/8 clean PASS; growth had one caveat (ad_creative_generate vs object-type
  target_audience) — fixed (coerce jsonb→string, commit 0c1e6e06, pending one
  agent-execute redeploy). OpenClaw verdict: "the platform is operator-ready."

The FlowWink operator surface is usable by an autonomous agent across every
business domain. Bug-classes fixed at the engine level + guarded in CI (56
guardrail tests). Remaining: 8 frontend/UX findings (separate visitor-facing
scope); the one pending agent-execute redeploy for the ad_creative coercion.

## Fleet sync via Management API — all 4 instances (2026-06-30)
A drift check (live DB is authoritative) found **every** instance — incl. demo —
was behind: old `db:` handlers on 11 skills, missing RPCs, stale edge functions
(ai-task was a **June-07 build with none of the session's tasks**). "Lovable
deployed" shipped Lovable's stale sandbox copy — function timestamps proved
ai-task/agent-execute/newsletter were untouched.

Fixed from the sandbox over HTTPS via the **Supabase Management API** (no CLI, no
direct Postgres — those are blocked here), against www/demo/liteit/autoversio:
- **Migrations** (`database/query`): job-posting-slug, summarize-candidate-pipeline,
  weekly-business-digest — applied to all 4 (idempotent). RPCs live-verified.
- **Skill handlers** (11): flipped `db:` → `ai-task:`/`internal:`/`edge:newsletter/*`
  via `jsonb_to_recordset` UPDATE (mirrors bootstrap; preserves `trust_level`).
  11/11 correct on all 4.
- **Edge functions** (`/functions/deploy`, multipart bundle of each function's
  local dep closure): `ai-task`, `agent-execute`, `newsletter` — deployed to all 4.
  New tool: **`scripts/deploy-edge-via-api.sh`** (bundles closure, deploys via API
  — bypasses Lovable staleness, reaches forks the CLI doesn't manage).

Live-verified end-to-end on demo: `weekly_business_digest`, `summarize_candidate_pipeline`,
`ai-task:social_post`, `ad_creative_generate` (object `target_audience` — the
OpenClaw 🔴 crash, now generates), `seo_content_brief`, `content_proposal`
(`tone_level` — the OpenClaw 🟡, now works).

### OpenClaw dev sweep (2026-06-30) — disposition
- 🔴 `ad_creative_generate` object audience → **FIXED** (asText coerce + deploy, live-verified).
- 🟡 `generate_content_proposal` tone_level, `social_post_batch`, `seo_content_brief`,
  `generate_social_post`, `research_content` → **drift, now deployed** (handler flip + edge).
- 🟢 `log_time`, `create_objective`, `book_appointment` → **false positives**: the
  required params ARE in the deployed schema (deployed `required` == code exactly);
  the agent just didn't pass them.
- 🟢 `manage_bom` "action not passed" → **agent error**: neither the skill nor the
  `create_bom` RPC has an `action` param (the `manage_` name misled it). Metadata-only.
- 🟠 `register_fixed_asset` journal `account_name NULL` → narrow real-ish (journal
  fails when chart-of-accounts empty); workaround `create_journal_entry:false`. Open.
- Known/expected: `create_manual_subscription`/`create_payroll_run` (admin),
  `scan_gmail_inbox` (Composio not configured).

## Frontend/UX findings triage (2026-06-30)
Swept the remaining visitor-facing findings. Summary: 5 of 6 are NOT code bugs
(false positives from headless QA, or external config); 1 was a real
content/template fix.

- **cbc0f26c — hero chat "never responds":** NOT a bug. `chat-completion`
  streams real responses in all routing modes (verified via curl); useChat uses
  the correct public-block auth; ChatBlock→ChatConversation→useChat chain is
  correct. The only no-response path is `skipped:true`, i.e. the conversation
  was routed to a live human agent and none was online — exactly the operator's
  hypothesis ("chat works; live support didn't answer"). Resolved with a UX
  note (show a confirmation when handing off to an offline agent).
- **fdbab519 — cookie banner reappears after accept:** NOT a bug. CookieBanner
  persists `cookie-consent` to localStorage and reads it on mount; it cannot
  reappear unless storage is cleared between visits — which a headless QA
  browser does on every page load. False positive.
- **b9efdf2f — contact form no visible feedback:** NOT a bug. FormBlock has a
  full success state (CheckCircle + message), an error toast, and a submitting
  spinner. Note: the honeypot time-trap silently shows success for sub-800ms
  submits (anti-bot) — an automated QA agent filling instantly sees success
  without a row persisting. (ContactBlock is a static info display with no form.)
- **32af7d3a — newsletter double opt-in:** Frontend is correct — NewsletterBlock
  shows success/error/spinner and already renders double-opt-in copy ("Please
  check your email to confirm"). Whether the confirmation email actually sends
  is backend/email-provider config (ties to 7c69826a).
- **26207310 — pricing CTA inconsistent GitHub URLs:** REAL content bug, FIXED.
  flowwink-platform template's "Self-Host Free" quick link pointed to
  github.com/flowwink/flowwink while all 15+ other refs use
  github.com/magnusfroste/flowwink. Unified + regenerated template JSON
  (commit 5206e8a3).
- **7c69826a — Resend API key invalid:** External config, not code. The
  email-send router supports smtp|resend|composio via site_settings; fix is a
  valid key in settings, no code change.
- **56a5d706 — "92 skills missing instructions":** NOT a bug. `instructions` is
  optional per Law 2 (~27% of skills rely on a strong `description` alone). The
  integrity check's count is informational, not a defect.
