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
  {
    name: 'sync_handbook_from_github',
    description: 'Recursively import markdown handbook chapters from a GitHub repo path. Use when: syncing the employee handbook maintained in GitHub. NOT for: product docs (sync_docs_from_github).',
    category: 'system',
    handler: 'internal:sync_handbook_from_github',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'sync_handbook_from_github',
        parameters: {
          type: 'object',
          required: ["repo_owner", "repo_name"],
          properties: {
            repo_owner: { type: 'string', description: 'GitHub owner' },
            repo_name: { type: 'string', description: 'Repo name' },
            path: { type: 'string', description: 'Path (default content/chapters)' },
            branch: { type: 'string', description: 'Branch (default main)' },
          },
        },
      },
    },
  },
  {
    name: 'handbook_chapter_history',
    description:
      'Version history for handbook chapters: list revisions, read an old revision, restore one. Every content/title/frontmatter change and every delete is captured automatically, and the revision survives the chapter being deleted — so a chapter dropped from the GitHub repo is still recoverable. Use when: recovering a chapter that a sync removed or overwrote, reviewing what a sync changed. NOT for: reading current chapters (handbook_search); pulling fresh content from GitHub (sync_handbook_from_github).',
    category: 'content',
    handler: 'rpc:handbook_chapter_history',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'handbook_chapter_history',
        description: 'list (per slug or chapter_id, newest first) / get (full revision body) / restore (write a revision back — recreates deleted chapters).',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['list', 'get', 'restore'] },
            p_slug: { type: 'string', description: 'Chapter slug (list)' },
            p_chapter_id: { type: 'string', format: 'uuid', description: 'Chapter id (list) — wins over p_slug' },
            p_revision_id: { type: 'string', format: 'uuid', description: 'Revision id (get/restore)' },
            p_limit: { type: 'integer', default: 20, description: 'list: max revisions (max 100)' },
          },
        },
      },
    },
    instructions:
      'Each revision stores the chapter state BEFORE the change that produced it, so the newest revision of a deleted chapter (action="delete") holds it exactly as it was. action values: "update", "delete", and "baseline" (seeded once for chapters that already existed when history was switched on). The body is in content_md; repo_owner, repo_name and file_path travel with the revision because they are the chapter\'s identity in the source repo. Workflow: list by p_slug (or p_chapter_id) → get to inspect → restore. restore recreates a deleted chapter with its original id and file_path, and fails with a clear error if another chapter has since taken that (repo_owner, repo_name, file_path). IMPORTANT: handbook_chapters mirrors a GitHub repo — a chapter restored here is a LOCAL copy, and the next sync_handbook_from_github will delete it again if the file is still missing from the repo. Restore to read or copy the content out; put the file back in the repo to make it stick. A sync that only rewrites the blob sha creates no revision.',
  },
];

export const handbookModule = defineModule<HandbookInput, HandbookOutput>({
  id: 'handbook',
  name: 'Agentic Handbook',
  version: '1.0.0',
  processes: ['hire-to-retire'],
  maturity: 'L2',
  description: 'Agentic methodology handbook with search and reader capabilities',
  capabilities: ['data:read'],
  tier: 'standard',
  inputSchema: handbookInputSchema,
  outputSchema: handbookOutputSchema,

  skills: [
    'handbook_search',
    'handbook_chapter_history',
  ],
  data: {
    // handbook_chapter_revisions is deliberately NOT FK-bound to
    // handbook_chapters (that is the only reason a deleted chapter is
    // recoverable), so a site reset must name it explicitly.
    tables: ['handbook_chapter_revisions', 'handbook_chapters'],
  },
  skillSeeds: HANDBOOK_SKILLS,

  async publish(input: HandbookInput): Promise<HandbookOutput> {
    const validated = handbookInputSchema.parse(input);
    logger.log('[handbook] action:', validated.action);
    return { success: true, message: `Handbook ${validated.action} completed` };
  },
});
