import { defineModule } from '@/lib/module-def';
import { z } from 'zod';

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
  description:
    'Internal authenticated chat that blends your workspace data with the model\'s own knowledge and optional web search — with source citations. No mutations.',
  capabilities: ['data:read'],
  inputSchema,
  outputSchema,

  skills: [],

  async publish(_input: Input): Promise<Output> {
    return { success: true };
  },
});
