import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';
import { triggerWebhook } from '@/lib/webhook-utils';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { defineModule } from '@/lib/module-def';
import {
  FormSubmissionModuleInput,
  FormSubmissionModuleOutput,
  formSubmissionModuleInputSchema,
  formSubmissionModuleOutputSchema,
} from '@/types/module-contracts';

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const FORMS_SKILLS: SkillSeed[] = [
  {
    name: 'manage_form_submissions',
    description: 'View and manage form submissions. Use when: reviewing customer inquiries from website forms; processing collected data; deleting spam submissions. NOT for: analyzing feedback sentiment (analyze_chat_feedback); managing leads (manage_leads).',
    category: 'crm',
    handler: 'module:forms',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_form_submissions',
        description: 'View and manage form submissions. Use when: reviewing customer inquiries from website forms; processing collected data; deleting spam submissions. NOT for: analyzing feedback sentiment (analyze_chat_feedback); managing leads (manage_leads).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'list',
                'get',
                'delete',
                'stats',
              ],
            },
            submission_id: {
              type: 'string',
            },
            form_name: {
              type: 'string',
            },
            limit: {
              type: 'number',
            },
          },
          required: [
            'action',
          ],
        },
      },
    },
    instructions: `## manage_form_submissions
### What
Views and manages form submissions from website forms.
### When to use
- Admin asks about form responses
- Lead generation: review contact form submissions
- Analytics: form submission statistics
### Parameters
- **action**: Required. list, get, delete, stats.
- **form_name**: Filter by form name.
### Edge cases
- Form submissions may contain PII — handle with care.
- Stats action returns submission counts by form.`,
  },
  {
    name: 'manage_form',
    description:
      'Inspect website forms and their performance. A form is a Form block on a page (its fields define the form); this reads those definitions. Use when: an operator asks what forms exist, which fields a form has, how many submissions a form got, or its submission→lead conversion. NOT for: reading individual submissions (manage_form_submissions); building/editing a form (that is a page edit via manage_pages — add or change a Form block).',
    category: 'crm',
    handler: 'module:forms',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_form',
        description:
          'List forms across pages (with field counts + submission counts), or get one form by block_id with its field definitions and submission→lead conversion.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'get'], description: 'list = all forms; get = one form by block_id.' },
            block_id: { type: 'string', description: 'Form block id (from list) — required for get.' },
          },
          required: ['action'],
        },
      },
    },
    instructions: `## manage_form
Forms live as Form blocks inside pages (no forms table). This skill reads them.
- Inventory: manage_form(action:"list") → forms with page, field_count, submissions
- Detail: manage_form(action:"get", block_id:"<id>") → field definitions + submission→lead conversion
To CREATE or EDIT a form, edit the page (manage_pages) and add/change a Form block — the block's fields ARE the form.`,
  },
];

export const formsModule = defineModule<FormSubmissionModuleInput, FormSubmissionModuleOutput>({
  id: 'forms',
  name: 'Forms',
  version: '1.0.0',
  processes: ['lead-to-customer'],
  maturity: 'L4',
  description: 'Process form submissions and create leads',
  capabilities: ['content:receive', 'data:write', 'webhook:trigger'],
  tier: 'standard',
  inputSchema: formSubmissionModuleInputSchema,
  outputSchema: formSubmissionModuleOutputSchema,

  skills: [
    'manage_form_submissions',
  ],
  skillSeeds: FORMS_SKILLS,

  webhookEvents: [
    { event: 'form.submitted', description: 'A form was submitted' },
  ],

  async publish(input: FormSubmissionModuleInput): Promise<FormSubmissionModuleOutput> {
    try {
      const validated = formSubmissionModuleInputSchema.parse(input);

      const { data, error } = await supabase
        .from('form_submissions')
        .insert({
          form_name: validated.form_name,
          block_id: validated.block_id,
          data: validated.data as Json,
          page_id: validated.page_id || null,
        })
        .select('id')
        .single();

      if (error) {
        logger.error('[FormsModule] Insert error:', error);
        return { success: false, error: error.message };
      }

      try {
        await triggerWebhook({
          event: 'form.submitted',
          data: { id: data.id, form_name: validated.form_name, source_module: validated.meta?.source_module },
        });
      } catch (webhookError) {
        logger.warn('[FormsModule] Webhook failed:', webhookError);
      }

      return { success: true, id: data.id };
    } catch (error) {
      logger.error('[FormsModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
});
