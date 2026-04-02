import { logger } from '@/lib/logger';
import { z } from 'zod';
import type { ModuleDefinition } from '@/types/module-contracts';

// Templates module doesn't have a publish pipeline — it's config-required
// with export/import capabilities handled by UI hooks.

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

export const templatesModule: ModuleDefinition<TemplatesInput, TemplatesOutput> = {
  id: 'templates',
  name: 'Templates',
  version: '1.0.0',
  description: 'Template gallery, export current site as reusable template, and import templates from file',
  capabilities: ['data:read', 'data:write'],
  inputSchema: templatesInputSchema,
  outputSchema: templatesOutputSchema,

  async publish(input: TemplatesInput): Promise<TemplatesOutput> {
    logger.log('[TemplatesModule] Action:', input.action);
    // Template operations are handled by UI hooks (useTemplateInstaller, useTemplateExport)
    // This module exists for registration, visibility, and dependency tracking.
    return { success: true, templateId: input.templateId };
  },
};
