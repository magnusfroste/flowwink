import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { triggerWebhook } from '@/lib/webhook-utils';
import {
  ModuleDefinition,
  CRMLeadInput,
  CRMLeadOutput,
  crmLeadInputSchema,
  crmLeadOutputSchema,
} from '@/types/module-contracts';

export const crmModule: ModuleDefinition<CRMLeadInput, CRMLeadOutput> = {
  id: 'crm',
  name: 'CRM',
  version: '1.0.0',
  description: 'Create and manage leads',
  capabilities: ['content:receive', 'data:write', 'webhook:trigger'],
  inputSchema: crmLeadInputSchema,
  outputSchema: crmLeadOutputSchema,

  async publish(input: CRMLeadInput): Promise<CRMLeadOutput> {
    try {
      const validated = crmLeadInputSchema.parse(input);

      const { data: existingLead } = await supabase
        .from('leads')
        .select('id, score, status')
        .eq('email', validated.email)
        .maybeSingle();

      if (existingLead) {
        const newScore = (existingLead.score || 0) + (validated.initial_score || 5);
        await supabase
          .from('leads')
          .update({ score: newScore, updated_at: new Date().toISOString() })
          .eq('id', existingLead.id);

        return { success: true, lead_id: existingLead.id, is_new: false, score: newScore, status: existingLead.status };
      }

      const leadData: {
        email: string; name: string | null; phone: string | null;
        source: string; source_id: string | null; score: number; status: 'lead';
      } = {
        email: validated.email,
        name: validated.name || null,
        phone: validated.phone || null,
        source: validated.source,
        source_id: validated.source_id || null,
        score: validated.initial_score || 10,
        status: 'lead',
      };

      const { data, error } = await supabase
        .from('leads')
        .insert(leadData)
        .select('id, score, status')
        .single();

      if (error) {
        logger.error('[CRMModule] Insert error:', error);
        return { success: false, error: error.message };
      }

      try {
        await triggerWebhook({
          event: 'form.submitted',
          data: { type: 'lead_created', id: data.id, email: validated.email, source: validated.source, source_module: validated.meta?.source_module },
        });
      } catch (webhookError) {
        logger.warn('[CRMModule] Webhook trigger failed:', webhookError);
      }

      return { success: true, lead_id: data.id, is_new: true, score: data.score, status: data.status };
    } catch (error) {
      logger.error('[CRMModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
};
