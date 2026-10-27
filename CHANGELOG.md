# Changelog

All notable changes to FlowWink will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Release process: [docs/operators/release-process.md](docs/operators/release-process.md).

## [Unreleased]

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
