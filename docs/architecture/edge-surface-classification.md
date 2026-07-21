---
title: "Edge surface classification: a small stable kernel, modularity in data"
status: analysis (read-only — no changes prescribed until approved)
date: 2026-07-19
---

# Edge surface classification

> **Thesis: the deploy surface should be small and stable — like a kernel.
> Everything toggle-able should live in data.**
>
> Edge functions cannot be switched on/off per instance, are not versioned
> with their module, bundle `_shared` at deploy time (a shared change requires
> redeploying every importer), and each one is a separate manual deploy
> artifact per fleet instance. Modularity is the platform's core principle —
> and edge functions are the one layer where modularity cannot exist. The
> resolution is not better edge tooling; it is moving everything that doesn't
> *need* to be an edge function into the layers that already have working,
> ledgered, toggle-able deploy channels: **skills** (agent_skills + sync),
> **SQL** (migrations), and **automations** (agent_automations rows).

This is the generalization of a pattern the codebase already proved:
`agent-execute` is ONE deploy artifact carrying 500+ skills, toggled entirely
dynamically through DB metadata. Every drift incident of July 2026 (skipped
migrations aside) was a function living in the deploy layer when it belonged
in the data layer: the ghost `publish-scheduled-pages` edge fn (now a SQL
function — the proof of concept for category C), the stale `newsletter`
bundle, 44 admin functions on old bodies.

It is also Law 3 applied to the backend: edge functions are **interfaces
(transport)**, not pipelines. Functionality lives where it can be toggled.

## The numbers (inventory 2026-07-19, 115 real functions)

| Category | Count | Share |
|---|---|---|
| A. Kernel — must be edge (transport/streaming/runtime) | ~38 | 33% |
| B. Handlers in disguise — should live in the data layer | ~55 | **48%** |
| C. Pure SQL — should be DB functions | ~5 | 4% |
| D. Heavy — keep separate for CPU/wall-time isolation | ~7 | 6% |
| Kernel-internal consolidation possible | ~10 → 2 | |

End state: **115 artifacts → ~45**, where the kernel (~38) changes *rarely*
and is deployed deliberately with Stage-3 verification, while the ~55 that
change *often* (business logic) move to layers with working deploy channels.
Fleet deploy burden: 5 instances × 115 = 575 function-instances → ~225, with
drift risk concentrated in artifacts that are almost never touched.

## A. The kernel (~38) — legitimately edge

A function earns a place here only via: external entry URL (webhook/OAuth/
public content), streaming (SSE/audio), a runtime/dispatcher role, or ops
bootstrap. "Needs secrets/AI" is NOT a qualifying reason — `agent-execute`
has the same env and secrets.

- **External ingest (9):** stripe-webhook, composio-webhook, email-webhook,
  telegram-ingest, twilio-ingest, elks46-ingest, gatewayapi-ingest,
  voice-ingest, signal-ingest
- **OAuth (1):** gmail-oauth-callback
- **Public content / SEO (5):** get-page, content-api, blog-rss, sitemap,
  llms-txt
- **Public commerce & signing flows (9):** create-checkout,
  create-invoice-payment, quote-pay, quote-sign, contract-sign,
  document-share, subscriptions, customer-signup, process-job-application
  (+ track-page-view as a public beacon)
- **Agent gateways (5):** mcp-server, a2a, agent-card, openclaw-responses,
  federation-invite-peer
- **Conversation runtimes, streaming (5):** chat-completion, workspace-chat,
  docs-chat, chat-stt, agent-operate
- **Skill/automation runtimes (5):** agent-execute, automation-dispatcher,
  event-dispatcher, signal-dispatcher, ai-task
- **Ops (5):** setup-database, instance-health, system-integrity-check,
  knowledge-indexer, check-secrets

## B. Handlers in disguise (~55) — grouped by natural absorber

### B1 → agent-execute `internal:` handlers (the big one)

**Key finding: 40+ of these are ALREADY registered as skills with `edge:X`
handlers.** The skill exists, the metadata exists, agents already call them
through the skill layer. Consolidation means moving the *implementation*
inside agent-execute and flipping the handler field `edge:X` →
`internal:X` — **zero API change for any caller**, one skill at a time,
fully incremental, Stage-3 after each.

Candidates: qualify-lead, enrich-company, enrich-company-profile,
contact-finder, prospect-research, prospect-fit-analysis, parse-resume,
extract-receipt, analyze-brand, consultant-match, consultant-checkin,
sales-profile-setup, field-service-skill (literally named "-skill"),
score-visitor-intent, fetch-fx-rates, sla-check, customer-360 (the
conversation-and-retrieval doc already prescribes making it a `_shared`
helper), company-profile, contact-center, support-router, copilot-action,
gmail-inbox-scan, accounting-vat-return-se, docs-sync, github-content-sync,
unsplash-search, fetch-image, reconciliation, demo-cycle, create-user,
invite-employee, update-autonomy-cron, test-ai-connection.

