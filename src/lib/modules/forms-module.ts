import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';
import { triggerWebhook } from '@/lib/webhook-utils';
import {
  ModuleDefinition,
  FormSubmissionModuleInput,
  FormSubmissionModuleOutput,
  formSubmissionModuleInputSchema,
  formSubmissionModuleOutputSchema,
} from '@/types/module-contracts';

export const formsModule: ModuleDefinition<FormSubmissionModuleInput, FormSubmissionModuleOutput> = {
  id: 'forms',
  name: 'Forms',
  version: '1.0.0',
  description: 'Process form submissions and create leads',
  capabilities: ['content:receive', 'data:write', 'webhook:trigger'],
  inputSchema: formSubmissionModuleInputSchema,
  outputSchema: formSubmissionModuleOutputSchema,

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
};
