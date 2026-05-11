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

export const chatModule = defineModule<Input, Output>({
  id: 'chat',
  name: 'Chat',
  version: '1.0.0',
  description: 'Public visitor chat — the AI-powered widget and /chat landing page for anonymous site visitors. For internal operator chat use FlowChat (/admin/flowchat); for workspace Q&A over your own data use Cowork (/admin/cowork).',
  capabilities: ['data:read'],
  inputSchema,
  outputSchema,

  skills: [
    // Chat uses chat-completion directly, no DB skills
  ],

  async publish(input: Input): Promise<Output> {
    return { success: true };
  },
});
