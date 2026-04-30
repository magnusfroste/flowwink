---
title: "Docs Module"
module_id: "docs"
version: "1.0.0"
category: "content"
autonomy: "agent-capable"
---

# Docs

> Public documentation portal — auto-syncs the GitHub `docs/` folder so evaluators can browse modules, processes, and architecture without leaving the site.

## What it does

- Pulls every `.md` file recursively from `magnusfroste/flowwink/docs/` into `public.docs_pages` (public RLS read).
- Auto-derives **category** from the first subfolder (e.g. `docs/modules/foo.md` → `/docs/modules/foo`).
- Renders at three public routes:
  - `/docs` — landing with highlights and sidebar
  - `/docs/:category` — category index
  - `/docs/:category/:slug` — article view with markdown render + "Edit on GitHub"
- Embeds an **Ask the docs** AI chat (scoped CAG over docs_pages) on every public docs page.
- Admin sync trigger lives at `/admin/docs`.

## Edge functions

- `docs-sync` (no JWT) — recursive GitHub walk + upsert + prune
- `docs-chat` (no JWT) — streaming SSE, ranks docs by token overlap, calls Lovable AI gateway

## Skill

`docs_search` — `module:docs` handler so FlowPilot can also surface docs answers internally.

## Target audience

Evaluators arriving cold. They need to answer "what is this?", "what modules exist?", "how does process X work?", "can I test it?" — without needing to clone the repo or DM us.
