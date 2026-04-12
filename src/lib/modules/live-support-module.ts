import { defineModule } from '@/lib/module-def';
import { z } from 'zod';

const inputSchema = z.object({
  action: z.enum(['list_conversations', 'assign']),
  conversation_id: z.string().uuid().optional(),
  agent_id: z.string().uuid().optional(),
});

const outputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

export const liveSupportModule = defineModule<Input, Output>({
  id: 'liveSupport',
  name: 'Live Support',
  version: '1.0.0',
  description: 'Human agent takeover for escalated chat conversations',
  capabilities: ['data:read', 'data:write'],
  inputSchema,
  outputSchema,

  skills: [
    'support_list_conversations',
    'support_assign_conversation',
  ],

  async publish(input: Input): Promise<Output> {
    return { success: true, message: `Live support ${input.action} completed` };
  },
});
