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
```

## Architecture

FlowWink is a self-hosted CMS + AI consultant platform built on React + Supabase. Each deployment is a single-tenant site for one customer.

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

### Edge Functions

All edge functions live in `supabase/functions/[name]/index.ts` and are Deno-based. Key functions:
- `chat-completion` — FlowPilot AI endpoint; supports OpenAI, Gemini, local, n8n providers
- `get-page` — serves pages with caching; called by PublicPage before DB fallback
- `setup-flowpilot` — seeds FlowPilot soul + objectives from templates
- `agent-execute`, `agent-operate`, `agent-reason` — agentic AI workflow functions

### Template System

Templates live in `src/data/templates/` as TypeScript, registered in `index.ts → ALL_TEMPLATES`.

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

## Database Migrations

All migrations MUST be idempotent (safe to run multiple times). Use `IF NOT EXISTS`, `CREATE OR REPLACE`, and `DROP ... IF EXISTS` patterns. See `docs/CONTRIBUTING.md` for detailed SQL patterns.

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
```

Public-facing edge functions must be deployed with `--no-verify-jwt`.
Admin-only functions can use default JWT verification.

## FlowPilot Development Laws

These are inviolable architectural laws for FlowPilot agent development:

### Law 1: No Hardcoded Intent Detection

**NEVER add regex patterns, keyword lists, or if-statements to route specific user intents to specific skills.** FlowPilot MUST select skills through its general reasoning engine (ReAct loop + scoring algorithm) based on skill metadata alone.

- ❌ `if (/migrate|import/.test(msg)) forcePick('migrate_url')`
- ✅ Improve skill `description` with clear `Use when:` / `NOT for:` markers so the scoring algorithm naturally ranks it

**Why:** Hardcoded routing creates an unmaintainable web of special cases that prevents true autonomy. Every new capability would require a new if-statement instead of just registering a skill.

### Law 2: Skills Are Self-Describing

Every skill MUST contain sufficient metadata (`description`, `Use when:`, `NOT for:`) for the general scoring algorithm to select it correctly. If a skill isn't being picked up, the fix is ALWAYS better metadata — never a routing hack.

### Law 3: Blocks Are Interfaces, Not Pipelines

Blocks capture intent and render responses. They NEVER build their own AI pipelines. All intelligence flows through FlowPilot's reasoning engine. See "Core Architecture Principle" above.

### Law 4: Fail Forward, Don't Gate

Prefer runtime fallbacks over static validation gates. If API keys exist, the feature works — don't require manual `enabled` flags on top of working credentials.
