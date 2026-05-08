# Wiki

> Internal TEdit-style wiki / intranet for FlowWink.

## What it does

A lightweight, fast intranet for staff. Every authenticated user can read
and edit pages. Markdown body with TEdit-style auto-linking:

- `[[OtherPage]]` and bare `CamelCase` words become clickable links.
- Missing-page links render in red — clicking one navigates straight into
  edit mode for the new slug, so a page is created the moment you save.
- Double-click any page to switch from view → edit. `Esc` / Cancel to back out.

Use cases: HR onboarding checklists, support runbooks, internal SOPs,
"how do we handle X" notes that don't belong on the public website, blog,
or knowledge base.

## Skills exposed (MCP)

Handler: `module:wiki`. Both skills are MCP-exposed.

| Skill | Purpose |
|---|---|
| `manage_wiki_page` | `list` / `get` / `create` / `update` / `delete` |
| `search_wiki`      | ILIKE search over title + content_md |

The skills carry `Use when:` / `NOT for:` guidance so FlowPilot's general
scoring algorithm picks them only for internal-wiki intents (Law 1 & 2).

## Tables / RLS

`wiki_pages` (slug PK):

| Column | Notes |
|---|---|
| `slug` | PascalCase WikiWord, primary key |
| `title` | Human title |
| `content_md` | Markdown body |
| `created_by` / `updated_by` | `auth.users(id)` |
| `created_at` / `updated_at` | Stamped by trigger `wiki_pages_stamp` |

Access:
- **Read / insert / update**: any authenticated user (intranet model).
- **Delete**: admins only (`has_role(uid, 'admin')`).

## Cowork Chat integration

The `workspace-chat` edge function exposes `wiki` as a selectable knowledge
source. Support staff can toggle it in the Sources panel and ground
answers in the intranet alongside Documents, Contracts, KB, etc.

## Settings

None. The module is opt-in via `/admin/modules` (key `wiki`).

## Routes

- `/admin/wiki` → redirects to `/admin/wiki/HomePage`
- `/admin/wiki/:slug` → view/edit a page

## Related

- Source: `src/lib/modules/wiki-module.ts`, `src/pages/admin/WikiPage.tsx`
- Markdown renderer with WikiWord linking: `src/components/admin/wiki/WikiMarkdown.tsx`
- Hooks: `src/hooks/useWiki.ts`
- Edge handler: `case 'wiki'` in `supabase/functions/agent-execute/index.ts`
- Memory: `mem://features/wiki-internal-intranet`
