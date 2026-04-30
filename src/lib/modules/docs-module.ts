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
];

export const docsModule = defineModule<DocsInput, DocsOutput>({
  id: 'docs',
  name: 'Docs',
  version: '1.0.0',
  description:
    'Public documentation portal — auto-synced from the GitHub docs/ folder, browsable at /docs with embedded AI chat for evaluators.',
  capabilities: ['data:read'],
  inputSchema: docsInputSchema,
  outputSchema: docsOutputSchema,

  skills: ['docs_search'],
  skillSeeds: DOCS_SKILLS,

  async publish(input: DocsInput): Promise<DocsOutput> {
    const validated = docsInputSchema.parse(input);
    return { success: true, message: `Docs ${validated.action} completed` };
  },
});
