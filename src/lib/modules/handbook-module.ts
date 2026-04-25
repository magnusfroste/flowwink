import { logger } from '@/lib/logger';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { defineModule } from '@/lib/module-def';
import { z } from 'zod';

const handbookInputSchema = z.object({
  action: z.enum(['list', 'search']),
  query: z.string().optional(),
});

const handbookOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

type HandbookInput = z.infer<typeof handbookInputSchema>;
type HandbookOutput = z.infer<typeof handbookOutputSchema>;

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const HANDBOOK_SKILLS: SkillSeed[] = [
  {
    name: 'handbook_search',
    description: 'Search and read chapters from the synced handbook (Agentic Handbook / Clawable). Use when: visitor asks about AI agents, FlowPilot architecture, agentic design, OpenClaw, heartbeat protocol, skills ecosystem, federation, or any topic covered in the handbook. NOT for: managing KB articles (manage_kb_article); general web search (web_search).',
    category: 'content',
    handler: 'module:handbook',
    scope: 'both',
    tool_definition: {
      type: 'function',
      function: {
        name: 'handbook_search',
        description: 'Search and read chapters from the synced handbook (Agentic Handbook / Clawable). Use when: visitor asks about AI agents, FlowPilot architecture, agentic design, OpenClaw, heartbeat protocol, skills ecosystem, federation, or any topic covered in the handbook. NOT for: managing KB articles (manage_kb_article); general web search (web_search).',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search term to find relevant chapters',
            },
            slug: {
              type: 'string',
              description: 'Specific chapter slug to retrieve full content',
            },
            limit: {
              type: 'number',
              description: 'Max results (default 5)',
            },
          },
        },
      },
    },
    instructions: `## handbook_search
### What
Searches and retrieves chapters from the synced GitHub handbook repository.
### When to use
- Visitor asks about agentic architecture, FlowPilot, OpenClaw, skills, heartbeat, federation
- Admin wants to reference handbook content
- Any question about how FlowPilot works architecturally
### Parameters
- **query**: Search term to find relevant chapters (searches title and content)
- **slug**: Specific chapter slug to retrieve full content
- **limit**: Max results for search (default 5)
### Usage patterns
1. Search: handbook_search(query: "heartbeat") → get snippets
2. Read: handbook_search(slug: "05-heartbeat-protocol") → full chapter
3. TOC: handbook_search() → list all chapters`,
  },
];

export const handbookModule = defineModule<HandbookInput, HandbookOutput>({
  id: 'handbook',
  name: 'Agentic Handbook',
  version: '1.0.0',
  description: 'Agentic methodology handbook with search and reader capabilities',
  capabilities: ['data:read'],
  inputSchema: handbookInputSchema,
  outputSchema: handbookOutputSchema,

  skills: [
    'handbook_search',
  ],
  skillSeeds: HANDBOOK_SKILLS,

  async publish(input: HandbookInput): Promise<HandbookOutput> {
    const validated = handbookInputSchema.parse(input);
    logger.log('[handbook] action:', validated.action);
    return { success: true, message: `Handbook ${validated.action} completed` };
  },
});
