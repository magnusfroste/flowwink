import { logger } from '@/lib/logger';
import { defineModule } from '@/lib/module-def';
import type { SkillSeed } from '@/lib/module-bootstrap';
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

const TEMPLATE_SKILLS: SkillSeed[] = [
  {
    name: 'list_templates',
    description:
      'List the starter-template catalog (static JSON in /templates) plus which template (if any) is currently installed on this site. Use when: a user asks "what templates are available?", "what site am I running?", or before installing/switching a template. NOT for: actually installing a template (use the admin UI — install requires interactive image-handling and overwrite review).',
    category: 'system',
    handler: 'module:templates',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_templates',
        description: 'List available templates and the currently installed one.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list'] },
          },
          required: ['action'],
        },
      },
    },
    instructions:
      'Returns { catalog: [...], installed: {...} | null }. Catalog rows have id/name/tagline/category. installed has template_id, template_name, installed_at.',
  },
];

export const templatesModule = defineModule<TemplatesInput, TemplatesOutput>({
  id: 'templates',
  name: 'Templates',
  version: '1.0.0',
  description: 'Template gallery, export current site as reusable template, and import templates from file',
  capabilities: ['data:read', 'data:write'],
  inputSchema: templatesInputSchema,
  outputSchema: templatesOutputSchema,

  skills: ['list_templates'],
  skillSeeds: TEMPLATE_SKILLS,

  async publish(input: TemplatesInput): Promise<TemplatesOutput> {
    logger.log('[TemplatesModule] Action:', input.action);
    return { success: true, templateId: input.templateId };
  },
});
