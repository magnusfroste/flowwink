---
name: Wiki Internal Intranet
description: TEdit-style wiki module — wiki_pages table, [[WikiWord]]/CamelCase auto-linking + auto-create missing, double-click edit, MCP-exposed manage_wiki_page + search_wiki, surfaces as selectable Cowork Chat source 'wiki'
type: feature
---

Module `wiki` (opt-in). Routes: `/admin/wiki`, `/admin/wiki/:slug`.

- Table `wiki_pages` (slug PK PascalCase, content_md). RLS authenticated
  read+insert+update; admin-only delete. Trigger `wiki_pages_stamp` keeps
  `updated_by/at` and `created_by` fresh.
- `WikiMarkdown` component pre-processes markdown: `[[Slug]]` and bare
  `CamelCase` → react-router `<Link>` to `/admin/wiki/<slug>`. Missing
  slugs render destructive-color → click navigates into edit mode for the
  new slug → save creates the page.
- Double-click on the rendered page → switches to edit mode. Cancel/Save
  buttons; backlinks list rendered below view mode.
- Skills (handler `module:wiki`, both `mcp_exposed=true`):
  - `manage_wiki_page` (list/get/create/update/delete)
  - `search_wiki` (ILIKE on title + content_md)
  - Implemented in `executeWikiAction()` inside `agent-execute/index.ts`.
- Cowork Chat: `workspace-chat` edge fn adds `'wiki'` to `SourceKey` /
  `ALL_SOURCES`. `useWorkspaceChat` and `CitationsDrawer` mirror the type
  + label so support staff can toggle it as a knowledge source. Citations
  link to `/admin/wiki/<slug>`.
- Distinct from: KB (public FAQ), Docs (public portal synced from
  GitHub), Handbook (admin-only synced from clawable repo).
