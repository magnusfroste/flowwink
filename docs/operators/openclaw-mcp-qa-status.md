# OpenClaw ⇄ MCP-surface QA — session status

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

## Pending (sync when Lovable deploys)
- `ai-task` redeploy + sync-skills for the `content_proposal` handler flip
- sync-skills for the 8+ instruction blocks + add_lead company_id

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

## Remaining untested surfaces
analytics, growth, federation, docs, media — lower business priority; sweep when
OpenClaw's model is stable for adversarial runs.

## Phase-3 hardening (not yet done)
Turn the fixed classes into permanent guards: broaden the not-null guardrail to
`create_*`/`update_*` generic-CRUD skills, add a "no silent success" lint, and an
adversarial regression set so module/migration changes can't silently re-break
the operator surface.
