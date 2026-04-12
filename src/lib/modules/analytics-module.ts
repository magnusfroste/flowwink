import { defineModule } from '@/lib/module-def';
import { z } from 'zod';

const inputSchema = z.object({
  action: z.enum(['dashboard', 'seo_audit', 'feedback_analysis', 'weekly_digest']),
  page_url: z.string().optional(),
  period_days: z.number().int().positive().optional(),
});

const outputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

export const analyticsModule = defineModule<Input, Output>({
  id: 'analytics',
  name: 'Analytics',
  version: '1.0.0',
  description: 'Dashboard with insights on leads, deals, and newsletter performance',
  capabilities: ['data:read'],
  inputSchema,
  outputSchema,

  skills: [
    'analyze_analytics',
    'seo_audit_page',
    'kb_gap_analysis',
    'analyze_chat_feedback',
    'weekly_business_digest',
    'support_get_feedback',
    'competitor_monitor',
  ],

  async publish(input: Input): Promise<Output> {
    return { success: true, message: `Analytics ${input.action} completed` };
  },
});
