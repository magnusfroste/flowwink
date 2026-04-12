import { defineModule } from '@/lib/module-def';
import { z } from 'zod';

const inputSchema = z.object({
  action: z.enum(['enrich', 'get_identity']),
  company_id: z.string().uuid().optional(),
});

const outputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

export const companyInsightsModule = defineModule<Input, Output>({
  id: 'companyInsights',
  name: 'Business Identity',
  version: '1.0.0',
  description: 'Unified business identity, financials, and market positioning. Feeds Sales Intelligence, Chat AI, SEO, and FlowAgent with company context.',
  capabilities: ['data:read'],
  inputSchema,
  outputSchema,

  skills: [
    // Shares salesIntelligence skills — no unique skills
  ],

  async publish(input: Input): Promise<Output> {
    return { success: true, message: `Company insights ${input.action} completed` };
  },
});
