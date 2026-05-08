import { defineModule } from '@/lib/module-def';
import { z } from 'zod';

const inputSchema = z.object({ action: z.enum(['get_config']) });
const outputSchema = z.object({ success: z.boolean(), error: z.string().optional() });

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

/**
 * Clawable — internal admin UI to chat with external operator peers
 * (OpenClaw / Anthropic-style /v1/responses) directly from FlowWink.
 *
 * - Admin-only authenticated UI under /admin/clawable.
 * - Backed by `clawable_sessions` + `clawable_messages` and the
 *   `clawable-chat` edge function which proxies to peer.url + /v1/responses
 *   using the federation peer's gateway_token.
 * - Independent of FlowPilot — works as long as a peer is configured.
 * - Exposes NO skills (no MCP). This is a FlowWink-internal cockpit
 *   for testing/administering external operators, not a capability
 *   external claws should call.
 */
export const clawableModule = defineModule<Input, Output>({
  id: 'clawable',
  name: 'Clawable',
  version: '1.0.0',
  description:
    'Internal admin chat for external operator peers (OpenClaw /v1/responses). UI-only — no MCP, no skills.',
  capabilities: ['data:read'],
  inputSchema,
  outputSchema,
  skills: [],
  async publish(_input: Input): Promise<Output> {
    return { success: true };
  },
});
