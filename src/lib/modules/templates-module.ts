import { logger } from '@/lib/logger';
import { defineModule } from '@/lib/module-def';
import { z } from 'zod';

const templatesInputSchema = z.object({
  action: z.enum(['export', 'import', 'install']),
  templateId: z.string().optional(),
  meta: z.record(z.unknown()).optional(),
});

const templatesOutputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  templateId: z.string().optional(),
});

type TemplatesInput = z.infer<typeof templatesInputSchema>;
type TemplatesOutput = z.infer<typeof templatesOutputSchema>;

export const templatesModule = defineModule<TemplatesInput, TemplatesOutput>({
  id: 'templates',
  name: 'Templates',
  version: '1.0.0',
  description: 'Template gallery, export current site as reusable template, and import templates from file',
  capabilities: ['data:read', 'data:write'],
  inputSchema: templatesInputSchema,
  outputSchema: templatesOutputSchema,

  skills: [],

  async publish(input: TemplatesInput): Promise<TemplatesOutput> {
    logger.log('[TemplatesModule] Action:', input.action);
    return { success: true, templateId: input.templateId };
  },
});
