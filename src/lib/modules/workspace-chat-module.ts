import { defineModule } from '@/lib/module-def';
import { z } from 'zod';
import type { SkillSeed } from '@/lib/module-bootstrap';

const WORKSPACE_CHAT_SKILLS: SkillSeed[] = [
  {
    name: 'post_to_cowork_chat',
    description: 'Post a message into the Cowork Chat as the agent — heartbeat insights, daily summaries, "I just did X" notices for the team. Use when: FlowPilot wants to proactively tell the team something; surfacing an autonomous action. NOT for: public site chat (chat-completion), the social feed (post_to_river), or answering a user question in-thread.',
    category: 'communication',
    handler: 'rpc:post_to_cowork_chat',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'post_to_cowork_chat',
        description: 'Persist a message in cowork_messages (author_type=agent for service-role callers). The chat UI surfaces these alongside the RAG conversation.',
        parameters: {
          type: 'object',
          required: ['p_content'],
          properties: {
            p_content: { type: 'string', description: 'Message text (markdown ok)' },
            p_author_name: { type: 'string', description: 'Display name (default FlowPilot)' },
            p_metadata: { type: 'object', description: 'Optional context, e.g. {source: "heartbeat", objective_id}' },
          },
        },
      },
    },
    instructions: 'The agent\'s voice in the team workspace. Keep messages short and actionable; include metadata.source so the UI can badge them. Staff roles may also post (author_type=user).',
  },
];

const inputSchema = z.object({
  action: z.enum(['get_config']),
});

const outputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

/**
 * Cowork Chat — internal RAG/CAG + model knowledge chat for admins & employees.
 *
 * - Authenticated, read-only chat against:
 *   - workspace data (documents, contracts, KB, pages, CRM, employees), AND
 *   - the model's own training knowledge (toggleable), AND
 *   - the public web via Firecrawl (toggleable, requires FIRECRAWL_API_KEY).
 * - Two modes: 'cowork' (default — blended) and 'strict' (workspace-only).
 * - Uses the same AI provider as AI Chat (Integrations).
 * - Independent of FlowPilot — works as long as an AI provider is configured.
 * - Exposes NO skills (no MCP, no mutations).
 *
 * Internal id stays `workspaceChat` for backward compat with stored module flags.
 */
export const workspaceChatModule = defineModule<Input, Output>({
  id: 'workspaceChat',
  name: 'Cowork Chat',
  version: '1.1.0',
  processes: [],
  maturity: 'L3',
  description:
    'Internal authenticated chat that blends your workspace data with the model\'s own knowledge and optional web search — with source citations. No mutations.',
  capabilities: ['data:read'],
  tier: 'standard',
  inputSchema,
  outputSchema,

  skills: ['post_to_cowork_chat'],
  skillSeeds: WORKSPACE_CHAT_SKILLS,

  async publish(_input: Input): Promise<Output> {
    return { success: true };
  },
});
