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

FlowWink has 62+ business modules in `src/lib/modules/`. Each module is a TypeScript file defining:
- Module metadata (id, name, category, dependencies)
- Feature set and capabilities
- Skill registrations pointing to `agent_skills` rows

**Module categories include:** accounting, analytics, approvals, blog, booking, browser-control, calendar, chat, companies, contracts, crm, customer360, deals, docs, documents, email, expenses, federation, field-service, fixed-assets, flowpilot, forms, global-blocks, growth, handbook, hr, inventory, invoicing, kb, live-support, manufacturing, media, multi-currency, newsletter, pages, payroll, pos, pricelists, products, projects, purchasing, quotes, reconciliation, recruitment, resume, returns, river, sales-intelligence, shipping, site-migration, sla, subscriptions, surveys, templates, tickets, timesheets, webinars, wiki, workspace-chat.

To scaffold a new module: `bun run scripts/new-module.ts`

**Module API contracts** (`src/types/module-contracts.ts`): formal Zod schemas for all cross-module communication. All cross-module data exchange MUST use these contracts.

### Edge Functions

All edge functions live in `supabase/functions/[name]/index.ts` and are Deno-based.

**Core API:**
- `chat-completion` — FlowPilot AI endpoint; supports OpenAI, Gemini, local, n8n providers
- `get-page` — serves pages with caching; called by PublicPage before DB fallback
- `content-api` — programmatic content access

**Agent / FlowPilot:**
- `agent-execute`, `agent-operate`, `agent-reason` — agentic AI workflow functions
- `flowpilot-heartbeat`, `flowpilot-briefing`, `flowpilot-distill`, `flowpilot-learn` — autonomous operator lifecycle
- `mcp-server` — outward-facing MCP gateway for external agents/federation peers

**Automations:**
- `automation-dispatcher`, `event-dispatcher`, `signal-dispatcher`, `signal-ingest` — workflow automation pipeline

**Commerce / Finance:**
- `create-checkout`, `create-invoice-payment`, `send-order-confirmation`, `subscribe` — e-commerce
- `generate-invoice-pdf`, `reconciliation`, `dunning-processor`, `fetch-fx-rates` — finance

**AI Enrichment:**
- `prospect-research`, `contact-finder`, `enrich-company`, `parse-resume`, `extract-pdf-text`, `extract-receipt` — data enrichment
- `web-search`, `web-scrape`, `browser-fetch`, `firecrawl-account` — web intelligence

**Integrations:**
- `stripe-webhook`, `gmail-inbox-scan`, `gmail-oauth-callback`, `composio-proxy`, `hunter-account` — third-party

**Communication:**
- `email-send`, `newsletter-send`, `send-contact-email`, `send-booking-confirmation`, `send-invoice-email` — outbound comms

**System / Admin:**
- `setup-database`, `system-integrity-check`, `test-ai-connection`, `instance-health` — operations
- `run-autonomy-tests`, `run-platform-tests` — autonomous testing

**Shared utilities** live in `supabase/functions/_shared/`:
- `pilot/` — FlowPilot ReAct engine (reason.ts, prompt-compiler.ts, built-in-tools.ts, handlers.ts)
- `skills/intent-scorer.ts` — Skill Relevance Engine (shared between FlowPilot and MCP gateway)
- `mcp/` — MCP schema definitions and connection group config
- `ai-call.ts`, `ai-config.ts`, `ai-providers.ts` — AI provider abstraction
- `token-tracking.ts`, `trace.ts`, `agent-audit.ts` — observability

### MCP Server (external agent access)

`mcp-server` exposes FlowWink skills to external agents. It runs on Supabase Edge Functions, so the transport is **Streamable HTTP** (not stdio — there is no long-lived local process). This is a consequence of serverless deployment, not Deno.

The system has 200+ skills. Exposing all of them as individual MCP tools floods a client's context. Three connection profiles control what a client sees (all via query params; default = unfiltered, kept for backward compat):

- `?groups=crm,commerce` — specialist: only that category's tools (~8). See `_shared/mcp/groups.ts` and `/rest/groups`.
- `?mode=dispatch` — generalist operator: a **2-tool surface** — `search_skills({query, groups?})` ranks skills by intent, `execute_skill({name, arguments})` runs one. Broad reach, ~2 schemas in context.
- (no param) — all tools exposed.

