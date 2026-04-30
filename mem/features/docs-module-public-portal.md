---
name: Docs Module Public Portal
description: Public /docs portal auto-syncs magnusfroste/flowwink/docs via docs-sync edge fn into docs_pages (public RLS read), with docs-chat SSE CAG over content
type: feature
---

Module `docs` (enabled by default). Public routes: `/docs`, `/docs/:category`, `/docs/:category/:slug`. Admin sync at `/admin/docs`.

- Source: `magnusfroste/flowwink/docs/**.md`, recursive walk in `docs-sync` edge fn.
- Category = first subfolder under `docs/` (modules, processes, architecture, concepts, pilot, guides, reference, ...).
- Table `public.docs_pages` has public anon SELECT; admin-only writes (sync uses service role).
- `docs-chat` edge fn (no JWT) ranks docs by token overlap, streams via Lovable AI Gateway, instructs model to cite `/docs/{category}/{slug}` links.
- `<DocsChat />` floating button on every public docs page.
- Skill `docs_search` (handler `module:docs`) registered for FlowPilot/MCP.
- Distinct from Handbook (admin-only reader for clawable repo).
