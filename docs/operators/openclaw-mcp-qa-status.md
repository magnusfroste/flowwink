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

## Pending (sync when Lovable deploys)
- `ai-task` redeploy + sync-skills for the `content_proposal` handler flip
- sync-skills for the 8+ instruction blocks + add_lead company_id
- **Email-router (Lovable building, option A):** `send_email_to_lead` currently
  routes only Resend/SMTP via `email-send`, so 1:1 outreach goes From
  info@flowwink.com (looks like newsletter, not repliable) and Composio Gmail
  bypasses `outbound_communications` logging. Desired: `email-send` becomes a
  provider router (resend | smtp | composio | gmail-oauth) so personal outreach
  goes From the real inbox (liteitdev@gmail.com), replies thread in Gmail, and
  everything logs on the lead's timeline. **When Lovable finishes A → sync.**

## Remaining untested surfaces
communication (newsletter/webinars/chat), automation, HR/recruitment depth
(hire_application → onboarding), analytics, growth, expenses, POS, federation.

## Phase-3 hardening (not yet done)
Turn the fixed classes into permanent guards: broaden the not-null guardrail to
`create_*`/`update_*` generic-CRUD skills, add a "no silent success" lint, and an
adversarial regression set so module/migration changes can't silently re-break
the operator surface.
