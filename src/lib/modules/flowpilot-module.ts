import { defineModule } from '@/lib/module-def';
import { z } from 'zod';

const inputSchema = z.object({
  action: z.enum(['status', 'heartbeat']),
});

const outputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

export const flowpilotModule = defineModule<Input, Output>({
  id: 'flowpilot',
  name: 'FlowPilot',
  version: '1.0.0',
  description: 'Autonomous AI operator — skills, objectives, automations and workflows',
  capabilities: ['data:read', 'data:write'],
  inputSchema,
  outputSchema,

  skills: [
    // FlowPilot consumes skills from other modules — it doesn't own module-specific skills.
    // Core skills (create_objective, manage_automations, etc.) are defined in CORE_SKILLS.
  ],

  async publish(input: Input): Promise<Output> {
    return { success: true, message: `FlowPilot ${input.action} completed` };
  },
});
