---
title: "Pages Module"
module_id: "pages"
version: "1.0.0"
category: "content"
autonomy: "config-required"
generated: true
generated_at: "2026-11-09"
description: Create and publish website pages, header, footer and navigation
---

# Pages

> Create and publish website pages, header, footer and navigation

Ships with **19 agent skills**, **6 database tables**.

## Quick Facts

| Property | Value |
|----------|-------|
| **Module ID** | `pages` |
| **Version** | 1.0.0 |
| **Category** | content |
| **Autonomy** | config-required |
| **Core** | Yes |
| **Capabilities** | `content:receive`, `data:write`, `webhook:trigger` |
| **MCP-exposed skills** | 19 |
| **Owns tables** | 6 |

## Skills

These skills are seeded into `agent_skills` when the module is enabled and exposed via MCP.
External operators (FlowPilot, OpenClaw, Claude Desktop, custom MCP clients) can call them directly.

| Skill | Scope | Description |
|-------|-------|-------------|
| `generate_meta_description` | internal | Scan published pages for missing SEO meta descriptions and generate them via AI. Use when: improving site SEO; doing a content audit; filling gaps in meta_json. NOT for: writing page body content (… |
| `generate_alt_text` | internal | Scan published pages for images missing alt-text and generate accessible alt descriptions via AI. Use when: improving accessibility (WCAG); SEO maintenance; auditing image content. NOT for: writing… |
| `manage_page` | internal | Full page lifecycle management for WEBSITE/CMS pages — the pages visitors see on the public site. Use when: creating a website page (landing page, about, services, contact) with all its blocks in o… |
| `manage_page_blocks` | internal | Manipulate blocks on a page: list, add, update, remove, reorder, duplicate, toggle visibility. Use when: changing the text or fields of a block on an existing page (update: block_id + ONLY the fiel… |
| `site_branding_get` | internal | Read current site branding settings including logo, colors, fonts, and favicon. Use when: retrieving current brand settings; checking active color scheme; verifying logo URL. NOT for: updating bran… |
| `site_branding_update` | internal | Update site branding settings — logo (light and dark), favicon, primary color (light and dark), accent color, heading/body fonts. Only the fields passed change; the rest of the branding is kept. Us… |
| `create_page_block` | internal | Create a new content block on an existing page. Supports batch mode for adding multiple blocks at once. Use when: building a page after manage_page created it, adding sections during migration, use… |
| `build_site_step` | both | Run one step of the site-builder reasoning loop: takes conversation history + current module state, returns next assistant message and optionally a tool_call (create_block / migrate_url / update_fo… |
| `manage_redirect` | internal | Manage URL redirects (301/302) from old paths to new pages or external URLs. Use when: a page slug changed and old links must keep working, consolidating pages, migrating from another site, fixing … |
| `list_stale_translations` | internal | Find translated text that has fallen behind its source, per string: the Swedish heading was changed, the English overlay still carries the old one — or was never translated. Use when: checking whet… |
| `translate_site_into` | internal | Legacy name for enable_language: add a language to the site. Copies NOTHING any more — a language with no translations is an empty overlay, and translate_page fills it per page. Use when: an operat… |
| `enable_language` | internal | Add a language to the site (site_languages.enabled). Copies nothing: a language with no translations is an empty overlay, and the switcher lists a page in it only once its overlay is published. Use… |
| `translate_page` | internal | Translate one page into another language, server-side, keeping the design: give slug (the page) + locale (the language to translate INTO). The page's structure stays where it is; the text lands in … |
| `set_translation` | internal | Set translated strings by hand: slug (the page) + locale + unit (from list_stale_translations or the page editor's translation view) + text, or doc for a rich-text unit. Several strings → ONE call … |
| `publish_translation` | internal | Publish (or unpublish) translation overlays: slug + locale for one page, or locale alone for EVERY page that has an overlay in that language (one call publishes a language). status published|draft.… |
| `convert_translation_groups` | internal | Convert pages stored as sibling rows per language (the pre-overlay model: home + home-sv) into ONE page with a translation overlay per language, so the design lives once. Use when: an instance stil… |
| `manage_page_translation` | internal | LEGACY (pre-overlay model): set a page locale, create/link sibling pages as language versions, list a page's language versions. Use when: an instance still stores translations as sibling rows and a… |
| `manage_page_experiment` | internal | A/B test two versions of a page: create an experiment between a control page and a variant page, start/stop it, and read impressions/conversions/lift per variant. Use when: optimizing a landing pag… |
| `manage_global_blocks` | internal | Manage global blocks (header, footer, etc): list, get, update, toggle active status. Use when: changing header/footer content; reviewing active global elements; toggling visibility of a global bloc… |

## Data Model

Tables this module owns (declared by the module, or created in its migrations):

- `public.page_experiment_events`
- `public.page_experiments`
- `public.page_redirects`
- `public.page_versions`
- `public.page_views`
- `public.pages`

All tables ship with Row-Level Security policies. See migration files for the exact rules.

## Used in Processes

This module participates in the following end-to-end business processes:

- [content-to-conversion](../processes/content-to-conversion.md)

## File Map

| Purpose | Path |
|---------|------|
| Module definition | `src/lib/modules/pages-module.ts` |
| Hook | `src/hooks/usePages.tsx` |
| Migration | `supabase/migrations/20260708090000_pages-parity-r8.sql` |
| Migration | `supabase/migrations/20260717110000_fix-publish-scheduled-pages-cron.sql` |
| Migration | `supabase/migrations/20260817235000_pages-writes-follow-the-matrix.sql` |

## Contributing

To enhance this module, see [Contributing Guide](../contributing/contributing.md).

Key rules:
- Follow `ModuleDefinition<I, O>` contract pattern
- All schema changes require idempotent migrations
- Skills must be self-describing ([Law 2](../concepts/openclaw-law.md))
- Blocks are interfaces, not pipelines ([Law 3](../concepts/openclaw-law.md))
- New skills must pass the [Agent Contract Integrity](../../mem/architecture/agent-contract-integrity.md) checklist (`bun run lint:skills`)

---

*This file is auto-generated by `scripts/generate-module-docs.ts`. Do not edit manually — re-run the script after changing the module definition.*