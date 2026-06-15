import { z } from 'zod';
import { defineModule } from '@/lib/module-def';
import type { SkillSeed } from '@/lib/module-bootstrap';

const docsInputSchema = z.object({
  action: z.enum(['list', 'search', 'get']),
  query: z.string().optional(),
  category: z.string().optional(),
  slug: z.string().optional(),
});

const docsOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

type DocsInput = z.infer<typeof docsInputSchema>;
type DocsOutput = z.infer<typeof docsOutputSchema>;

const DOCS_SKILLS: SkillSeed[] = [
  {
    name: 'docs_search',
    description:
      'Search and read public Flowwink documentation pages (synced from the magnusfroste/flowwink GitHub repo). Use when: a visitor or evaluator asks how Flowwink works, what modules exist, how a process flows, what the architecture is, how to compare with Odoo/Salesforce, or any "what is X" / "how does X work" question about the platform itself. NOT for: managing KB articles (manage_kb_article); internal handbook (handbook_search); web search (web_search).',
    category: 'content',
    handler: 'module:docs',
    scope: 'both',
    tool_definition: {
      type: 'function',
      function: {
        name: 'docs_search',
        description:
          'Search public Flowwink documentation. Returns matching pages with title, category, slug, and excerpt.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search term across title and content.' },
            category: {
              type: 'string',
              description:
                'Filter by category (e.g. modules, processes, architecture, concepts, guides).',
            },
            slug: { type: 'string', description: 'Specific page slug to retrieve full content.' },
            limit: { type: 'number', description: 'Max results (default 5).' },
          },
        },
      },
    },
    instructions: `## docs_search
Searches the public Flowwink docs site (synced from GitHub).
- Search: docs_search(query: "purchasing")
- Browse category: docs_search(category: "modules")
- Read full page: docs_search(category: "modules", slug: "purchasing")
Always cite results with markdown links to /docs/{category}/{slug}.`,
  },
  {
    name: 'manage_docs_page',
    description:
      'Author and maintain documentation pages in-app (not via GitHub sync): create, update, delete, or restore a previous version. Use when: writing a new docs page from inside the platform, editing an existing page, toggling a draft public/private, or rolling back to an earlier version. NOT for: public knowledge base Q&A (manage_kb_article); internal wiki/SOPs (manage_wiki_page); marketing pages (manage_pages). Reads go via docs_search. App-authored pages are never overwritten by the GitHub sync (it only touches source=github rows).',
    category: 'content',
    handler: 'rpc:manage_docs_page',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_docs_page',
        description:
          'Create / update / delete / restore_version a documentation page. Update & restore snapshot the prior content into version history automatically.',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['create', 'update', 'delete', 'restore_version'],
              description: 'Operation to perform.',
            },
            id: { type: 'string', description: 'Doc page UUID (required for update/delete/restore_version).' },
            title: { type: 'string', description: 'Page title (required for create).' },
            content: { type: 'string', description: 'Markdown body (required for create).' },
            category: { type: 'string', description: 'Category (default "general"), e.g. modules, guides.' },
            slug: { type: 'string', description: 'URL slug; auto-derived from title on create if omitted.' },
            is_published: { type: 'boolean', description: 'Public visibility. Default true on create.' },
            version_no: { type: 'number', description: 'Version to restore (required for restore_version).' },
          },
          required: ['action'],
        },
      },
    },
    instructions: `## manage_docs_page
In-app docs authoring (separate from GitHub-synced docs).
- Create: manage_docs_page(action:"create", title:"...", content:"# ...", category:"guides")
- Update (auto-snapshots old version): manage_docs_page(action:"update", id:"<uuid>", content:"...")
- Unpublish (make private): manage_docs_page(action:"update", id:"<uuid>", is_published:false)
- Roll back: manage_docs_page(action:"restore_version", id:"<uuid>", version_no:2)
Confirm with the user before delete. Slug auto-derives from the title on create.`,
  },
];

export const docsModule = defineModule<DocsInput, DocsOutput>({
  id: 'docs',
  name: 'Docs',
  version: '1.0.0',
  processes: ['content-to-conversion'],
  maturity: 'L3',
  description:
    'Public documentation portal — auto-synced from the GitHub docs/ folder, browsable at /docs with embedded AI chat for evaluators.',
  capabilities: ['data:read'],
  tier: 'standard',
  inputSchema: docsInputSchema,
  outputSchema: docsOutputSchema,

  skills: ['docs_search'],
  skillSeeds: DOCS_SKILLS,

  async publish(input: DocsInput): Promise<DocsOutput> {
    const validated = docsInputSchema.parse(input);
    return { success: true, message: `Docs ${validated.action} completed` };
  },
});
