---
title: "Website Module"
module_id: "pages"
version: "1.0.0"
category: "content"
autonomy: "config-required"
generated: true
generated_at: "2026-07-07"
---

# Website

> Create and publish website pages, header, footer, branding and navigation

Ships with **13 agent skills**, **3 database tables**.

## Quick Facts

| Property | Value |
|----------|-------|
| **Module ID** | `pages` |
| **Version** | 1.0.0 |
| **Category** | content |
| **Autonomy** | config-required |
| **Core** | Yes |
| **Capabilities** | `content:receive`, `data:write`, `webhook:trigger` |
| **MCP-exposed skills** | 13 |
| **Owns tables** | 3 |

## Skills

These skills are seeded into `agent_skills` when the module is enabled and exposed via MCP.
External operators (FlowPilot, OpenClaw, Claude Desktop, custom MCP clients) can call them directly.

| Skill | Scope | Description |
|-------|-------|-------------|
| `generate_meta_description` | internal | Scan published pages for missing SEO meta descriptions and generate them via AI. Use when: improving site SEO; doing a content audit; filling gaps in meta_json. NOT for: writing page body content (… |
| `generate_alt_text` | internal | Scan published pages for images missing alt-text and generate accessible alt descriptions via AI. Use when: improving accessibility (WCAG); SEO maintenance; auditing image content. NOT for: writing… |
| `manage_page` | internal | Full page lifecycle management: list, get, create, update, publish, archive, delete, rollback. Use when: creating a new page, publishing a draft, listing all pages, updating page metadata, archivin… |
| `manage_page_blocks` | internal | Manipulate blocks on a page: list, add, update, remove, reorder, duplicate, toggle visibility. Use when: designing a page layout; repositioning elements; showing/hiding specific content blocks. NOT… |
| `landing_page_compose` | internal | Autonomously compose a landing page from the block library based on campaign goal, target audience, and optional ad campaign reference. Use when: building a campaign landing page; creating a target… |
| `site_branding_get` | internal | Read current site branding settings including logo, colors, fonts, and favicon. Use when: retrieving current brand settings; checking active color scheme; verifying logo URL. NOT for: updating bran… |
| `site_branding_update` | internal | Update site branding settings — logo URL, primary/accent colors, font family, favicon. Use when: changing the site logo; updating brand colors; applying a new visual identity. NOT for: reading curr… |
| `create_page_block` | internal | Create a new content block on an existing page. Supports batch mode for adding multiple blocks at once. Use when: building a page after manage_page created it, adding sections during migration, use… |
| `generate_site_from_identity` | both | Generate a complete website from the Business Identity profile. Use when: setting up a brand new site, user says "build my website", generating initial site structure. NOT for: editing existing pag… |
| `build_site_step` | both | Run one step of the site-builder reasoning loop: takes conversation history + current module state, returns next assistant message and optionally a tool_call (create_block / migrate_url / update_fo… |
| `manage_redirect` | internal | Manage URL redirects (301/302) from old paths to new pages or external URLs. Use when: a page slug changed and old links must keep working, consolidating pages, migrating from another site, fixing … |
| `manage_page_translation` | internal | Multi-language pages: set a page locale, create/link translations of a page, list a page\ |
| `manage_page_experiment` | internal | A/B test two versions of a page: create an experiment between a control page and a variant page, start/stop it, and read impressions/conversions/lift per variant. Use when: optimizing a landing pag… |

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