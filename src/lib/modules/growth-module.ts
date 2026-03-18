import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import {
  ModuleDefinition,
  GrowthCampaignInput,
  GrowthCampaignOutput,
  growthCampaignInputSchema,
  growthCampaignOutputSchema,
} from '@/types/module-contracts';

export const growthModule: ModuleDefinition<GrowthCampaignInput, GrowthCampaignOutput> = {
  id: 'paidGrowth',
  name: 'Paid Growth',
  version: '1.0.0',
  description: 'Manage ad campaigns and track paid growth performance',
  capabilities: ['data:read', 'data:write'],
  inputSchema: growthCampaignInputSchema,
  outputSchema: growthCampaignOutputSchema,

  async publish(input: GrowthCampaignInput): Promise<GrowthCampaignOutput> {
    try {
      const validated = growthCampaignInputSchema.parse(input);

      const insertData = {
        name: validated.name,
        platform: validated.platform,
        objective: validated.objective || null,
        budget_cents: validated.budget_cents,
        currency: validated.currency || 'SEK',
        target_audience: validated.target_audience || {} as Record<string, unknown>,
        status: 'draft' as const,
      };

      const { data, error } = await supabase
        .from('ad_campaigns')
        .insert([insertData])
        .select('id, name, status')
        .single();

      if (error) throw error;

      logger.log(`[GrowthModule] Campaign created: ${data.id}`);

      return {
        success: true,
        campaign_id: data.id,
        name: data.name,
        status: data.status,
      };
    } catch (err) {
      logger.error('[GrowthModule] Failed to create campaign:', err);
      return {
        success: false,
        campaign_id: '',
        name: input.name,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  },
};