Shared utilities called from many places (web-search, web-scrape,
browser-fetch, send-webhook, email-send) become `_shared` libraries first —
today `email-send` is invoked via an **internal HTTP hop** from
agent-execute and survey-send, a network round-trip where a library import
belongs (same finding the portal design doc made for customer-360; `a2a`
makes 12 internal function calls — an internal HTTP mesh).

### B2 → one comms cluster (12)

send-booking-confirmation, send-order-confirmation, send-invoice-email,
send-quote-email, send-contact-email, send-return-confirmation,
send-webinar-reminders, send-booking-reminders, send-calendar-reminders,
csat-dispatch, survey-send, newsletter(dispatch). All the same shape: fetch
data + render template + send via the email lib. Become handlers over a
`_shared/email` library.

### B3 → automations (the platform's own primitive)

contract-billing-cron, subscription-billing-cron, recurring-quotes-cron,
social-post-scheduler, quote-expiry-reminders, dunning-processor. The
platform already HAS a cron runtime — `automation-dispatcher` +
agent_automations rows (cron trigger → skill). These functions are
hardcoded special cases of it. As automations they become per-instance
toggle-able, visible in /admin/automations, and covered by automation
health — for free.

### B4 → one `integrations-account` handler (4)

openai-account, firecrawl-account, hunter-account, elevenlabs-account —
four copies of the same secret-CRUD shape.

### B5 Kernel-internal consolidation (~10 → 2)

- flowpilot-briefing, flowpilot-distill, flowpilot-learn,
  flowpilot-followthrough, skill-curator → one `flowpilot-lifecycle`
  function with a mode param (5 → 1). NB: wire names are deployed across
  the fleet in cron jobs — keep the old names as thin aliases or repair
  cron jobs via a self-heal migration when this lands.
- cron-health → folded into instance-health (the freeze principle applied
  retroactively to our own recent work).

## C. Pure SQL (~5)

publish-scheduled-pages already made this move (the incident fix that
proved the category). Candidates: sla-check (40 lines), track-auth-event,
parts of cron-health (already an RPC). SQL deploys via migrations — the
only channel with a ledger — and `CREATE OR REPLACE` is dynamically
patchable per instance.

## D. Heavy — keep separate for isolation (~7)

migrate-page, run-autonomy-tests, run-platform-tests, generate-invoice-pdf,
media-optimize, process-image, extract-pdf-text. A dispatcher's wall-time
budget must not be consumed by a PDF render or a scrape+AI loop.

## Why the tests never felt bulletproof

The ~50 guardrail tests verify the REPO — and the repo has been right all
along. Drift is by definition the difference between repo and INSTANCE, and
no amount of repo tests can observe it. Guardrails prevent regression (keep
them); drift requires runtime measurement per instance (Stage-3, the
cron-health detector, and the planned instance manifest). Two different
defense lines; the second one is what has been missing.

## Migration path (when approved — nothing moves before that)

1. **Freeze principle (costs nothing, effective immediately):** no NEW small
   edge function if the logic can be an `internal:` handler, a `_shared`
   lib, a SQL function, or an automation.
2. **Per-skill re-homing:** pick a B1 candidate, move the implementation
   into agent-execute, flip `edge:X` → `internal:X` in the seed, sync
   skills, Stage-3, delete the function. Repeat. No big bang; each step is
   independently shippable and reversible.
3. **`_shared` libs first for the HTTP-mesh utilities** (email-send,
   send-webhook, web-search/scrape/browser-fetch, customer-360) — removes
   internal HTTP hops before re-homing their callers.
4. **B3 as config migration:** seed the six cron functions as
   agent_automations rows, verify via automation health, retire functions.
5. **The demo.flowwink.com reinstall is the measuring stick:** every edge
   function that must be hand-deployed and hand-configured for a fresh
   instance is a point for this consolidation; the fresh-install protocol
   doubles as the priority order.

## Independent review (2026-07-19, second session)

Cross-validated against the ~10 drift incidents root-caused the same day. The
thesis holds against every one of them. Three things the analysis *understates*,
and two objections.

### Understated

**1. The 100-function cap is a cliff, not a gradient.** The cost is framed as
deploy burden and drift risk. It is harder than that: at 100 functions Supabase
rejects **every** deploy with `402 Max number of functions reached` — *including
updates to functions that already exist*. www hit this today and could not
receive the rung-3 invite security fix until two dead aliases
(`flowpilot-resume`, `resume-match`, both renamed away long ago) were deleted.
With ~115 functions in the repo every instance sits against the wall
(liteit 67, demo 71, autoversio 85, www 98 after the deletions — the spread is
only because `flowwink.sh` already deploys a module-filtered subset). **This is
the urgent argument for the work**, stronger than drift.

