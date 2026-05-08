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
 * Cowork Chat integration:
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
                'Markdown body. Use [[WikiWord]] or CamelCase to auto-link to other pages.',
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
- **content_md**: markdown body; use \`[[Slug]]\` or \`CamelCase\` to link.

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
];

export const wikiModule = defineModule<Input, Output>({
  id: 'wiki',
  name: 'Wiki',
  version: '1.0.0',
  description:
    'Internal TEdit-style wiki / intranet. Authenticated users can read and edit; CamelCase / [[WikiWord]] auto-linking creates missing pages on click. Surfaces as a selectable knowledge source in Cowork Chat.',
  capabilities: ['data:read', 'data:write', 'content:receive'],
  inputSchema,
  outputSchema,
  skills: ['manage_wiki_page', 'search_wiki'],
  skillSeeds: WIKI_SKILLS,
  async publish(_input: Input): Promise<Output> {
    return { success: true };
  },
});
