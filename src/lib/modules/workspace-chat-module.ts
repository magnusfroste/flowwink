import { defineModule } from '@/lib/module-def';
import { z } from 'zod';
import type { SkillSeed } from '@/lib/module-bootstrap';

const WORKSPACE_CHAT_SKILLS: SkillSeed[] = [
  {
    name: 'post_to_cowork_chat',
    description: 'LEGACY log channel (cowork_messages) — no longer surfaced in the Flowwork UI. Use when: an automation or integration explicitly targets this channel for compatibility. NOT for: telling the team something (use post_to_river — but only for material milestones a human colleague would post); routine heartbeat status (stay silent — it is already in agent_activity); requesting approval (the approval queue notifies on its own).',
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
    instructions: 'Kept for wire compatibility (existing automations may write here) — the Flowwork UI no longer renders cowork_messages. The agent\'s team voice moved to post_to_river, with a high bar: post only what a human colleague would post (a shipped milestone, a real win, a heads-up that needs eyes). Routine status is silence. NB: the skill/RPC name and the cowork_messages table keep the legacy "cowork" wire name — renaming deployed identifiers is a fleet-wide lockstep with no user value.',
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
 * Flowwork — internal RAG/CAG + model knowledge chat for admins & employees.
 * (Renamed from "Cowork Chat" 2026-07 — the old name collided with Anthropic's
 * Claude Cowork product. Display/story renamed; wire identifiers kept.)
 *
 * - Authenticated, read-only chat against:
 *   - workspace data (documents, contracts, KB, pages, CRM, employees), AND
 *   - the model's own training knowledge (toggleable), AND
 *   - the public web via Firecrawl (toggleable, requires FIRECRAWL_API_KEY).
 * - Two modes: 'cowork' (stored value; shown as "Flowwork" — blended) and
 *   'strict' (workspace-only).
 * - Uses the same AI provider as AI Chat (Integrations).
 * - Independent of FlowPilot — works as long as an AI provider is configured.
 *
 * Legacy wire names kept on purpose (per the naming policy in CLAUDE.md):
 * module id `workspaceChat`, skill/RPC `post_to_cowork_chat`, tables
 * `cowork_messages`, site_settings key `cowork_chat`, edge fn `workspace-chat`.
 *
 * 2026-07 (Fas 0): the AgentFeed strip (cowork_messages rendered above the
 * conversation) was removed — Flowwork is the user's private workspace. The
 * agent's team voice lives in River (post_to_river, colleague-test bar);
 * routine heartbeat status stays in agent_activity; approvals notify via the
 * approval queue. cowork_messages remains write-compatible but unrendered.
 */
export const workspaceChatModule = defineModule<Input, Output>({
  id: 'workspaceChat',
  name: 'Flowwork',
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