**Skill relevance is a platform primitive, not a FlowPilot-internal one.** The component is the **Skill Relevance Engine** (`scoreSkillsByIntent` / `loadRecentUsageCounts` in `_shared/skills/intent-scorer.ts`). Name it for what it does (ranks skills by intent), NOT for a transport — it is neither "MCP" nor "FlowPilot" specific. It has **two consumers**:

1. **FlowPilot** (`reason.ts`) — internal, every ReAct turn: narrows 200+ skills → ~25 relevant ones. No MCP involved here; this is a direct in-process call over the DB-loaded skill set. The scorer receives `config.scoringIntent` (e.g. active objectives) concatenated with the last user message — so autonomous loops surface objective-relevant skills, not just meta-tools.
2. **The outward MCP gateway** (`search_skills` in `?mode=dispatch`) — external operators, the same ranking exposed as a tool.

It lives in `_shared/skills/` (NOT under `pilot/`) precisely because the gateway must work for external agents even when the FlowPilot module is disabled. When promoting capability-discovery logic, keep it here. FlowPilot's actual intelligence (soul, objectives, ReAct decisions) stays in FlowPilot; only the "which skill is relevant" lookup is shared. Avoid naming it "Router"/"Selector" — selection is by scoring on metadata, not hardcoded dispatch (Law 1).

**FlowPilot does NOT call its own MCP gateway internally** — it shares the Engine and hits the DB / `executeSkill` directly. Deliberate, not an omission: MCP would add an HTTP hop, auth, and JSON-RPC serialization for zero gain when you're already inside the same Deno process with service-role DB access. MCP is a transport for *crossing a trust/process boundary*; FlowPilot is already on the inside of it.

### REST compatibility layer (`/rest/*`)

The `/rest/execute` endpoint mirrors the MCP tool surface but over plain HTTP POST. It respects `?mode=dispatch` and `?groups=` query params just like the native MCP transport:

- `POST /rest/execute` — call any skill by name: `{ "tool": "browse_blog", "arguments": {} }`
- `POST /rest/execute?mode=dispatch` — exposes `search_skills` and `execute_skill` as tools:
  - `{ "tool": "search_skills", "arguments": { "query": "create knowledge base article" } }`
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
    public/blocks/    # 65 public-facing block renderers
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
    modules/          # 62 module definitions
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
  functions/          # 100+ Deno edge functions
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

```bash
# Push migrations to a Supabase project
supabase db push --project-ref <ref>
```

## Deployment

Frontend (Vercel/Easypanel) auto-deploys from GitHub push.

Manual steps per Supabase project after migrations or new edge functions:
```bash
supabase db push --project-ref <ref>
supabase functions deploy <function-name> --no-verify-jwt --project-ref <ref>
# Sync skill metadata from code → agent_skills (prevents drift; see below)
DATABASE_URL='postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres' npm run sync:skills -- --apply
```

Public-facing edge functions must be deployed with `--no-verify-jwt`.
Admin-only functions can use default JWT verification.

**A "site" is four layers** (schema via migrations, **skills via bootstrap**,
edge functions via deploy, frontend via Vercel) and they drift if not synced
together. `agent_skills` rows come from `skillSeeds` in `src/lib/modules/*` via
bootstrap — **not** migrations — so running migrations never refreshes skills.
Regenerate the artifact (`npm run skills:json`) and sync each instance
(`npm run sync:skills` dry-run, `-- --apply` to write). Full runbook, the live
fleet's refs, and fork vs. auto-deploy topology:
**[docs/operators/provisioning-and-updates.md](docs/operators/provisioning-and-updates.md)**.
NB: forks (e.g. autoversio.ai) do NOT auto-deploy from a `main` push — notify the owner.

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

### Law 4: Fail Forward, Don't Gate

Prefer runtime fallbacks over static validation gates. If API keys exist, the feature works — don't require manual `enabled` flags on top of working credentials.

## Agent Bridge (Claude Code ↔ Lovable dev channel)

A shared message bus between Claude Code CLI and Lovable for agent-to-agent coordination during development.

**Endpoint:** `https://clawstack.froste.eu/api/bridge`
**Token:** `bridge-dev-token`

```bash
# Post a message
curl -s -X POST https://clawstack.froste.eu/api/bridge \
  -H "Authorization: Bearer bridge-dev-token" \
  -H "Content-Type: application/json" \
  -d '{"sender":"lovable","message":"din text","thread":"main"}'

# Read messages
curl -s "https://clawstack.froste.eu/api/bridge?thread=main&since_id=0" \
  -H "Authorization: Bearer bridge-dev-token"
```

Use `since_id` to only fetch new messages since last read. Thread `main` is the default dev channel.
