import { defineModule } from '@/lib/module-def';
import { z } from 'zod';
import type { SkillSeed } from '@/lib/module-bootstrap';

/**
 * Wiki — internal TEdit-style knowledge wiki / intranet.
 *
 * What this module owns:
 *   - `wiki_pages` table (slug PK, content_md, RLS authenticated read+write,
 *     admin delete)
 *   - Admin UI under `/admin/wiki/:slug` with double-click-to-edit and
 *     `[[WikiWord]]` / `CamelCase` auto-linking that creates missing pages
 *     on click.
 *
 * Skills exposed to FlowPilot / MCP (handler `module:wiki`):
 *   - `manage_wiki_page`  — list / get / create / update / delete
 *   - `search_wiki`       — full-text-ish search over title + content
 *
 * Flowwork integration:
 *   - The `workspace-chat` edge function exposes `wiki` as a selectable
 *     knowledge source so support staff can ground answers in the intranet.
 *
 * @see docs/modules/wiki.md
 */

const inputSchema = z.object({
  action: z.enum(['get_config']).default('get_config'),
});
const outputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

const WIKI_SKILLS: SkillSeed[] = [
  {
    name: 'manage_wiki_page',
    description:
      'Manage internal wiki pages (intranet): list, get, create, update, delete. Use when: drafting onboarding notes, updating an internal SOP, capturing a process used by support staff, or seeding the intranet with a new topic. NOT for: public knowledge base articles (use manage_kb_article); public website pages (use manage_pages); blog posts (use manage_blog_posts).',
    category: 'content',
    handler: 'module:wiki',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_wiki_page',
        description:
          'Manage internal wiki pages (intranet): list, get, create, update, delete.',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['list', 'get', 'create', 'update', 'delete'],
            },
            slug: {
              type: 'string',
              description:
                'Wiki page slug — PascalCase WikiWord (e.g. "OnboardingChecklist"). Required for get/update/delete; optional for create (derived from title if absent).',
            },
            title: {
              type: 'string',
              description: 'Human-readable page title. Required for create.',
            },
            content_md: {
              type: 'string',
              description:
                'REQUIRED for create and for any update that touches the body. Full markdown body of the page — write the actual content, not just a stub or a title placeholder. Use [[WikiWord]] or CamelCase to auto-link to other pages. The server rejects empty strings with an explicit error.',
            },
            limit: {
              type: 'number',
              description: 'list: max rows to return (default 50, max 200).',
            },
          },
          required: ['action'],
          additionalProperties: false,
        },
      },
    },
    instructions: `## manage_wiki_page
### What
CRUD for the internal wiki / intranet (\`wiki_pages\`). Pages are keyed by a
PascalCase \`slug\` (e.g. \`OnboardingChecklist\`). Body is markdown and may
contain \`[[WikiWord]]\` or bare \`CamelCase\` links — clicking a missing one
in the UI auto-creates the page.

### When to use
- An admin asks to draft an onboarding doc, SOP, runbook, or team note.
- Support staff need a single internal place for "how do we handle X".
- You're seeding the intranet with a new topic that doesn't belong on the
  public website, blog, or KB.

### Parameters
- **action**: list | get | create | update | delete
- **slug**: required for get/update/delete; for create it's derived from
  title if omitted.
- **title**: required for create.
- **content_md**: **REQUIRED for create and for any update that changes the body.**
  Pass the full markdown — the server rejects empty strings to prevent
  blank-page artifacts. Use \`[[Slug]]\` or \`CamelCase\` to link.

### Edge cases
- Delete is admin-only (RLS enforced).
- Slug collisions on create return an error — pick a different title.`,
  },
  {
    name: 'search_wiki',
    description:
      'Search the internal wiki by query string against title and markdown body. Use when: finding existing intranet pages before creating duplicates; answering a support/HR question that may already be documented; building a list of related pages. NOT for: public knowledge base search.',
    category: 'content',
    handler: 'module:wiki',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'search_wiki',
        description:
          'Search internal wiki pages (title + content) and return matches.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Free-text search query.',
            },
            limit: {
              type: 'number',
              description: 'Max matches to return (default 10, max 50).',
            },
          },
          required: ['query'],
          additionalProperties: false,
        },
      },
    },
    instructions: `## search_wiki
### What
ILIKE search over wiki page title + content_md.
### When to use
- Before creating a new wiki page, check for existing coverage.
- Looking up an internal process during a support chat.
### Parameters
- **query**: required free-text.
- **limit**: optional, defaults to 10.`,
  },
  {
    name: 'manage_wiki_hierarchy',
    description:
      'Organize wiki pages into a parent/child tree: set a page\'s parent, fetch the full tree, or list direct children. Use when: structuring the intranet (e.g. all SOPs under a Handbook page), rendering navigation, moving a page. NOT for: editing page content (manage_wiki_page) or permissions (manage_wiki_permissions).',
    category: 'content',
    handler: 'rpc:manage_wiki_hierarchy',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_wiki_hierarchy',
        description: 'set_parent/tree/children over wiki_pages.parent_slug. Cycles are rejected; tree returns a flat depth-first list with depth + path.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['set_parent', 'tree', 'children'] },
            p_slug: { type: 'string', description: 'Page slug (set_parent/children)' },
            p_parent_slug: { type: 'string', description: 'New parent slug; omit/null to move the page to the top level' },
          },
        },
      },
    },
    instructions:
      'set_parent rejects self-parenting and cycles (moving a page under its own descendant). Deleting a parent page re-roots its children (parent_slug set to NULL), it does not delete them.',
  },
  {
    name: 'wiki_page_history',
    description:
      'Version history for wiki pages: list revisions, read an old revision, restore one. Every content/title edit and every delete is captured automatically. Use when: reviewing what changed on a page, recovering overwritten or deleted content. NOT for: current content (manage_wiki_page get).',
    category: 'content',
    handler: 'rpc:wiki_page_history',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'wiki_page_history',
        description: 'list (per slug, newest first) / get (full revision body) / restore (write a revision back — recreates deleted pages).',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['list', 'get', 'restore'] },
            p_slug: { type: 'string', description: 'Page slug (list)' },
            p_revision_id: { type: 'string', format: 'uuid', description: 'Revision id (get/restore)' },
            p_limit: { type: 'integer', default: 20, description: 'list: max revisions (max 100)' },
          },
        },
      },
    },
    instructions:
      'Revisions store the page state BEFORE each change. restore is admin-only and itself creates a new revision, so nothing is ever lost. If the page was deleted, restore recreates it.',
  },
  {
    name: 'manage_wiki_permissions',
    description:
      'Per-page wiki access control: visibility (internal = all authenticated staff, admin = admins only) and editable_by (authenticated or admin). Use when: locking a policy page so only admins can edit it, hiding a sensitive page from non-admins, auditing page permissions. NOT for: page content (manage_wiki_page) or hierarchy (manage_wiki_hierarchy).',
    category: 'content',
    handler: 'rpc:manage_wiki_permissions',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_wiki_permissions',
        description: 'get (one page, or all pages when slug omitted) / set (admin-only) visibility + editable_by. Enforced by RLS.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['get', 'set'] },
            p_slug: { type: 'string', description: 'Page slug (required for set; omit on get to list all)' },
            p_visibility: { type: 'string', enum: ['internal', 'admin'], description: 'Who can read the page' },
            p_editable_by: { type: 'string', enum: ['authenticated', 'admin'], description: 'Who can edit the page' },
          },
        },
      },
    },
    instructions:
      'Defaults are visibility=internal, editable_by=authenticated (the classic open wiki). set is admin-only and enforced at the database level (RLS), not just in the UI.',
  },
];

export const wikiModule = defineModule<Input, Output>({
  id: 'wiki',
  name: 'Wiki',
  version: '1.0.0',
  processes: ['hire-to-retire'],
  maturity: 'L4',
  description:
    'Internal TEdit-style wiki / intranet with page hierarchy, automatic version history (list/diff/restore), and per-page permissions (visibility + edit lock, RLS-enforced). CamelCase / [[WikiWord]] auto-linking creates missing pages on click. Surfaces as a selectable knowledge source in Flowwork.',
  capabilities: ['data:read', 'data:write', 'content:receive'],
  tier: 'standard',
  inputSchema,
  outputSchema,
  skills: ['manage_wiki_page', 'search_wiki', 'manage_wiki_hierarchy', 'wiki_page_history', 'manage_wiki_permissions'],
  data: {
    tables: ['wiki_page_revisions', 'wiki_pages'],
  },
  skillSeeds: WIKI_SKILLS,
  async publish(_input: Input): Promise<Output> {
    return { success: true };
  },
});
