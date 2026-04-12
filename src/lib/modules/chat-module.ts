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
  description: 'AI-powered visitor chat widget using FlowPilot intelligence',
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