**2. An entire bug class disappears, it does not merely shrink.** 66 orphaned
`edge:` skills were disabled across the fleet today — skills whose function was
absent on that instance, so the agent was offered capabilities that could only
404. A skill sync then resurrected 18 of them, which is what forced the
sync → align-down ordering rule. With `internal:` handlers **the class cannot
exist**: a skill cannot reference a missing edge function when there is no edge
function. Align-down becomes unnecessary rather than automated.

**3. `config.toml` shrinks proportionally.** 46 of 124 functions had no
`[functions.*]` entry, and a missing entry defaults to `verify_jwt = true` — a
full deploy on a fresh instance would have gated checkout, invoice payment,
quote/contract signing and the inbound webhooks. At ~45 functions that surface
is small enough to audit by eye, and nearly all of what remains is kernel with
an obvious classification.

### Objections

**A. B3 (cron → automations): verify determinism per candidate first.** The
platform does have a cron runtime, but `automation-dispatcher` **never calls
`reason()`** (verified in the code today) — an automation invokes exactly one
skill with static arguments. Anything needing generation cannot be an
automation; that is why a "daily blog" had to be an objective rather than a
cron. `dunning-processor` and `social-post-scheduler` plausibly generate
content. Check each B3 candidate for a generative step before converting, or
the capability is lost silently.

**B. Blast radius and cold start for `agent-execute`.** It is already **13,011
lines / 588 KB**. Absorbing ~40 handlers could roughly double it. Three risks
worth tracking that the analysis does not mention: cold-start latency paid on
*every* skill invocation, bundle size against edge-runtime limits, and blast
radius — a bug in `agent-execute` today takes down one function's worth of
capability; afterwards it takes down the platform. Recommendation: make
**cold-start time and bundle size explicit Stage-3 criteria** during B1, and be
willing to split into 2–3 domain runtimes (`agent-execute-commerce`, …) if the
curve turns. That is not a contradiction of the thesis — it is the same
category-D isolation argument applied to the kernel itself.

### Measured correction to B1 (2026-07-19, pre-flight)

Grepping the seeds against the candidate list splits B1 into two classes the
analysis conflates:

- **16 are skill-backed** (`edge:X` in a seed): qualify-lead, enrich-company,
  contact-finder, prospect-research, prospect-fit-analysis, parse-resume,
  consultant-match, sales-profile-setup, field-service-skill,
  score-visitor-intent, fetch-fx-rates, customer-360, contact-center,
  copilot-action, gmail-inbox-scan, accounting-vat-return-se. These are the
  true zero-API moves — the `internal:` dispatch mechanism already exists in
  agent-execute (the rung-3 handlers use it).
- **17 are UI-invoked** (admin hooks/components call the function directly via
  `functions.invoke`): enrich-company-profile, extract-receipt, analyze-brand,
  consultant-checkin, sla-check, company-profile, support-router, docs-sync,
  github-content-sync, unsplash-search, fetch-image, reconciliation,
  demo-cycle, create-user, invite-employee, update-autonomy-cron,
  test-ai-connection. Still movable, but each needs a frontend change too
  (the UI becomes a caller of agent-execute, or the logic becomes SQL/RPC).
  **Not** zero-API; sequence them after the 16.

So "40+ already registered as skills" overstates the zero-API subset by ~2.5×.
The thesis stands; the effort estimate for the easy tranche shrinks and the
UI-invoked tranche needs its own design decision (likely: UI → `agent-execute`
with the skill layer as the single choke point, which is also the [[rung]]
security posture).

### Sequencing note

The freeze principle (step 1) costs nothing and should apply from today. For the
rest, the **fresh install is the measuring stick** — as step 5 already says. Run
it first, with a notebook: every function that must be hand-deployed or
hand-configured is a vote, and B1 then gets its priority order from observed
reality rather than an estimate.

## Relationship to the other root fixes

This classification is one of three structural fixes identified 2026-07-19:

1. **This document** — shrink the deploy surface; modularity in data.
2. **Instance manifest** — a generated repo artifact (migration HEAD,
   skill-seed hash, edge-fn hashes, frontend build) + per-instance state so
   "what am I running vs what main says" is a query, not archaeology.
3. **`register_instance()` identity primitive** — one config row (own URL +
   anon key) written at provisioning; all cron jobs/triggers read from it.
   Kills the hardcoded-URL incident class permanently.

A smaller edge surface makes both other fixes easier: fewer artifacts to
manifest, fewer places to need instance identity.
