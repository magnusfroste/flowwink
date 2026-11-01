# Changelog

All notable changes to FlowWink will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Release process: [docs/operators/release-process.md](docs/operators/release-process.md).

## [Unreleased]

## [4.0.0] - 2026-10-28

The "operated in production" release. v3.0.0 made the platform agent-operable;
since then nine instances have run it for real (Nordbrygg, optic, www, the forks),
with Hermes, OpenClaw and Claude as operators, and almost everything below was
found by an operator or a process battery, not by a plan. Three architecture arcs
land here — the partner spine, the language overlay model and the agent
envelope — and one transport is removed, which is why this is a major.

**Upgrading:** a fork or a self-hosted instance takes the four layers in the usual
order (schema → edge functions → skills → frontend). Migrations are idempotent
and forward-dated. Federation peers that used the A2A transport must move to the
MCP gateway (`mcp-server`, `?mode=dispatch`); nothing else is breaking.

### Added

**Partners — the customer spine (Odoo's res.partner, not our own form)**
- One `partners` register behind leads, companies, customers, vendors and our
  own company: a lead gets a party, the document chain (quote → order → invoice)
  carries one, the ledger books on the commercial party, bank accounts belong to
  the legal person, "invoice A, deliver to B".
- Commercial terms are inherited from the company; the party's language is not.
  Jurisdiction on the party, rules in the locale package. A party is archived,
  never deleted.
- Customer 360 and the partner directory read the same register.

**Language — the overlay model (pages, blog, products, UI text, mail)**
- A page, a post or a product is written ONCE in its source language; every
  other language is a published overlay in `content_translations`, filled by
  `translate_page` / `translate_content`, kept per translation unit so an edit
  only re-translates what changed. `convert_translation_groups` migrates the old
  sibling-row model with a dry run.
- Products and categories in every language, variant labels (attribute names
  and values) as site-wide overlays, category slugs per language, block links
  that follow the page's language.
- `/<lang>/` addresses, hreflang, paired sitemap entries, a language switcher
  that shows only when needed, the visitor's language carried into customer
  mail, chat answers and the footer. A site declares its languages and can
  change its default; adding a language copies the site.
- The visitor-text catalogue (`ui_text`) with an editor, and a scanner that
  ratchets hard-coded English down — the number may only shrink.
- Company locale: where the company is (three list choices, one truth), the
  company's clock, calendar, currency and amount decimals written the same way
  in the database, the agent, checkout and every admin page.

**The agent envelope and the operations reads**
- Every skill answer carries `{ error, code, retryable, hint }` on failure, a
  refusal that is not a failure (`status: refused`), and `risk` / `reversible`
  / `reversal` declared on writes; the MCP gateway exposes them as annotations.
- `check_books` (what needs attention in the books, each finding with its fix),
  `check_operations` (sales, receivables, contracts, support, field service,
  automations, chat), `statutory_deadlines` and the register of filed
  declarations, `month_close_checklist`, `agent_context` on every finance
  answer, `manage_automations list` with a `state` judged against each job's own
  schedule.
- A read-only API key, `set_skill_trust`, `invite_colleague` (trust `approve`),
  `list_objectives` / `manage_objective` (closed on evidence only), `search_skills`
  / `read_skill` / `execute_skill` dispatch mode on both MCP and REST.
- My agents: connect your own agent with one key, one owner; it acts as its
  owner. Claude connects through Connectors with `X-API-Key`.

**Accounting**
- Broken fiscal years, the seven-year archive (document hash, retention lock),
  voucher approval, cash forecast, consolidation, the rule loop for bank events
  (a rule is proposed after the decision), sales and purchases booked in the
  company's currency, orders and POS day-ends reaching the ledger.
- UBL 2.1 / Peppol BIS 3.0 e-invoices: export, validate, dispatch — never
  pretends sent.

**FlowBox — one queue**
- Mail, chat, tickets, forms, callbacks and voicemail in one inbox; FlowPilot
  drafts first and the draft waits in the queue; Routing as its own page; the
  mailbox as a mail client with an AI responder behind the trust dial. Live
  Support is retired into it.

**WebMeet and presence**
- Video calls that get through the firewall, a waiting room, screen share, "here
  now" presence with one tap to video, calls started from River and FlowWork.

**Modules and surfaces**
- Meeting polls (invite on several times, a rule takes the first that works),
  newsletter mailing lists and segments with bounces reaching the ledger,
  purchasing blanket agreements and call-offs, per-staff booking calendars and
  video-meeting links, HR performance reviews and the salary revision round,
  expense advances and receipt currency, project task cards with brief,
  checklist, dependencies across projects and one thread for people and agents,
  wiki grouped by tag, Odoo import (`import_from_odoo`, CRM over the API,
  re-runnable) with an Odoo lens on the CRM.
- The feedback module, on by default: boards bug / feature / template /
  question, votes, comments; an instance sends feedback and a daily usage ping
  (instance id, site URL, skills sha, schema head, enabled modules — nothing
  else) to its endpoint, `www.flowwink.com` unless repointed; the receiving
  instance has the public board at `/feedback` and the fleet under
  Admin → Feedback. One switch turns the ping off (`FEEDBACK_SHARE_USAGE=false`
  or Admin → Feedback); `docs/operators/telemetry.md` says what is sent.
- Design dials an agent can see: surface, theme, heading colour per surface,
  the inverse band, the pixel gradient, image treatments, a section divider, a
  3D model block, the footer's surface, the automatic band alternation — all
  branding settings, no stylesheet in `custom_scripts`. One HTML document for
  every reader (`api/html.ts` fills the head per page view, no User-Agent list).
- Site export carries the knowledge too (wiki, documents, media); templates
  install consultants, souls and objectives; FlowPilot has a soul wherever it is
  on.
- Admin: search and filters on contacts, automations and the icon picker;
  twelve pinned pages in the header; the collapsed rail; footer link columns
  that say where they come from; Pages is the editor's, Branding the admin's.

### Changed
- **Process battery and nightly fresh install.** Every business process in
  `docs/processes/` runs end to end against a stack built from zero every night
  (migrations, template, battery, smoke, MCP regression, view sweep); a green run
  stamps the pulse and a stale stamp turns every PR red. Parity scorecards are
  re-scored against it.
- **Generated artifacts are the bot's.** Skill, automation and locale bundles,
  the instance manifest and the skill→module map are rebuilt by CI and
  committed on main after every merge; a PR that carries them fails.
- The skills layer follows the edge deploy: `sync_skills_from_code` runs on
  every admin page load against the bundled artifact.
- Migrations are forward-dated by a command (`npm run migrations:redate`);
  edge functions type-check in CI; the edge-function count is budgeted at 90.
- Guards discover instead of enumerate: hard-coded visitor text, hard-coded
  shapes, hand-rolled role policies, swallowed reads, unconditional public
  inserts, ghost block fields, stale block schemas — each a scanner with a
  ratchet.
- ESLint runs as a ratchet (findings may only shrink); fork syncs run once a
  night; the Docker image builds on release tags only.

### Fixed
- Money follows the order: returns capped, POS discount and drawer, VAT on
  credit notes, one reservation per order, pick before ship, stock movements
  carrying their reference, manufacturing seeing the inventory, depreciation
  counting months, reports reading the whole ledger (the 1 000-row cap cut
  every report).
- Bookings: rules on the table (opening hours, blocks, past dates, overlap
  under lock, state machine, time zone), confirmation born on, reminder born at
  all, one reader for free slots.
- Contracts: the signed document is final and the signature creates the
  service; appendices render; an agreement is sent only when finished.
- CRM: prospect is not lead, triage outside the owner lens, the editable
  ledger, research on the company, prospects pruned after 24 months, leads say
  their company, a deal starts at its first stage.
- Chat: no more 150 s death on its own receipt, a throwing tool does not end
  the answer, sources under the answer, tables as tables, markdown links as
  links, the answer in the visitor's language on every channel.
- Pages and blocks: dozens of block fixes (panel radius and status tokens
  everywhere, hero on iPhone, true parallax, typewriter descenders, gallery
  lightbox, article grid, CTA, forms, contact), stale chunk after deploy
  reloads instead of 404, the overlay header announces its height, the cookie
  banner off the mobile menu.
- Install: a fresh instance is born with its currency, its language declared,
  the first page as start page, role defaults seeded, FlowPilot on and silent
  until it has objectives; the heartbeat skips without an AI provider instead
  of failing; the cadence quota holds at the call site.
- The agent surface: skills that could never run (wrong parameter names,
  missing branches, a comma that emptied a module's skill list), the staged
  approval envelope naming the order that works, PGRST202 self-correction on
  the generic CRUD path, `manage_page` honouring menu fields, `manage_product`
  answering delete, task ids that self-correct.
- Operator rounds on optic and Nordbrygg: FlowWork answers carry their
  receipt, slugs keep å/ä/ö, the renewal cron's lost clock, a paused run that
  rang for a month, invoice due dates from the terms, currencies upper-cased
  and defaulting to the business currency.

### Security
- 30 unguarded staff RPCs closed to anonymous callers; anonymous reads of
  equipment, maintenance, budgets and delegations closed; the role request
  comes from `app_metadata` and "authenticated" is not staff; the admin guard
  fails closed; orders are not born anonymously.
- The CMS's raw-HTML and href surfaces closed: sandboxed embeds, one href
  rule, a serializer that never interpolates stored HTML.
- Inbound provider webhooks carry a secret; 46elks credentials travel only to
  46elks; `send-webhook` is the platform's to call; a public edge function that
  carries the service key verifies its caller (guard with ratchet).
- Browser-hardening headers on Vercel, the chat lead oracle closed,
  DOMPurify / Tiptap / PostCSS patched, a weekly dependency security scan;
  agent API keys never at rest in clear text; invitation links survive email
  scanners (our page, a hashed token).
- The quote signature hashed an empty line list and called it proof — fixed.
- Customer-scoped RLS mirrored to `authenticated` where the visitor could see
  more than the signed-in customer.

### Removed
- **The A2A federation transport.** MCP stays and is the one way in for an
  external agent. Peers on A2A must reconnect through `mcp-server`.
- Portal (customer self-service) skills leave the MCP surface — they are
  reached through the customer portal's own identity, never a gateway key.
- Live Support as a separate module (folded into FlowBox); the `contact.showForm`
  and `chat.showSidebar` block fields nothing ever read; the Lovable-managed dev
  instance and the old Agent Bridge.

## [3.0.0] - 2026-07-19

The "agent-operated business" release. Since 1.3.0 the platform has completed the
turn from AI-assisted CMS to a Business Operating System run by agents — internal
(FlowPilot) and external (any MCP operator) — with the safety architecture to match:
identity-scoped customer self-service, evidence-bound autonomy, and a hardened fleet.
(Version note: this release supersedes both the stale `v2.0.0` git tag from the
early CMS era and the 1.x changelog line — the two numbering tracks merge here.)

### Added

**Identity ladder — customers talk to the business, safely**
- Customer portal assistant (`/account/assistant`): signed-in customers get an
  AI assistant scoped to their OWN account (rung 2) — orders, invoices, returns —
  with identity server-injected from the verified JWT, never from a body claim.
- Customer-scoped self-service returns: `request_return` resolves the order only
  among the caller's own orders; ownership enforced by construction.
- **B2B company scope (rung 3)**: `company_contacts` membership table, server-injected
  company identity, and eight company-scoped skills — reads (orders, invoices),
  writes (`request_company_return`, `reorder_company_order`, `request_company_quote`),
  commitment (`approve_company_quote`) and admin (`manage_company_contacts` with
  invite-on-signup) — role-gated viewer < buyer < approver < admin, enforced in the
  handler. Cross-company isolation proven adversarially: a contact of company A can
  never see or act on company B's data. Staff "Company Contacts" admin surface included.
- Pay-your-own-invoice via the payment rail: the assistant resolves the company's
  invoice and hands out the secure payment page — it never moves money.
- Company context dial: the assistant sees the active company's open items alongside
  the personal account, with explicit disambiguation between the two.

**FlowPilot 2.0 — the Hermes arc**
- Follow-through: staged and multi-step operations are resumed, not forgotten
  (`flowpilot-followthrough` sweep).
- Pipeline-collapse composites for chained flows, with dial inheritance — a composite
  never bypasses a stricter inner-skill gate.
- Skill Curator learning loop: evidence-driven proposals that improve skill
  instructions over time.
- Cost dials: heartbeat cadence and reasoning tier are per-instance configuration.
- **Evidence-bound objectives**: progress notes are stamped with machine-derived
  evidence (real skill outcomes from the activity log), and an objective can only be
  completed when its plan's work is actually evidenced — the agent's say-so is not proof.

**Agentic accounting (BR1)**
- Bank ingest → `propose_bookkeeping` → human review queue ("Händelser att bokföra"):
  the agent proposes, staged postings await approval, money never moves on its own.
- Opening balances (IB) management and Swedish VAT return preparation
  (SKV 4700 box mapping) via `prepare_vat_return`.

**Platform & operations**
- Outward MCP gateway connection profiles: `?groups=` specialist surfaces and
  `?mode=dispatch` (2-tool `search_skills`/`execute_skill`) for external operators,
  plus the `/rest/*` compatibility layer with distributed locking.
- Skill Relevance Engine as a platform primitive (shared by FlowPilot and the
  gateway), with IDF-weighted name matching.
- Self-hosted distribution: prebuilt multi-arch frontend image on ghcr
  (`flowwink-frontend`), Easypanel-ready. **Releases now publish pinnable
  `:vX.Y.Z` and `:stable` image tags; `:dev` remains bleeding edge.**
- Edge-function tier model (core vs optional) with core-verify, and the align-down
  rule: the skill surface always mirrors what is actually deployed per instance.
- Observability: `cron_health_report` makes silent scheduled-job failures loud;
  pg_net response codes as the source of truth for cron health.

### Fixed
- Automation cron parser: monthly expressions (`0 5 1 * *`) no longer silently fall
  back to hourly runs; weekday ranges (`1-5`) no longer run Mondays-only; the
  unsupported-expression fallback now logs.
- `newsletter-dispatch-scheduled` self-references its own instance (was hardcoded
  to the dev project fleet-wide); `publish-scheduled-pages` calls the DB function
  directly instead of a nonexistent edge function.
- Automation executor semantics (`flowpilot` executor requires the module on) and
  the `isModuleEnabled` site-settings gate.
- `prepare_vat_return` declares its period as required (`anyOf` in the tool schema)
  so agents pass it correctly.
- Visitor-intent lead trigger self-heals to its own instance.

### Security
- Fleet hardening sweep: RLS on all tables, `SECURITY DEFINER` functions pinned
  with `search_path`, the `agent_automations` permissive-UPDATE control-plane hole
  closed, service-role guards for agent-callable admin functions.
- Trust architecture: staged operations (`approve_pending_operation` handshake),
  per-skill trust levels that survive resyncs, and role/scope gates enforced
  server-side — never by the model.

## [1.3.0] - 2026-05-28

### Added
- **Demo Data Platform**: Safe module reset & simulation data seeding (`seed_module_demo`, `reset_module_data`) with `demo_runs`/`demo_run_items` tracking
- **Order Tracking**: Public `/track/:id` page + admin fulfillment view with full event audit log
- **Platform Tests**: Unified `/admin/platform-tests` replacing smoke tests with module-aware suites, CI guardrails, and instance health dashboard
- **User Role Guardrails**: Automated test suite preventing role assignment regressions in `handle_new_user` trigger and edge functions
- **Demo Mode**: Toggle in `/admin/settings/general` controlling hourly `demo-cycle` reset job; demo login banner on auth page
- **Workspace Chat**: Internal RAG-powered chat over documents/contracts/knowledge base with citations
- **Expense Procure-to-Pay Loop**: Full lifecycle (draft→submitted→approved→booked→paid) with BAS 2024 defaults
- **OCR Bank Statement Import**: Vision-based preview→commit flow via `reconciliation-import-image` edge function
- **POS v2**: Barcode support, split tender payments, session-based batch journal on close
- **Stock Event Listener**: Automatic inventory movement on POS sales via `stock.movement` platform events
- **Invoice-driven Subscriptions**: Manual subscription billing with daily cron invoice generation
- **Staged Operations Envelope**: Human-in-the-loop approval for sensitive skills (journal entries, expense booking, period close)
- **Voucher Integrity**: Auto-assigned voucher numbers with gap detection and explanation tools
- **Year-End Readiness**: 6-point checklist RPC for accounting period closure
- **Contract Templates**: 4 seeded templates + `create_contract_from_template` with anti-hallucination guards
- **Unified Sales Lead Loop**: Firecrawl-enriched lead scoring with normalized status aliases
- **Agent Document Upload**: MCP-exposed skill for peers to upload text/PDF to the document vault
- **Document Shadow Markdown**: Extracted text shadow for full-text search in workspace chat
- **Marketing Claw Department Pattern**: Composite MCP groups for external marketing agent operation
- **Federation Directional Connections**: Multi-channel peer architecture (MCP, A2A, /v1/responses)
- **HR Auto-Contract Loop**: `hire_application` RPC — application→employee + draft contract + onboarding checklist in one transaction
- **Timesheet Period Lock**: Accounting period close also locks time entries
- **HR Vacation Auto-Allocation**: Yearly vacation day allocation with audit logging
- **Unsplash Config Hint**: Admin alert when image API key is missing during block editing
- **Integration Status Truth**: `resolveIntegrationStatus` single source of truth; backend verification errors surfaced in UI

### Changed
- **Removed Clawable module**: Simplified architecture — single FlowWink instance, no multi-agent chat surface
- **Federation cleanup**: Reduced operator missions to 5 core categories aligned with external-agent-as-operator pivot
- **Smoke tests**: Skip disabled modules instead of false failures
- **Database migrations**: Consolidated baseline for cleaner fresh installs
- **Trust levels**: Outbound communication skills now require `approve` instead of `auto`

### Fixed
- **check-secrets edge function**: 403 errors for multi-role users resolved by explicit `admin` role filtering
- **handle_new_user trigger**: No longer assigns redundant `writer` role when `signup_type: "admin"` is specified
- **Demo template**: Fixed demo email credential display (`demo@flowwink.com`)
- **Fresh install UX**: Default modules disabled by default (opt-in); fewer confusing empty states
- **Edge function timeouts**: Fire-and-forget pattern for long-running operations bypassing 60s limits
- **CI**: `skill-linter` exits gracefully without DB URL on GitHub Actions

## [1.2.0] - 2026-02-20

### Added
- **Live Agent Chat Avatars**: Agent profile photos now display in chat widget for personalized support experience
- **Sentiment Detection**: Real-time AI-powered sentiment analysis during conversations
  - Automatic frustration detection (caps, repeated questions, negative words)
  - Configurable threshold (1-10 scale) for human handoff triggers
  - Visual sentiment indicator on Live Support page (green/yellow/red)
- **Human Handoff Improvements**: Enhanced escalation with explicit "speak to human" detection
- **Live Support Dashboard Widget**: New admin dashboard widget showing:
  - Active and waiting conversations
  - Online agent count
  - Average sentiment metrics
  - Quick access to support queue

### Changed
- Support agents table now has public read access for chat widget avatar display
- Improved agent presence detection in chat conversations

### Fixed
- Agent avatars now correctly display for anonymous chat visitors (RLS policy update)
- Profile avatar URL properly fetched from profiles_public view

## [1.1.0] - 2026-01-16

### Added
- **Self-Hosting Setup Script**: Complete CLI-driven setup (`./scripts/setup-supabase.sh`)
  - Automatic Supabase login with interactive prompts
  - Project selection with numbered list
  - Deploy all 33 edge functions automatically
  - Run database migrations
  - Create admin user with proper role assignment
  - Output environment variables for deployment
  - `--fresh` flag for agencies setting up multiple sites
  - `--env` flag to only display environment variables
- **Secrets Configuration Script**: Interactive secrets setup (`./scripts/configure-secrets.sh`)
  - Resend (email)
  - Stripe (payments)
  - OpenAI (AI features)
  - Google Gemini (AI alternative)
  - Firecrawl (web scraping)
  - Unsplash (stock photos)
  - Local LLM (self-hosted AI)
  - N8N (workflow automation)

### Changed
- Auth page branding updated to FlowWink
- Setup documentation rewritten for CLI-first workflow
- Improved error handling in setup scripts

### Fixed
- Environment variables now fetched via `supabase projects api-keys`
- Admin user creation uses Supabase Admin API directly
- Project selection handles deleted projects gracefully

## [1.0.0] - 2026-01-09

### Added

#### Core CMS
- Block-based page builder with 20+ block types
- Visual drag-and-drop block reordering
- Block animation controls and spacing settings
- Page versioning with restore functionality
- SEO meta settings per page
- Scheduled publishing
- Global header and footer blocks
- Menu ordering system

#### Blog Module
- Full blog engine with posts, categories, and tags
- Featured posts support
- Author profiles with avatars
- Reading time calculation
- RSS feed generation
- SEO-optimized blog pages

#### Newsletter Module
- Subscriber management with GDPR compliance
- Email campaigns with tracking (opens, clicks)
- Double opt-in support
- Export functionality
- Unsubscribe handling

#### CRM Modules
- **Leads**: Lead capture, scoring, AI qualification, status tracking
- **Deals**: Kanban board, pipeline stages, activity tracking
- **Companies**: Company profiles, domain enrichment, lead association
- **Products**: Product catalog with pricing (one-time and recurring)
- CSV import/export for leads and companies

#### Knowledge Base
- Hierarchical categories with icons
- FAQ-style articles
- AI Chat integration with context
- Helpful/not helpful voting
- Featured articles

#### Integrations
- Webhook system with event triggers
- N8N workflow templates
- Unsplash image picker
- AI text generation (expand, improve, translate, summarize)
- Brand guide analyzer

#### User Management
- Role-based access control (Writer, Approver, Admin)
- User profiles with avatars
- Activity logging

#### Public Website
- Responsive design with dark/light mode
- Cookie consent banner
- Contact forms with submissions
- Booking forms (Cal.com integration ready)
- Chat widget

### Security
- Row Level Security (RLS) on all tables
- Secure authentication flow
- GDPR-compliant data handling

---

## Upgrade Instructions

See [docs/UPGRADING.md](docs/UPGRADING.md) for detailed upgrade instructions.

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for contribution guidelines.
