import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { updateLeadStatus } from '@/lib/lead-utils';
import {
  ModuleDefinition,
  DealModuleInput,
  DealModuleOutput,
  dealModuleInputSchema,
  dealModuleOutputSchema,
} from '@/types/module-contracts';

export const dealsModule: ModuleDefinition<DealModuleInput, DealModuleOutput> = {
  id: 'deals',
  name: 'Deals',
  version: '1.0.0',
  description: 'Create and manage sales deals/opportunities',
  capabilities: ['content:receive', 'data:write', 'webhook:trigger'],
  inputSchema: dealModuleInputSchema,
  outputSchema: dealModuleOutputSchema,

  async publish(input: DealModuleInput): Promise<DealModuleOutput> {
    try {
      const validated = dealModuleInputSchema.parse(input);

      const dealData: {
        lead_id: string; value_cents: number; currency: string;
        stage: 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';
        product_id: string | null; expected_close: string | null; notes: string | null;
      } = {
        lead_id: validated.lead_id,
        value_cents: validated.value_cents,
        currency: validated.currency,
        stage: validated.stage,
        product_id: validated.product_id || null,
        expected_close: validated.expected_close || null,
        notes: validated.notes || null,
      };

      const { data, error } = await supabase
        .from('deals')
        .insert(dealData)
        .select('id, stage, value_cents')
        .single();

      if (error) {
        logger.error('[DealsModule] Insert error:', error);
        return { success: false, error: error.message };
      }

      try {
        await updateLeadStatus(validated.lead_id, 'opportunity', { onlyIfCurrentStatus: 'lead' });
      } catch (updateError) {
        logger.warn('[DealsModule] Lead status update failed:', updateError);
      }

      return { success: true, id: data.id, stage: data.stage, value_cents: data.value_cents };
    } catch (error) {
      logger.error('[DealsModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
};
