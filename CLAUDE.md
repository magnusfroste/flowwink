# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (auto-runs migrations before starting)
npm run dev

# Production build
npm run build

# Lint
npm run lint

# Run all tests
npx vitest run

# Run a single test file
npx vitest run src/lib/utils.test.ts

# Run tests in watch mode
npx vitest

# Generate template JSON (after editing templates)
bun run scripts/templates-to-json.ts

# Sync block schema definitions
bun run scripts/sync-block-schema.ts

# Lint skill metadata
bun run scripts/skill-linter.ts

# Scaffold a new module
bun run scripts/new-module.ts

# Verify HR module integrity
npm run verify:hr-modules

# Run MCP regression tests
npm run test:mcp-regression

# Run timesheet regression tests
npm run test:timesheet-regression

# Check doc drift
bun run scripts/check-doc-drift.ts
```

## Architecture

FlowWink is a self-hosted Business Operating System (BOS) built on React + Supabase. An autonomous AI operator called FlowPilot runs content, leads, orders, and growth — around the clock. Each deployment is a single-tenant site for one customer.

### Request flow

```
Visitor → PublicPage.tsx → get-page edge function → page.content_json (ContentBlock[])
                         → BlockRenderer.tsx → [Name]Block.tsx (renders each block)

Admin → PageEditorPage.tsx → BlockEditor.tsx → [Name]BlockEditor.tsx (edit each block)
```

Pages are stored in the `pages` table as `content_json: ContentBlock[]`. `PublicPage` fetches via the `get-page` edge function (with DB fallback), then `BlockRenderer` dispatches to the appropriate block component by `block.type`.

### Core Architecture Principle: Blocks are interfaces to FlowPilot

**Blocks have two responsibilities only:**
1. **Intent capture** — structured UI that makes the visitor's intent explicit
2. **Response rendering** — display FlowPilot's answer in a visual format

**FlowPilot is always the intelligence layer.** Blocks never build their own AI pipelines.

```
WRONG:  Block → dedicated edge function → AI model
RIGHT:  Block → FlowPilot (chat-completion) → structured response → Block renders
```

Why: FlowPilot has soul, objectives, knowledge base, CRM context, and full site awareness. A block that bypasses it breaks the "website is a consultant" narrative.

### Auth pattern for public blocks

Public blocks (visible to anonymous visitors) must NOT use `supabase.functions.invoke()` — it sends the user JWT and returns 401 for unauthenticated visitors.

Use the same pattern as `useChat.tsx`:
```ts
const response = await fetch(
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-completion`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ ... }),
  }
);
```

### Block System

Each block has:
- **Public renderer**: `src/components/public/blocks/[Name]Block.tsx`
- **Admin editor**: `src/components/admin/blocks/[Name]BlockEditor.tsx`
- **Registration in two places**: `BlockRenderer.tsx` (switch dispatch) and `BlockEditor.tsx` (editor dispatch)

Admin editors use the `isEditing` prop:
- `isEditing=false` → visual preview (should look almost identical to public block)
- `isEditing=true` → settings/edit panel

Block layout in `BlockRenderer`: full-bleed blocks (hero, parallax-section, marquee, etc.) skip the container wrapper. All others get `container mx-auto max-w-6xl px-4` and `py-12 md:py-16 lg:py-20` section padding. Backgrounds auto-alternate between `muted/40` and transparent for non-self-styled blocks.

**Block metadata** lives in `src/lib/block-reference.ts` — the canonical registry mapping block types to their schema, preview, and capabilities.

### Module System

FlowWink has 69 modules in `src/lib/modules/`. Each module is a TypeScript file defining:
- Module metadata (id, name, category, dependencies)
- Feature set and capabilities
- Skill registrations pointing to `agent_skills` rows

**Module categories include:** accounting, analytics, approvals, blog, booking, calendar, chat, companies, contracts, crm, customer360, deals, docs, documents, email, expenses, federation, feedback, field-service, fixed-assets, flowpilot, forms, global-blocks, growth, handbook, hr, inventory, invoicing, kb, live-support, manufacturing, media, multi-currency, newsletter, pages, payroll, pos, pricelists, products, projects, purchasing, quotes, reconciliation, recruitment, consultants, returns, river, sales-intelligence, shipping, site-migration, sla, subscriptions, surveys, templates, tickets, timesheets, webinars, wiki, workspace-chat.

To scaffold a new module: `bun run scripts/new-module.ts`

**Module API contracts** (`src/types/module-contracts.ts`): formal Zod schemas for all cross-module communication. All cross-module data exchange MUST use these contracts.

### Edge Functions

All edge functions live in `supabase/functions/[name]/index.ts` and are Deno-based.

**Budget: reuse before a new deployable.** The fleet runs on Supabase's Free
tier (100 functions per project, 500K invocations/month, 150 s wall-clock,
2 s CPU). The repo carries 76 functions and `EDGE_FUNCTION_BUDGET` in
`src/lib/edge-function-registry.ts` caps it at 90; the registry guard turns
CI red above that. A new capability is a handler in `agent-execute` (a
skill), or a branch of an existing family — channel ingest
(`telegram-ingest`, `elks46-ingest`, …), billing crons, user admin, public
document actions — not a new function. Existing names stay: webhooks at
Telegram, Twilio and 46elks point at today's URLs per instance, so
consolidating a family is a fleet-wide rename and needs a reason. What bites
first on Free is the 150 s wall-clock on long jobs (`install_template`,
`demo-cycle`, a heartbeat with many objectives), not the count.

**The executor is a function you import, not only a URL you fetch
(2026-11-07).** `agent-execute`'s request pipeline — every gate in order
(retired names, lookup, authorization, module gate, scope, staging,
trust/approval, the claim), the handler dispatch (the `internal:` chain, the
module and db executors), the agent envelope, the journal, objective
tracking — is `executeSkillRequest(body, auth)` in
`supabase/functions/_shared/execute/core.ts`; it answers `{ status, body }`,
the HTTP status and JSON the function answers. `agent-execute/index.ts` is
the thin wrapper (auth header → core → `Response`, plus CORS and the
`async: true` 202 handoff, which stays HTTP-only). A caller inside the same
Deno project runs a skill in-process with `SERVICE_CALLER` as the auth —
the gateway's `executeSkill` (`mcp-server`) imports it, and the ReAct loop
runs it through `ReasonConfig.runSkill`, which every entrypoint that calls
`reason()` (heartbeat, workspace-chat, agent-operate) sets to
`executeSkillRequest` — so a tool call is one invocation, not two (the same
reasoning as "FlowPilot does NOT call its own MCP gateway"). `reason.ts`
itself imports only the contract (`_shared/execute/types.ts`, no imports):
the app's `tsc` reaches it through its tests, and the 20k-line core is
Deno's, checked by the deno ratchet; without a runner the loop takes the HTTP
hop (a harness that stubs fetch). The dispatchers that rely on `async: true`
(automation, event, signal) and the rest of the 16 callers still
`fetch(.../functions/v1/agent-execute)`; convert one at a time. The core
imports the four JSON bundles from `agent-execute/` (where
`scripts/generated-artifacts.ts` writes them), so every function that imports
it bundles them too (~5 ms to parse; not a cold-start cost). The guards that
read the executor as text read `_shared/execute/core.ts`.

**Core API:**
- `chat-completion` — FlowPilot AI endpoint; supports OpenAI, Gemini, local, n8n providers
- `get-page` — serves pages with caching; called by PublicPage before DB fallback
- `content-api` — programmatic content access

**Agent / FlowPilot:**
- `agent-execute`, `agent-operate` — agentic AI workflow functions; the ReAct engine is `_shared/pilot/reason.ts`.
  **agent-execute's pipeline lives in `_shared/execute/core.ts`**
  (`executeSkillRequest(body, auth)` → `{ status, body }`); `agent-execute/index.ts`
  is the HTTP door — see "The executor is a function you import" above.
- `flowpilot-heartbeat`, `flowpilot-lifecycle` (briefing, distill, learn, followthrough, curator) — autonomous operator lifecycle
- `mcp-server` — outward-facing MCP gateway for external agents/federation peers

**Automations:**
- `automation-dispatcher`, `event-dispatcher`, `signal-dispatcher`, `signal-ingest` — workflow automation pipeline

**Commerce / Finance:**
- `create-checkout`, `create-invoice-payment`, `subscriptions` — e-commerce (the order confirmation is `comms-send`; a paid order's receipt is the `Receipt on paid order` automation)
- `generate-invoice-pdf`, `dunning-processor` — finance (`reconciliation` and `fetch-fx-rates`
  are `internal:` handlers in `agent-execute` since the 2026-07 consolidation, not functions)

**AI Enrichment:**
- `extract-pdf-text` — data enrichment (`prospect-research`, `contact-finder`, `enrich-company`, `parse-resume` and `extract-receipt` are `internal:` handlers in `agent-execute`, `_shared/handlers/`)
- `web-search`, `web-scrape` — web intelligence (a page behind a login is an
  external agent's job — its own browser, handed in over MCP; Browser Control
  and `browser_fetch` were retired 2026-11-09)

**Integrations:**
- `stripe-webhook`, `gmail-oauth-callback`, `composio-proxy`, `integrations-account` (every provider's usage card) — third-party (`gmail-inbox-scan` is an `internal:` handler)

**Communication:**
- `email-send`, `comms-send` (`?kind=` order_confirmation, invoice_email, quote_email, contract_email, contact_email, booking_confirmation, the reminders …), `newsletter` (`/subscribe`, `/send`, `/track` …) — outbound comms

**System / Admin:**
- `setup-database`, `system-integrity-check`, `instance-health` — operations (`test_ai_connection` is an `internal:` handler)
- `run-autonomy-tests`, `run-platform-tests` — autonomous testing

**Shared utilities** live in `supabase/functions/_shared/`:
- `pilot/` — FlowPilot ReAct engine (reason.ts, prompt-compiler.ts, built-in-tools.ts, handlers.ts)
- `skills/intent-scorer.ts` — Skill Relevance Engine (shared between FlowPilot and MCP gateway)
- `mcp/` — MCP schema definitions and connection group config
- `ai-call.ts`, `ai-config.ts`, `ai-providers.ts` — AI provider abstraction
- `token-tracking.ts`, `trace.ts`, `agent-audit.ts` — observability

### The Agent Harness (platform spine)

The components above plus the ReAct loop, Skill Relevance Engine, trust dial, cadence/
evidence guards, self-correcting errors and the Curator together form **the FlowWink Agent
Harness** — the named platform spine that both FlowPilot (internal operator) and external
agents (via the MCP gateway) run on. It is platform-level, NOT a flowpilot-module feature.
When adding agent-reliability behaviour, place it by harness component, not by module. Full
component map, ownership ruling, and the Trace/resumption build plan:
**[docs/architecture/agent-harness.md](docs/architecture/agent-harness.md)**.

### MCP Server (external agent access)

`mcp-server` exposes FlowWink skills to external agents. It runs on Supabase Edge Functions, so the transport is **Streamable HTTP** (not stdio — there is no long-lived local process). This is a consequence of serverless deployment, not Deno. **Its address is the site's own `/mcp`** (`api/mcp.ts` on Vercel proxies `/mcp` and every subpath to the function, query and headers intact, streaming, 60 s window; `nginx.conf` carries the stub for Docker) — the shape every other integration uses (`mcp.stripe.com`, `mcp.linear.app/mcp`); `mcp.<domain>` is one more domain on the same project. The functions URL stays valid and is what the admin shows when the deployment does not answer on `/mcp` (`useMcpAddress` probes with a real `initialize` — `src/lib/mcp-probe.ts`, judged on the decoded body, never a header: the proxy answered plain JSON labelled gzip for a week in 2026-11 while an OPTIONS probe said fine). The Connect-agent wizard's **Test the connection** runs the same probe with the new key; the nightly MCP regression asks every site in the repo variable `MCP_PROBE_SITES` at its `/mcp` (no key — the JSON refusal is the proof).

The system has 600+ skills. Exposing all of them as individual MCP tools floods a client's context. Three connection profiles control what a client sees (all via query params; default = unfiltered, kept for backward compat):

- `?groups=crm,commerce` — specialist: only that category's tools (~8). See `_shared/mcp/groups.ts` and `/rest/groups`.
- `?mode=dispatch` — generalist operator: a **3-tool surface** — `search_skills({query, groups?})` ranks skills by intent (each entry carries `has_instructions`), `read_skill({name})` loads a skill's full instructions/playbook before running it (the same lazy tier FlowPilot has via its built-in `skill_read`), `execute_skill({name, arguments})` runs one. Broad reach, ~3 schemas in context.
- (no param) — all tools exposed.

**Skill relevance is a platform primitive, not a FlowPilot-internal one.** The component is the **Skill Relevance Engine** (`scoreSkillsByIntent` / `loadRecentUsageCounts` in `_shared/skills/intent-scorer.ts`). Name it for what it does (ranks skills by intent), NOT for a transport — it is neither "MCP" nor "FlowPilot" specific. It has **two consumers**:

1. **FlowPilot** (`reason.ts`) — internal, every ReAct turn: narrows 600+ skills → ~25 relevant ones. No MCP involved here; this is a direct in-process call over the DB-loaded skill set. The scorer receives `config.scoringIntent` (e.g. active objectives) concatenated with the last user message — so autonomous loops surface objective-relevant skills, not just meta-tools.
2. **The outward MCP gateway** (`search_skills` in `?mode=dispatch`) — external operators, the same ranking exposed as a tool.

It lives in `_shared/skills/` (NOT under `pilot/`) precisely because the gateway must work for external agents even when the FlowPilot module is disabled. When promoting capability-discovery logic, keep it here. FlowPilot's actual intelligence (soul, objectives, ReAct decisions) stays in FlowPilot; only the "which skill is relevant" lookup is shared. Avoid naming it "Router"/"Selector" — selection is by scoring on metadata, not hardcoded dispatch (Law 1).

**FlowPilot does NOT call its own MCP gateway internally** — it shares the Engine and hits the DB / `executeSkill` directly. Deliberate, not an omission: MCP would add an HTTP hop, auth, and JSON-RPC serialization for zero gain when you're already inside the same Deno process with service-role DB access. MCP is a transport for *crossing a trust/process boundary*; FlowPilot is already on the inside of it.

**The native transport is the caller's (2026-11-06).** `getMcpHandler` runs
under the request store (`requestContext.run` in the `/*` route), so
`loadExposedSkills` sees the peer's group ceiling, `filterByOwner` makes
`tools/list` the owner's reach, the handler cache is keyed by `?groups=` +
ceiling + owner (+ schema flavour, mode) and lives 60 s — a module switched
off leaves the list within a minute — and every native tool handler runs
`scopeAllowsSkill`, `skillWithinGroups` and `ownerMayRun` before
`executeSkill`, as REST does. Until then the server was built outside the
store and cached per `?groups=` alone for five minutes.
**One description, every surface (2026-11-06).** The row's `description`
(the one with `Use when:` / `NOT for:`, `rankableDef`) is what native
`tools/list`, `/rest/tools`, `search_skills` and FlowPilot's pre-narrow all
send; `tool_definition.function.description` is the fallback. A ratchet
(`skill-descriptions-carry-the-markers`) keeps every exposed skill marked
and under 2000 characters — a manual belongs in `instructions`, read with
`read_skill`. `?groups=<module>` narrows through the owner map
(`skillModuleToken`), so every module that owns a skill is a token.

### REST compatibility layer (`/rest/*`)

The `/rest/execute` endpoint mirrors the MCP tool surface but over plain HTTP POST. It respects `?mode=dispatch` and `?groups=` query params just like the native MCP transport:

- `POST /rest/execute` — call any skill by name: `{ "tool": "browse_blog", "arguments": {} }`
- `POST /rest/execute?mode=dispatch` — exposes `search_skills`, `read_skill` and `execute_skill` as tools:
  - `{ "tool": "search_skills", "arguments": { "query": "create knowledge base article" } }`
  - `{ "tool": "read_skill", "arguments": { "name": "manage_contract_template" } }` — the skill's full instructions (authoring guides, workflow playbooks) before executing
  - `{ "tool": "execute_skill", "arguments": { "name": "browse_blog", "arguments": {} } }`
- `GET /rest/resources/:key` — read resources (requires `Accept: text/event-stream` for `/rest/skills`; use `/rest/resources/briefing` etc. for JSON)
- `GET /rest/groups` — list skill categories and their modules
- `POST /rest/lock/acquire` / `/rest/lock/release` — distributed locking for multi-step ops

**Bug fixed (2026-06-07):** `/rest/execute` previously ignored `?mode=dispatch` and returned "Unknown tool: search_skills". Fixed — dispatch mode now works via both native MCP and REST.

### Skill schema gotchas for external operators

**`manage_kb_article` create** — KB articles are Q&A format. Fields:
- `title` (required) — display title
- `question` (optional, auto-derived from title if omitted: `"What is {title}?"`)
- `answer` / `content` / `body` (required, all accepted as aliases) — full article body
- `category` — string name or slug; auto-creates category if none exist

**`manage_wiki_page` update** — requires `slug` to identify the page. If `slug` is omitted but `title` matches an existing page (case-insensitive), the slug is auto-resolved. Safe pattern: `search_wiki` first to get the slug, then `update`.

**`manage_wiki_page` create** — requires `content_md` (markdown body). Empty bodies are rejected at the handler level to prevent blank pages.

**`manage_company`** — B2B master data lives on `companies`: `org_number`, `vat_number`, `parent_company_id` (subsidiary hierarchy; self-parent rejected), `employee_count`, `annual_revenue_cents`, `credit_limit_cents`, `account_owner`, `tags` (text[]). Use `find_duplicate_companies` before creating a company that might already exist (identical domain scores 1.0).

**`refund_return`** — supports **partial refunds**: each call adds `refund_cents` to the running total; the expected total is Σ(return_items qty × unit_refund_cents) − `restocking_fee_cents`. Over-refunds are rejected. The RMA closes when the total is reached or `p_final: true` is passed. Set the restocking fee via `inspect_return` (QC step, only valid in status `received`).

**`send_invoice_for_order` — the receipt (2026-11-08).** A paid order's receipt
is its paid invoice, never Stripe's: the books' figures, the number series, a page
and a PDF. The automation `Receipt on paid order` runs the skill on `order.paid`
with `receipt: true`, which refuses, sending nothing, when Invoicing is off
(`MODULE_DISABLED`), the order is unpaid (`INVALID_INPUT`) or it already has a
live invoice (`ALREADY_EXISTS`). Lines are gross and split per rate; a paid order's
invoice is born `paid` and is not booked again. A cancelled invoice does not count
as the order's. The mail is the `order_receipt` template in the customer's
language. Only a draft invoice can be deleted, and the link in the customer's mail
is why.

**`manage_opening_balances` — UB blir IB (2026-11-08).** Only the bridge is stored:
the opening balances of the FIRST fiscal year the books carry. Every other year is
derived (`opening_balances_for_year`), and storing one is refused with
`IB_IS_DERIVED`, by the skill and by a trigger. Never book an opening balance as a
voucher; `accounting_reports` reads the derived figure
(`_shared/accounting/opening-balance.ts`). Only the first SIE file's `#IB 0` rows go
in; a later file's `#IB` rows are a control.

**`write_blog_post` — the floor (2026-10-28, after Hermes' audit of autoversio:
median 260 words, 18 titles on one angle, 8 English posts on a Swedish site,
the start page's over-promises in the body, a featured image picked by sending
the brief to Unsplash).** The skill REFUSES (`status: 'refused'`, no `error`,
never retried as is) a body under the site's word floor (Blog settings →
`minWords`, default 600; `CONTENT_TOO_THIN`), in another language than it is
declared in (`LANGUAGE_MISMATCH`), a title that re-words an earlier post
(`DUPLICATE_CONTENT`, containment ≥ 0.67 — the hint names the post to extend),
or carrying a phrase from the identity's `claims_to_avoid` (`FORBIDDEN_CLAIM`).
`manage_blog_posts update` with `content` meets the same floor (no duplicate
check); an import (`published_at` given) is not judged; `force: true` is for a
person. The picture: `image_query` (2–4 concrete English nouns) or the title's
nouns with the industry as anchor — never the brief; the alt is the title. A
picture in the body is `![alt](url)` on a line of its own → a Tiptap `image`
node, which the public renderer now draws (it used to throw and blank the
whole post). The editorial plan is structure: `company_profile.content_angles`
(`[{id, thesis, audience, proof, covered_by}]`); pass `angle` and the post's
slug is written into `covered_by`, so the heartbeat is handed the OPEN angles.
`audit_blog` is the read: words, language, duplicate clusters, images, ruled-out
claims, each finding with `fix.skill` + `args`. The pure rule lives in
`_shared/content-quality.ts`.

**`manage_blog_posts` update** — edits the BODY too: `content` (markdown, converted
exactly as `write_blog_post`) or `content_json` (the Tiptap doc `get` returns), one of
the two. Never delete + rewrite to change a post's text — the id, slug, revisions and
category survive an update. `new_slug` moves the post's address: refused
(`ALREADY_EXISTS`) when another post or another post's translation answers there;
otherwise the platform writes the 301 `blog/<old>` → `blog/<new>` itself
(`_shared/blog-slug-rename.ts`; earlier redirects re-pointed, copied overlay slugs
moved). `/blog/<slug>` and `/<lang>/blog/<slug>` follow `page_redirects` when no post
answers (`src/lib/blog-redirect.ts`), so a renamed, drafted or deleted post with a
redirect never 404s.

**`write_blog_post` / `translate_content`** — a post is written ONCE, in its
source language (`language`, default the site's); `languages` (default every
enabled language but the source) are translated server-side into overlays in
`content_translations` and published when complete — the post's own status
still gates visibility. Addresses: `/blog/<slug>` in the site language,
`/<lang>/blog/<slug>` otherwise. `translate_content(entity: "blog_post", slug,
languages: "all", publish: true)` backfills; `manage_blog_posts update` only
re-translates stale units. See docs/architecture/page-translations.md §9.

**`manage_product` / products in every language** — the same overlay model
(§10, and Shopify's): a product is written ONCE in `products.locale`; `languages`
(array or `"all"`) on create/update translates `name` and `description` into
published overlays (`content_translations`, entity `product`; categories
`product_category`); an update of either re-translates the stale units
(`retranslate: false` leaves them). `translate_content(entity: "product",
product_id, languages: "all")` backfills; `set_translation` /
`publish_translation` / `list_stale_translations` take `entity: "product"` +
`product_id`. A product has no slug — `/shop/<id>` and `/<lang>/shop/<id>` — and
is NEVER absent in a language: untranslated text falls back to the source.
Variant labels (attribute names and values) are site-wide overlays, entity
`product_attribute`, units `attribute.name` / `attribute.value.<id>`; a
product's translation carries the attributes its variants use
(`variant_labels` in the answer), one attribute alone is `translate_content(entity:
"product_attribute", attribute_id)`.

**`site_branding_update`** — non-destructive (only passed fields change) and
theme-aware: `logo_dark_url` / `primary_color_dark` are what the header, footer and
chat widget show in dark theme; `heading_font` / `body_font` split `font_family`.
Empty string clears a dark override.

**`sync_ad_metrics`** — the Paid Growth ad ledger's feed: campaign-level spend /
impressions / clicks / conversions from the Meta ad account connected through
Composio (toolkit `metaads`) into `ad_campaigns`. `dry_run: true` reports without
writing. Nothing else writes `ad_campaigns.metrics`, so if the Growth dashboard
shows zeros, this has not run (or Meta Ads is not connected). There is no
`META_ADS_ACCESS_TOKEN`; a Composio-backed integration is configured when its
connected account exists (`via: 'composio'` in `useIntegrations.tsx`).

**`test_form_delivery`** — "if a visitor submits this form, who gets what?" without a
submission, a lead or an email: `block_id` (or `page_slug` when the page has one form),
`mode: dry_run` (default) reports every rail (storage, lead, webhook, notification email,
job application) against live config; `send_test` also sends ONE [TEST] email to the
notify address and HEAD-probes webhook URLs. The rails come from the same plan the
public block runs (`_shared/forms/delivery-plan.ts`); email is judged by `email-send`'s
own `dry_run: true`.

**The agent envelope (2026-10-26)** — three things every skill answer carries
beside its payload, so an operator branches instead of guessing:
- A failure is `{ error, code, retryable, hint }`. `code` is stable
  (`_shared/agent-errors.ts`): `PERIOD_LOCKED` (never retry — date the entry in
  an open period), `MISSING_EXCHANGE_RATE` (set the rate, then retry the same
  call), `MISSING_REQUIRED_PARAMETER` / `UNKNOWN_PARAMETERS` (the PGRST202
  pair), `FORBIDDEN`, `NOT_FOUND`, `ALREADY_EXISTS`, `INVALID_INPUT`,
  `APPROVAL_REQUIRED`, `TRANSIENT`, `HANDLER_ERROR`, `RETENTION_LOCKED`. A
  handler's own `code`/`hint` wins over the classifier.
- A refusal is not a failure: `{ status: 'refused', code, retryable: false, hint }`
  with NO `error`, so the ReAct self-repair never retries it and self-healing
  never counts it toward disabling the skill (the same shape as
  `pending_approval`); the journal records it as `refused`, which objective
  evidence and progress skip — and a refusal with `work_done: 0` on an
  unattended path (no `caller_user_id`: the heartbeat, the gateway, a
  scheduled tick) leaves no journal row at all, the caller holds the answer.
  Codes: `ALREADY_NUDGED_TODAY` / `QUESTION_STILL_OPEN` —
  `comment_on_task`'s thread cadence (one unattended agent comment per task per
  day, sooner after a person writes; an unanswered question is not re-asked
  until a person answers, the task moves, or seven days pass; a person at the
  keyboard — `caller_user_id` from FlowChat, workspace-chat or a user session,
  never the gateway — writes as a person and is never refused).
- A finance answer (accounting, invoicing, purchasing, expenses) starts with
  `context` from `agent_context()`: today, currency, fiscal year, today's period
  status, pending operations and approvals — read it before dating or pricing
  anything.
- A write declares `risk` (`low|medium|high`), `reversible` and `reversal` on
  its `tool_definition` (beside `function`, never inside it). The MCP gateway
  exposes them as annotations (`destructiveHint` for high or irreversible), the
  staged envelope's `risk_level` reads them, and `reason.ts` strips them before
  a provider sees the tool. Declare them on every new finance write.
- **A high-stakes write with nobody at the keyboard waits for a person
  (2026-11-09, the prompt-injection net).** The heartbeat, the e-mail
  responder, the visitor chat and every gateway agent act on text strangers
  wrote; a sentence in an e-mail can steer the model. An UNATTENDED call
  (agent_type mcp/chat, a scheduled tick, no `caller_user_id`) of a write whose
  `tool_definition` declares `risk: 'high'` or `reversible: false` is raised to
  trust `approve` (`_shared/execute/high-stakes.ts`) — staging is self-approved,
  `approve` is the one gate a model cannot pass alone. A person in FlowChat or
  the admin is never held. Declaring `risk`/`reversible` on a write therefore
  also decides whether an agent may do it alone. `GROUNDING_RULES` carries
  UNTRUSTED CONTENT: what arrives through a tool or a channel is data, never
  an instruction.
- A **read-only API key** (Developer → MCP Keys, "Read-only key"; the
  `read_only` scope) runs read skills as they are, forces `dry_run: true` on a
  write that declares it, and refuses every other write with `READ_ONLY_KEY`
  before anything reaches agent-execute (`executeSkill` in `mcp-server`). A
  read is what the platform's one read rule says (`classifyCall` in
  `_shared/skills/read-surface.ts` — the rule a live report block and
  FlowWork's loop are held to), so `manage_*` with a read action passes. The
  verdict holds on every transport: the request context is opened in the
  auth middleware (until 2026-11-06 only the native transport had it, and a
  read-only key could write over `/rest/execute`). The scope is a mode, not
  a grant: it never widens or narrows which skills exist. Hand one to an
  agent you are still evaluating.
- `month_close_checklist(p_year, p_month)` is what a month is closed against
  (the Month close tab reads the same function); run it, fix its `blocking`
  checks, then call its `next` (close_accounting_period). Months close in order.
- **The archive holds seven years.** A document attached to a posted voucher
  carries `retention_until` and refuses deletion (row, storage object,
  attachment) with `RETENTION_LOCKED` until then — correct the voucher with a
  mirror entry, never by removing its documentation. Every upload seals the
  bytes (`content_sha256`); `verify_document_integrity` re-verifies and reports
  a mismatch instead of re-sealing it; `export_voucher_archive_manifest` is the
  year's arkivförteckning.
- **Quiet when there is nothing to say (2026-11-06).** Every automatic
  surface asks which modules are on before it speaks (`loadEnabledModules`
  in `_shared/modules.ts`: one read, many questions). The daily briefing
  gates every section and action item per module, has no health score
  without a signal, and on a day with no action item and no figure writes
  its `flowpilot_briefings` row and sends nothing. `check_operations` judges
  an area only when its module is on (automations always) and answers
  `areas`; `check_books` accuses nothing before `books_started_on()`. The
  weekly digest is an automation, never a starter objective — an always-
  active objective is what kept the heartbeat's idle short-circuit from
  firing. A new automatic surface follows the same rule: ask the modules,
  say nothing about one that is off, send nothing on an empty day. The
  nightly fresh install proves it first (`npm run qa:quiet` before `qa:prep`,
  `scripts/quiet-by-default.ts`): a red run means something alarms a virgin
  instance again.
- **The briefing is the business, Observability is the machine room
  (2026-11-08).** The Daily Briefing reads no platform health: a failing
  pg_cron job or skill was an action item its admins could do nothing about,
  and enough to send the mail. An action item is something a person on the
  instance can act on; the operator's own work is told, never a reason to
  send. What is the platform's fault goes upstream with the daily
  `feedback_ping` (`_shared/feedback/machine-room-reports.ts`, behind
  `share_usage`, under `submit_feedback`'s cadence); titles name the defect,
  bodies never carry error text.
- **A module that is off is off for agents (2026-11-06).** The gate is the
  skill's OWNING module (`skillModuleOn` in `_shared/skills/module-gate.ts`,
  from the generated owner map), not its category: the gateway's discovery
  and FlowPilot's skill loading hide the skills of an off module, and
  agent-execute refuses one with `MODULE_DISABLED` (a refusal: `status:
  'refused'`, no `error`, never retried, never counted toward self-healing).
  Platform skills, agent-made skills and the kept utilities
  (`TEARDOWN_KEEP_SKILLS`) always pass; a missing modules row fails open.
  A hidden row of an off module answers `MODULE_DISABLED` too, never "Skill
  not found". The skill sync heals leaked rows for every off module when the
  modules row is present; the wake-on-write of an untouched module (Law 4,
  `autoActivateModule`) needs a row that is still enabled, which the heal
  ends — in practice a module is switched on under Modules or with
  `manage_modules`.
- `check_operations` is the operations twin of `check_books` (2026-10-27,
  after Hermes' first morning on Nordbrygg): one read across sales,
  receivables, contracts, support, field service, automations and the chat
  — per ENABLED module — each finding with `fix.skill` + `args`, plus `assignable` — the auth user
  ids a ticket (`manage_ticket assigned_to`) or a visit (`manage_service_order
  technician_id`) can go to; empty means the owner must invite people, an
  agent cannot. A renewal window is answered with `manage_contract
  decide_renewal` (renew | terminate | renegotiate); a decided contract leaves
  `contract_renewal_check` (listed under `decided`) and the operations list.
  `manage_automations list` carries a `state` judged against each job's own
  schedule — a weekday job looked at on a Sunday is on_schedule, never
  stalled. `manage_site_settings update` MERGES into an object setting
  (`replace: true` to overwrite), so flipping `chat.toolCallingEnabled` never
  wipes the chat configuration.
- **The feedback module (on by default, 2026-10-27).** The board Easypanel
  has, for every instance: boards bug | feature | template | question, posts
  with a status (open | planned | in_progress | done | declined), votes and
  comments. The ENDPOINT is the dial (`site_settings.feedback.endpoint`,
  default `https://www.flowwink.com`): an instance SENDS `submit_feedback`
  and the daily `feedback_ping` (instance id, site URL, skills sha, enabled
  modules — `share_usage: false` stops it) to the endpoint's `/api/feedback`
  (a Vercel route that proxies to its content-api; a functions URL ending in
  `/content-api` is taken as is). An instance whose endpoint names itself
  RECEIVES: the public board at `/feedback`, `manage_feedback` (list /
  set_status / comment / delete / `instances` — the fleet that pings) and
  `/admin/feedback`. One code path for the admin form and an agent.
- **A need with alternatives is a capability (2026-11-07).** A module
  states `requiredCapabilities: ['email' | 'web:read' | 'web:search']`
  (`useModules.tsx`, `CAPABILITY_PROVIDERS`) and any provider of it
  satisfies the need — Resend, SMTP or Composio for mail; the built-in
  reader, Firecrawl or Jina for reading the web. `requiredIntegrations` is
  for a product with no alternative (a guard refuses one that has). The
  module card names the capability, never one product.
- **A module that is off is off for visitors too (2026-11-07).**
  `PublicModuleGate` (the router's root layout) answers the site's own 404
  for a public route of a module the row does not carry as enabled —
  `public-route-modules.ts` maps route prefixes (`/shop`, `/feedback`,
  `/blog`, `/kb`, `/jobs`, `/docs`, the token pages …) to their module, with
  or without a `/:lang` prefix; a mapped route waits for the row rather than
  serving the page. A guard reads every public route out of `App.tsx`: map a
  new public page or declare it module-less there.
- **A module that is off is off for the browser too (2026-11-07).** The
  sidebar hid a disabled module's pages, but the route gate asked only the
  role matrix, so an admin who typed the URL was served the page and its
  first write woke the module. `moduleOffForRoute` (`admin-route-access.ts`)
  reads the modules row exactly as the sidebar does; `AdminLayout` and
  `AdminRouteGate` answer with `ModuleOff` (the module's name, a door to
  Modules for an admin) for everyone, admins included. Routes without a
  module (`/admin`, `/admin/modules`, personal pages) and a missing row never
  block.
- **A module that is off is quiet everywhere that only looks (2026-11-08).**
  Observability, the notifications bell, the dashboard and analytics read
  automations, runs, cron jobs and skills directly, so a module the operator
  chose not to run kept raising warnings there. One rule now, the server's
  own: `src/lib/module-visibility.ts` (`useActiveModules`, `skillShown`,
  `moduleShown`) wraps `skillModuleOn` and the generated owner map; a skill is
  judged by the module that owns it, platform skills always show, a missing
  modules row shows everything. pg_cron jobs carry their module in
  `CRON_JOB_MODULE` (`_shared/cron/health.ts`): a job of an off module is never
  red (`module_off`), is not a required job on the readiness checklist, and is
  not a drifted job on the pulse card; every `enrichCronHealth` caller passes
  `moduleOn: await loadEnabledModules(supabase)`. A new surface that shows
  agent or cron data asks the same rule (`off-modules-stay-quiet` pins the
  surfaces). A tab or panel of ANOTHER module mounted on a page asks whether
  that module is on — `foreign-module-panels-ask` discovers them from the
  router, the module tables and the hooks, and ratchets the ones left.
- **One module switch (2026-11-06).** `_shared/modules/module-switch.ts`
  is the only code that switches a module on or off: the row, the skills
  (both flags in one write, via `hideSkills`), every automation that runs one
  of the module's skills, and `site_settings.module_teardowns` with the
  automation ids enable resumes. Its callers: `manage_modules`, the Modules
  page (`src/lib/module-switch.ts` builds the catalogues from the registry
  and runs it as the admin), `manage_site_settings key=modules` (the
  `enabled` flags go through the switch, the rest merges) and
  `install_template` (parents included, `withParents`). A new writer of the
  modules row runs the switch — never the row alone, which is the state
  `autoActivateModule` wakes a module from. The rules (graph, core,
  protected, which skills) stay in `module-plan.ts`.
- **The operator runs the platform too (2026-10-31).** `module_usage_report`
  (read) says per module: rows in its declared tables (`tables_with_rows` —
  configuration counts, read it), calls by people/agents, automation runs, who
  needs it, and `suggest_off`; `manage_modules` (trust `approve`) switches the
  module row, its skills and every automation that runs one of them, and
  records the decision in `site_settings.module_teardowns` so
  `autoActivateModule` never wakes it again — writing the modules row through
  `manage_site_settings` does NOT (its automations kept running and woke it).
  Refuses core modules and names the dependents/parents to add. What works
  badly in the platform goes upstream with `submit_feedback` (board bug):
  one report per defect per instance in 14 days (`ALREADY_REPORTED`), three a
  day for an unattended caller (`FEEDBACK_DAILY_CAP`), refusals both.
- **The agent's day (2026-11-04).** `agent_activity.api_key_id` names the
  connected agent behind every MCP call (set in `logActivity`, backfilled from
  `input._caller_api_key_id`); `agent_day(p_peer_id, p_since)` answers calls,
  outcomes, skills, reports published and the steps — an admin or the agent's
  owner, never anon — behind **Activity** on the Agents page and
  `agent_day_report(agent, hours)` over MCP. `get_agent_trace` stays the
  per-run decision log.
- **`invite_colleague`** (platform, trust `approve`): an agent asks, a person
  approves under /admin/approvals, Supabase Auth mails the invitation and the
  functional role is granted on first sign-in. The edge function admits the
  platform's own call (service key + `_skill`) beside an admin session.
  `check_operations` points at it when `assignable` is empty.
- **Born right (2026-10-27).** `manage_invoice create` without `due_date`
  gets one from the payment terms (`net30` → 30 days after the issue date,
  30 when the terms say nothing). Every commercial `currency` column is
  upper-cased by trigger and defaults to `business_currency()`
  (`subscriptions` used to default to `'usd'`). The visitor chat's
  `toolCallingEnabled` and `humanHandoffEnabled` are ON when absent (Law 4);
  an explicit `false` still switches them off.
- `check_books` is the read-only "what needs attention in the books" — run it
  first in a bookkeeping session; each finding's `fix.skill` + `args` carries
  the exact parameter names. `statutory_deadlines` is the filing calendar (SE
  rules only) with the register's verdict per line: filed / overdue /
  due_soon / upcoming. `overdue` means due and NOT recorded as filed — ask
  before concluding it is late, then `manage_statutory_filing record` with the
  agency reference (only what a person said was filed; a recorded filing
  silences the calendar).

**`manage_journal_entry` + bank events — the rule loop** — a booking of a
bank event answers `rule_suggestion` when no rule or vendor default decided
it: ask the person before making a rule; `remember_counterparty: true` makes
one, `false` learns nothing, omitted keeps the legacy silent vendor ramp. Pass
the proposal's `rule_id` with `match_source: "rule"` so the rule is credited.
A rule is a template (`manage_reconciliation_rule` with
`p_suggested_template_id`) and wins `propose_bookkeeping` outright.

**`publish_report` — Reports (2026-11-03)** — what an agent worked out, as a
versioned page staff open at `/admin/reports/<slug>` (the wiki says how things
are; a report what happened). Markdown with the AgentReports blocks (`::kpis`,
`::note warn`, `::details`, ```` ```chart bar|stacked|line|pie ````) or a sandboxed
HTML page; `read_skill publish_report` carries the guide. A ```` ```live ```` block
(`{skill, args, kpis|chart|table}`) fetches its figures when opened, as the
reader (`read_only: true` — agent-execute refuses anything but a read,
`READ_ONLY_RUN`); `publish_report` refuses a malformed, unknown or writing
live skill (`LIVE_BLOCK_INVALID`). A report of live blocks is a dashboard. Every publish is a
version, identical content adds none, `expected_version` refuses a stale write
(`STALE_VERSION`), `audience_module` narrows who may read it. The platform
stamps the publisher (FlowPilot / Flowwork / the MCP key's agent name) and the
person who asked — never a model. Agents add, never take away: archive,
restore and rename are a person's (`report_person_*` refuse the service role),
and what a person renamed an agent's next version keeps (`kept_person_fields`).
docs/modules/reports.md.

**`manage_kb_article` get** — accepts `article_id`, `slug` or `title` (NOT `id`). Title resolves case-insensitively (exact, then unique prefix); ambiguous titles error with guidance. Safe pattern for certainty: `list`/search first, then `get` by slug.

**`upload_document`** — binary mode requires `mime_type` alongside `content_base64`; text mode uses `content_text`.

**`update_company_profile`** — Business Identity is what a page-authoring agent
reads before it emits blocks, so its structured fields carry BOTH halves a block
needs: `services` and `differentiators` are `[{name, description}]` (a features
block needs the description; a bare label means the generator writes one
itself), `proof_points` are `[{value, label, context}]` with the figure printed
verbatim in `value` ("412 km", "99,98 %"), `client_testimonials` are
`[{quote, author, role, company}]` one entry per quote, and `primary_cta` is
`{label, destination, intent}` — without a label there is no CTA and a generated
page ends with no ask. Legacy shapes (`differentiators: string[]`, a single
testimonial blob) are migrated on read and coerced on write, never rejected.
Keep metrics OUT of `delivered_value` prose alone: parsing a number back out of
a sentence is where a model invents one. Leave an attribution or a description
empty rather than guessing it — an omission is correctable, an invention is not.

### Template System

Templates live in `src/data/templates/` as TypeScript, registered in `index.ts → ALL_TEMPLATES`.

**Available templates:**
- `flowwink-platform` — complete platform demo with all modules (94KB)
- `consult-agency` — consulting agency
- `securehealth` — healthcare compliance
- `launchpad` — startup/SaaS landing page
- `flowwink-agency` — marketing agency
- `digital-shop` — e-commerce
- `service-pro` — service provider
- `trustcorp` — financial services
- `demo-company` — general company demo
- `momentum` — minimal startup
- `helpcenter` — support/KB-focused
- `blank` — empty template

When a template is installed (`NewSitePage`), it seeds:
- Pages, blog posts, KB articles, products, consultant profiles
- FlowPilot soul + objectives → `agent_objectives` table via `setup-flowpilot` edge function

To add a new template:
1. Create `src/data/templates/my-template.ts`
2. Export and add to `ALL_TEMPLATES` in `index.ts`
3. Run `bun run scripts/templates-to-json.ts`

### Key conventions

- **Path alias**: `@/` maps to `src/`. Use it for all imports.
- **Logging**: Use `logger` from `@/lib/logger` (not `console.*`). Logs are suppressed in production except `logger.error`.
- **Styling**: Tailwind with design tokens (`bg-background`, `text-foreground`, `border-border`). Never use raw colors.
- **State**: TanStack Query for server state; React state for local UI state.
- **Forms**: react-hook-form + zod validation.
- **UI components**: shadcn/ui in `src/components/ui/` — prefer these over custom implementations.
- **Module contracts**: All cross-module data exchange uses the Zod schemas in `src/types/module-contracts.ts`.
- **Tiptap editors**: Always use the shared `<AITiptapToolbar>` component — never build per-block AI toolbar variants.

## Source Layout

```
src/
  components/
    public/blocks/    # 67 public-facing block renderers
    admin/blocks/     # 70+ admin block editors
    admin/            # Domain admin components (crm/, blog/, hr/, invoices/, accounting/, ...)
    account/          # Customer portal components
    ui/               # shadcn/ui primitives
  pages/
    admin/            # 100+ admin pages
    (public)          # ~28 public pages
    account/          # ~15 customer portal pages
  hooks/              # 151 custom React hooks (TanStack Query)
  lib/
    modules/          # 69 module definitions
    module-def.ts     # Module definition type system
    module-bootstrap.ts
    module-registry.ts
    block-reference.ts  # 48KB — canonical block metadata registry
    logger.ts
  types/
    agent.ts          # Agent / FlowPilot types
    cms.ts            # CMS / block types
    module-contracts.ts  # Zod contracts for cross-module communication
  data/templates/     # 12 site seed templates
  integrations/       # Supabase client + generated types

supabase/
  functions/          # 76 Deno edge functions (see docs/reference/edge-functions.md)
    _shared/          # Shared utilities
      pilot/          # FlowPilot ReAct engine
      skills/         # Skill Relevance Engine
      mcp/            # MCP schema + groups
  migrations/         # Idempotent SQL migrations

scripts/              # Developer tooling (bun/node/tsx)
docs/                 # Contributing guides, architecture notes
```

## Database Migrations

All migrations MUST be idempotent (safe to run multiple times). Use `IF NOT EXISTS`, `CREATE OR REPLACE`, and `DROP ... IF EXISTS` patterns. See `docs/contributing/contributing.md` for detailed SQL patterns.

Migrations are timestamped UUID filenames: `YYYYMMDDHHMMSS_<uuid>.sql`.

**Squashing migrations destroys seed data — extract it first.** The 2026-06-08
baseline squash (453 files → one schema baseline) kept all DDL and silently
dropped every seed `INSERT`. `role_module_access_defaults` had been seeded in an
April migration; after the squash, every fresh install was born with empty role
tables, so role views showed only ungated nav items — and nobody noticed for two
months because every live instance predated the squash and a July feature
(RolePreviewSwitcher) was built on top of data that was already gone from the
repo. Rules that follow:
1. Before any squash: `grep -l "INSERT INTO"` across the files being removed,
   and move platform-config seeds into their own forward-dated idempotent
   migrations FIRST (see `20260804150000_seed-role-module-access-defaults.sql`
   for the pattern — defaults upserted, live table filled only when empty so
   operator customisations survive).
2. After any squash or consolidation: run one install from scratch. "Works on
   dev" is the weakest possible evidence — dev has accreted since April and can
   never fail the fresh-install test.
3. Distinguish platform config (nav/role behaviour — MUST be seeded) from
   business config (carriers, booking services, approval rules — born empty is
   correct; a new org defines its own).

```bash
# Push migrations to a Supabase project
supabase db push --project-ref <ref>
```

## Deployment

> **Generated artifacts are the bot's, not the PR's.** Eight files are pure
> functions of the source (`scripts/generated-artifacts.ts`: the skill, automation
> and locale-pack bundles, their edge-runtime copies, the visitor-text catalogue's
> edge copy, the skill→module map, the instance manifest). Never commit them from a branch — CI rebuilds them before
> tests and build and FAILS a PR that carries them; `refresh-generated-artifacts.yml`
> rebuilds and commits them on `main` after every merge; the nightly fresh install
> proves `main` is fresh. Locally: `npm run artifacts:build` (stays in the working
> tree). The pre-commit hook in `.githooks/` unstages them; enable it with
> `git config core.hooksPath .githooks` after cloning. Before 2026-10-02 every PR
> regenerated them, and every pair of parallel PRs conflicted in a hash line.


Frontend (Vercel/Easypanel) auto-deploys from GitHub push. On Vercel every page
navigation is served by `api/html.ts`, which fills the brandless `index.html`
head (title, description, OG/Twitter, canonical, hreflang) from `site_settings`
and the page row — one document for every reader, no User-Agent list — and
caches it on the Performance → Edge caching dial (`src/lib/seo-shell.ts`). The
Docker image serves the static shell; react-helmet fills the head after hydration.

Manual steps per Supabase project after migrations or new edge functions:
```bash
supabase db push --project-ref <ref>
supabase functions deploy <function-name> --no-verify-jwt --project-ref <ref>
# Skills follow the edge deploy by themselves (see below). Only for an instance
# no admin will open, or to force it: sync agent_skills from the artifact.
DATABASE_URL='postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres' npm run sync:skills -- --apply
```

Public-facing edge functions must be deployed with `--no-verify-jwt`.
Admin-only functions can use default JWT verification.

**A "site" is four layers** (schema via migrations, skills via the artifact,
edge functions via deploy, frontend via Vercel). `agent_skills` rows come from
`skillSeeds` in `src/lib/modules/*` — **not** migrations — so running migrations
never refreshes skills. **The skills layer follows the edge deploy on its own:**
the edge deploy bundles the generated artifact (`_module-skills.json`) into
`agent-execute`, and the admin shell calls `sync_skills_from_code` on every page
load (`ensureSkillRegistry` in `src/lib/module-bootstrap.ts`). That handler
measures coverage against the ENABLED modules, inserts what is missing and
rewrites every drifted definition field (never `trust_level`), and takes a fast
path only when the instance already carries this deploy's artifact sha AND
coverage is complete. So after a merge: refresh job commits the artifact →
edge deploy → the first admin visit syncs. **Automations ride the same rail
(2026-11-04):** the bundle carries every module's automation seeds and the same
sync inserts the missing ones for enabled modules — by name only, never
updating (a retuned cron survives), each name once (`site_settings.seeded_automations`
remembers, so a deleted automation stays deleted). Before, only a browser
bootstrap seeded them, and "Feedback ping" reached no live instance. Verified 2026-10-16 on sandbox and
www: `manage_booking_service` (#637, 2026-10-06) was refreshed on 10-07 and
10-09 with nobody running a sync; the deployed sha, main's artifact and the
`skills_artifact_sha` stamp are identical. Two things that mislead: the stamp
row's `updated_at` never moves (`site_settings` has no updated_at trigger — read
the value, not the timestamp), and an instance NO admin ever opens (a headless
API-only site) never syncs by itself — that is what `npm run sync:skills --
--apply` (DB creds) and the admin "Sync skills from code" button are for.
Full runbook, the live fleet's refs, and fork vs. auto-deploy topology:
**[docs/operators/provisioning-and-updates.md](docs/operators/provisioning-and-updates.md)**.
NB: fork auto-deploy varies — VERIFY, don't assume: autoversio.ai and optictunnels.se
auto-deploy BOTH Vercel and Supabase (migrations + edge functions) on a fork push
(verified 2026-08-31: deployed sha == fork main); skills then follow on the first
admin visit, as above. A fork whose Supabase rail does NOT run edge deploys keeps
the OLD artifact inside `agent-execute`, and the sync faithfully re-asserts old
definitions — there the gap is the edge deploy, not the skills.

### Drift & agent-usability learnings (operational)

Hard-won notes from reconciling the (since retired) Lovable-managed dev instance
and making the MCP skill surface usable by an autonomous operator (OpenClaw). The
managed-ledger lessons still apply to every fork's Supabase integration:

- **Forward-date migrations — and let the command do it.** `supabase db push`
  (the fleet rail) refuses a pending migration dated below the remote's newest
  applied version: *"Found local migration files to be inserted before the last
  migration on remote database. Rerun the command with --include-all"* — one
  back-dated file stops every deploy, and with the flag a live instance applies
  it after everything else while a fresh install applies it by filename order.
  The CI guard rejects such files; when main moves under your PR run
  `npm run migrations:redate` (renames past the head, rewrites every reference)
  instead of re-dating by hand (#313 was re-dated 27 times over 84 merges). The
  retired Lovable ledger had the related failure of skipping such files
  silently — missing functions, a missing `refund_return(...,p_final)`
  overload, admin functions stuck on pre-patch bodies — which is why bodies
  stay idempotent (`CREATE OR REPLACE`) too.
- **Name-only existence checks miss body/signature drift.** `pg_proc` by name
  says a function exists, not that its body is current or that an overload is
  present. Verify behavior (live call) or the specific signature, not just the name.
- **MFA for staff lives in the role gate (2026-10-29).** `has_role()` and
  `can_access_module()` ask `session_mfa_ok()` first: a staff session that
  enrolled a TOTP factor, or that the dial `security.mfaRequiredForStaff`
  requires one of, reads as nobody until its JWT says `aal2`. The service role
  and checks on behalf of other users pass; customers are never gated. The
  shell shows the challenge / forced enrollment from the same rule
  (`src/lib/mfa-gate.ts`); own profile and own roles stay readable at aal1 so
  it can. Heals that run on admin page load (`useFlowPilotBootstrap`,
  `useTenantLocalePack`) wait for the gate, or every refusal would read as
  absence. `admin_reset_mfa` is the recovery; docs/operators/mfa.md.
- **Agent-callable SECURITY DEFINER functions need the service_role escape.** The
  MCP gateway runs RPC skills with the service key, so inside the function
  `auth.uid()` is NULL and `has_role(auth.uid(),'admin')` is false. Guard with
  `(auth.role() = 'service_role' OR has_role(auth.uid(), <role>))` or the operator
  gets "Only admins…". 44 admin functions had this patch stranded in skipped
  backdated migrations. **And the mirror rule (2026-10-29): a definer function
  the browser never calls carries no EXECUTE for `anon`/`authenticated`** —
  edge, agent-execute and cron run as the service role, other definer
  functions as the owner. 112 were revoked in `20261029120000`; a browser-called
  one is guarded in its body with `can_access_module(auth.uid(), '<module>')`.
  Find the open ones in pg_catalog, not in a list: definer, non-trigger,
  executable by authenticated, body without `service_role` / `has_role(` /
  `can_access_module(` / `is_staff(` / `auth.uid() =` — then check pg_policy,
  invoker-side functions, views, defaults and constraints before revoking.
- **A scheduled function admits three callers (2026-11-09).** The service
  key, a staff session, or `x-cron-secret` — a random secret the database
  makes in its own vault (`CRON_SECRET`, migration 20261109160000) and adds to
  every scheduled call at call time (`cron_secret_header()`, `pulse_lane`).
  `requireScheduledCaller` (`_shared/edge-auth.ts`) is the check; a new
  function pg_cron calls asks it, and its cron job needs nothing special:
  automation-dispatcher runs `cron_jobs_carry_the_secret()` every tick and
  rewrites any `net.http_post` job to an edge function that lacks it. Never
  put the secret or the service key in a job's text, and never schedule a
  call with the publishable key as its only credential.
- **A sweep asks whether there is work before anything wakes (2026-11-09).**
  An automation may declare `trigger_config.work_probe: '<name>'`, answered by
  `public.work_probe_<name>()` (boolean, STABLE, a SUPERSET of what its skill
  would pick up). `automation_has_work(trigger_config)` is the one question:
  the lane asks it before it pulses (`lane_has_work`), the dispatcher before it
  wakes agent-execute. No probe, an unknown probe or a probe that raises means
  there IS work. An idle probed row stays due (the minute work appears the lane
  pulses) and `note_idle_automations()` keeps its `last_triggered_at` fresh, so
  idle never reads as stale. A new every-N-minutes sweep ships its probe in the
  same PR; a daily-at-a-time job does not take one (it would run when work
  appears, not at its hour). The dispatcher also skips an automation whose
  skill's owning module is off (`skillModuleOn`).
- **"Sync skills from code" is the 4th-layer deploy without DB creds — and
  the admin shell presses it for you.** `/admin/modules` → **"Sync skills from
  code"** re-runs `bootstrapModule()` for every enabled module, which **UPDATEs
  all definition fields** (handler, instructions, description, tool_definition,
  …) on existing `agent_skills` rows from the frontend's bundled seeds — runs
  as the admin login, no `DATABASE_URL` needed. The same reconciliation runs
  automatically on every admin page load through `sync_skills_from_code`
  (edge-bundled artifact, see Deployment above), so the button is for forcing
  it or for a frontend-only deploy that got ahead of the edge deploy. Neither
  touches `trust_level`, so runtime trust overrides survive a resync.
- **Self-correcting RPC errors.** `agent-execute` enriches a PostgREST PGRST202
  ("function not found in schema cache" — the signature of wrong param NAMES)
  with the params the agent sent and the skill's declared parameters, so an
  operator that guesses (e.g. `p_payment_method` instead of `p_method`)
  self-corrects next turn. When adding RPC skills, keep `tool_definition`
  parameter names exactly matching the function so this hint is accurate.
- **Skill instructions are the agent-context lever.** Most autonomous-operator
  failures are context failures, not platform bugs (guessing `quantity` vs `qty`,
  `vendor_name` vs a `vendor_id` UUID, missing the staged-op handshake). Bake the
  exact param/field names and non-obvious workflow (e.g. staged
  `approve_pending_operation` → re-invoke with `_approved_operation_id`) into the
  skill's `instructions`. `instructions` is optional — ~27% of skills rely on a
  good `description` alone, which is valid per Law 2.
- **QA findings live on the gateway, not just the DB.** `scan_beta_findings`
  lists open `beta_test_findings`; `resolve_finding({finding_id, resolution_note})`
  closes them — both callable via the FlowWink gateway with no Lovable/DB access.
  Validate before closing: agent QA reports are frequently false positives (wrong
  arg names read as "missing function/column"). Only a live call or `pg_proc` is
  authoritative.

## Naming & skill-homing policy (FlowWink vs FlowPilot)

**FlowWink is the platform (the BOS/SaaS). FlowPilot is one module** — the
autonomous operator that consumes the platform's skills. Consequences:

- **Platform primitives must NOT live in flowpilot-module.** A skill used
  across modules or by external operators (search_web, scrape_url,
  manage_site_settings, run_daily_briefing, weekly_business_digest…) belongs
  in `src/lib/platform-seeds.ts` (always seeded, module-toggle-independent —
  emitted as pseudo-module `platform` in the skills artifact) or in the owning
  domain module — never gated behind the FlowPilot toggle. This class caused
  real drift twice (weekly_business_digest, the platform-seeds move).
- **Name new platform components for what they do, not for FlowPilot**
  (same rule as the Skill Relevance Engine note above).
- **Runtime identifiers stay stable even where legacy-named.** Edge function
  names (`flowpilot-heartbeat`, `flowpilot-lifecycle`), DB values
  (`flowpilot_to_openclaw`), cron jobnames, and `agent_type` strings are
  deployed per-instance across the fleet — renaming them is a multi-instance
  lockstep with zero user value. Fix the STORY (docs/UI copy), not the wire.

## FlowPilot Development Laws

These are inviolable architectural laws for FlowPilot agent development:

### Law 1: No Hardcoded Intent Detection

**NEVER add regex patterns, keyword lists, or if-statements to route specific user intents to specific skills.** FlowPilot MUST select skills through its general reasoning engine (ReAct loop + scoring algorithm) based on skill metadata alone.

- ❌ `if (/migrate|import/.test(msg)) forcePick('migrate_url')`
- ✅ Improve skill `description` with clear `Use when:` / `NOT for:` markers so the scoring algorithm naturally ranks it

**Why:** Hardcoded routing creates an unmaintainable web of special cases that prevents true autonomy. Every new capability would require a new if-statement instead of just registering a skill.

### Law 2: Skills Are Self-Describing

Every skill MUST contain sufficient metadata (`description`, `Use when:`, `NOT for:`) for the general scoring algorithm to select it correctly. If a skill isn't being picked up, the fix is ALWAYS better metadata — never a routing hack.

Use `bun run scripts/skill-linter.ts` to validate skill metadata quality.

### Law 3: Blocks Are Interfaces, Not Pipelines

Blocks capture intent and render responses. They NEVER build their own AI pipelines. All intelligence flows through FlowPilot's reasoning engine. See "Core Architecture Principle" above.

**Refinement — Utility vs Skill:** Pure text transforms (improve / translate / summarize / expand / continue) on a text selection are **utilities**, not pipelines. They call `chat-completion` directly via `useAITextGeneration` and require no platform context. Use the shared `<AITiptapToolbar>` component in every Tiptap editor for consistency. Anything that needs business context (KB, identity, past records, policy) is a **skill** — register it in `agent_skills` and execute via FlowPilot or `agent-execute`.

### Guard design: discover, don't enumerate

A guard that checks an ALLOWLIST of known files protects only what someone
already thought of — the week of 2026-08-25 produced a dozen "one more English
string" fixes past guards that were all green, because each guard enumerated
the surfaces it knew (four files for `operatorText`, two regex shapes for
hardcoded text). Prefer guards that SCAN everything and ratchet a count
(`no-new-hardcoded-visitor-text`: the number may only shrink), and when a new
bug class appears, teach the scanner the SHAPE (e.g. `field || 'English'`) rather
than adding the file that bit you. One fact, one reader: two settings that both
answer "what language is this site" (`site_languages` vs `platform_locale`) is
how a whole instance inverted (#430) — read the declared one, everywhere.

### Law 4: Fail Forward, Don't Gate

Prefer runtime fallbacks over static validation gates. If API keys exist, the feature works — don't require manual `enabled` flags on top of working credentials.

## Agent coordination (Claude Code ↔ OpenClaw)

> The old Agent Bridge on `clawstack.froste.eu` is **decommissioned** — do not use it.
> The Lovable-managed dev instance (dev.flowwink.com, `rzhjotxffjfsdlhrdkpj`) was
> **retired 2026-09-06**: its GitHub sync is disconnected and nothing in CI points at
> it. Do not use the Lovable MCP for this repo.

**The source carries no test target.** Every live check (live-DB suites, the daily MCP
regression) reads its instance from GitHub variables/secrets —
`LIVE_TEST_SUPABASE_URL`, `LIVE_TEST_SUPABASE_SERVICE_ROLE_KEY`, `MCP_REGRESSION_URL`,
`MCP_API_KEY` — and skips, saying so, when they are unset. Never add
an instance default to a script, test or workflow: the repo is forked, and a default makes
every fork test (or deploy) against upstream's database. Upstream points these at
sandbox.flowwink.com (full admin for testers, rebuilt nightly 04:00 UTC via `reset_sandbox`,
`api_keys` survive the rebuild). Development is branch → PR → CI → merge → `sync-forks.sh`;
there is no shared dev backend to keep in step any more. **PR CI is offline** —
type check, correctness lint, the ESLint ratchet (findings may only shrink — `npm run
lint:ratchet`, baseline in src/lib/__tests__/fixtures/eslint-baseline.json), 3900
unit/guardrail tests, skill linter, artifact freshness, build; a single business process
does not earn a live step on every PR. The Docker image builds on release tags only.
**Fork syncs run once a day, at night** (`nightly-fork-sync.yml`, cron 20:53 UTC, which
GitHub's queue lands around 01:30 UTC; one fork early = Actions → Nightly fork sync →
Run workflow with `fork` and `force`, as optic got MFA on 2026-10-29): a sync is
a production deploy, and deploying six times in an evening while an operator works
is how "sometimes I get errors in the project view" happens (optic, 2026-09-04).
Fleet-only workflows (docker image, release, main-red alert, MCP regression) carry
`if: github.repository == 'magnusfroste/flowwink'` so forks stop running them.

**The process battery has ONE runner per PR.** `npm run qa:processes` runs every business
process end to end against a local stack — a laptop (OrbStack) or a Claude cloud container
(docs/operators/local-development.md, "The same stack in a Claude cloud container") — and a
full green run stamps `scripts/process-battery/last-green.json`; the pulse guard turns every
PR red when that stamp is older than a week or covers fewer processes than
`docs/processes/` has. It refuses any non-local target, so PR CI never runs it — the
**nightly fresh-install job** (`fresh-install-nightly.yml`, 02:37 UTC, fleet-only) does:
a stack from zero on a GitHub runner, `npm run qa:prep`, the battery, `local:smoke`, the MCP
regression and the view sweep, and a green battery commits the stamp to main. So the stamp
is the night's, not a person's. When a PR needs a run before the night (a new process doc,
a migration's first live execution), the handoff issue names WHO runs and stamps it — local
or cloud, never both: on 2026-09-30 both ran on #597 and pushed stamps at each other until
force-with-lease refused. Prefer the cloud container: it is a fresh install every time, and
a long-lived laptop database carries battery residue that fails migration proofs and capped
listings. A red check is the finding, not the stamp — fix the product, do not shrink the run.

**OpenClaw** — the external MCP operator runs at `https://openclaw.liteit.se`
(health: `GET /health` → `{"ok":true,"status":"live"}`). It operates FlowWink instances through the
outward MCP gateway (`mcp-server`, `?mode=dispatch`).
