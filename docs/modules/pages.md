---
title: "Pages Module"
module_id: "pages"
version: "1.0.0"
category: "content"
autonomy: "config-required"
generated: true
generated_at: "2026-10-02"
description: Create and publish website pages, header, footer and navigation
---

# Pages

> Create and publish website pages, header, footer and navigation

Ships with **15 agent skills**, **3 database tables**.

## Quick Facts

| Property | Value |
|----------|-------|
| **Module ID** | `pages` |
| **Version** | 1.0.0 |
| **Category** | content |
| **Autonomy** | config-required |
| **Core** | Yes |
| **Capabilities** | `content:receive`, `data:write`, `webhook:trigger` |
| **MCP-exposed skills** | 15 |
| **Owns tables** | 3 |

## Skills

These skills are seeded into `agent_skills` when the module is enabled and exposed via MCP.
External operators (FlowPilot, OpenClaw, Claude Desktop, custom MCP clients) can call them directly.

| Skill | Scope | Description |
|-------|-------|-------------|
| `generate_meta_description` | internal | Scan published pages for missing SEO meta descriptions and generate them via AI. Use when: improving site SEO; doing a content audit; filling gaps in meta_json. NOT for: writing page body content (… |
| `generate_alt_text` | internal | Scan published pages for images missing alt-text and generate accessible alt descriptions via AI. Use when: improving accessibility (WCAG); SEO maintenance; auditing image content. NOT for: writing… |
| `manage_page` | internal | Full page lifecycle management for WEBSITE/CMS pages — the pages visitors see on the public site. Use when: creating or editing a website page (landing page, about, services, contact), publishing a… |
| `manage_page_blocks` | internal | Manipulate blocks on a page: list, add, update, remove, reorder, duplicate, toggle visibility. Use when: designing a page layout; repositioning elements; showing/hiding specific content blocks. NOT… |
| `site_branding_get` | internal | Read current site branding settings including logo, colors, fonts, and favicon. Use when: retrieving current brand settings; checking active color scheme; verifying logo URL. NOT for: updating bran… |
| `site_branding_update` | internal | Update site branding settings — logo URL, primary/accent colors, font family, favicon. Use when: changing the site logo; updating brand colors; applying a new visual identity. NOT for: reading curr… |
| `create_page_block` | internal | Create a new content block on an existing page. Supports batch mode for adding multiple blocks at once. Use when: building a page after manage_page created it, adding sections during migration, use… |
| `build_site_step` | both | Run one step of the site-builder reasoning loop: takes conversation history + current module state, returns next assistant message and optionally a tool_call (create_block / migrate_url / update_fo… |
| `manage_redirect` | internal | Manage URL redirects (301/302) from old paths to new pages or external URLs. Use when: a page slug changed and old links must keep working, consolidating pages, migrating from another site, fixing … |
| `list_stale_translations` | internal | Find language versions of pages that have fallen behind their freshest sibling — the Swedish page was improved but the English one was not. Use when: checking whether translations are up to date; b… |
| `translate_site_into` | internal | Copy every published page into a new language in one go, as drafts, and add that language to the site. Use when: a site installed from a template is in one language and someone wants a second one; … |
| `translate_page` | internal | Target-language page slug, e.g. "home-sv" |
| `manage_page_translation` | internal | Multi-language pages: set a page locale, create/link translations of a page, list a page\ |
| `manage_page_experiment` | internal | A/B test two versions of a page: create an experiment between a control page and a variant page, start/stop it, and read impressions/conversions/lift per variant. Use when: optimizing a landing pag… |
| `manage_global_blocks` | internal | Manage global blocks (header, footer, etc): list, get, update, toggle active status. Use when: changing header/footer content; reviewing active global elements; toggling visibility of a global bloc… |

## Data Model

Tables created by this module (from migrations):

- `public.page_experiment_events`
- `public.page_experiments`
- `public.page_redirects`

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