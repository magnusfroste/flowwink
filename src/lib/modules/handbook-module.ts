import { logger } from '@/lib/logger';
import { z } from 'zod';
import type { ModuleDefinition } from '@/types/module-contracts';

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

export const handbookModule: ModuleDefinition<HandbookInput, HandbookOutput> = {
  id: 'handbook',
  name: 'Agentic Handbook',
  version: '1.0.0',
  description: 'Agentic methodology handbook with search and reader capabilities',
  capabilities: ['data:read'],
  inputSchema: handbookInputSchema,
  outputSchema: handbookOutputSchema,

  async publish(input: HandbookInput): Promise<HandbookOutput> {
    const validated = handbookInputSchema.parse(input);
    logger.log('[handbook] action:', validated.action);
    return { success: true, message: `Handbook ${validated.action} completed` };
  },
};
