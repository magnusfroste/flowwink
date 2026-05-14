import { defineModule } from '@/lib/module-def';
import { z } from 'zod';
import type { SkillSeed } from '@/lib/module-bootstrap';

const inputSchema = z.object({
  action: z.enum(['test_api', 'test_webhook', 'generate_mock']),
  payload: z.record(z.unknown()).optional(),
});

const outputSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

// =============================================================================
// PLATFORM SKILLS — these belong to the platform itself, not a feature module.
// Seeded here so they survive module-reset since the developer module is always on.
// =============================================================================
const PLATFORM_SKILLS: SkillSeed[] = [
  {
    name: 'global_search',
    description:
      'Unified search across all major business entities: companies, leads, deals, orders, invoices, quotes, tickets, contracts, documents, kb_articles, products, pages, blog_posts, employees, vendors, projects. Use when: looking up a record by name/email/number/keyword without knowing which table it lives in. NOT for: listing all records of one type (use the dedicated list/manage_* skill instead).',
    category: 'search',
    handler: 'rpc:mcp_global_search',
    scope: 'internal',
    trust_level: 'auto',

    tool_definition: {
      type: 'function',
      function: {
        name: 'global_search',
        description:
          'Full-text search across 16 entity types. Returns ranked matches with entity_type, entity_id, title, subtitle, and a deep-link URL. Admin-only via underlying RPC.',
        parameters: {
          type: 'object',
          properties: {
            search_query: {
              type: 'string',
              description:
                'Free-text query, minimum 2 characters. Supports websearch syntax (quoted phrases, OR).',
            },
            result_limit: {
              type: 'integer',
              description: 'Max results per entity type. Default 8.',
              default: 8,
            },
          },
          required: ['search_query'],
        },
      },
    },
  },
];

export const developerModule = defineModule<Input, Output>({
  id: 'developer',
  name: 'Developer',
  version: '1.1.0',
  description:
    'API explorer, webhooks, and developer tools for integrating with external systems. Also hosts platform-level skills (e.g. global_search).',
  capabilities: ['webhook:trigger', 'data:read'],
  inputSchema,
  outputSchema,

  skills: ['global_search', 'lint_skill'],
  skillSeeds: PLATFORM_SKILLS,

  async publish(input: Input): Promise<Output> {
    return { success: true, data: { action: input.action } };
  },
});
