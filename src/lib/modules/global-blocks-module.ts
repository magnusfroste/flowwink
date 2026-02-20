import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';
import {
  ModuleDefinition,
  GlobalBlockModuleInput,
  GlobalBlockModuleOutput,
  globalBlockModuleInputSchema,
  globalBlockModuleOutputSchema,
} from '@/types/module-contracts';

export const globalBlocksModule: ModuleDefinition<GlobalBlockModuleInput, GlobalBlockModuleOutput> = {
  id: 'global-blocks',
  name: 'Global Blocks',
  version: '1.0.0',
  description: 'Create reusable global content blocks (header, footer, etc.)',
  capabilities: ['content:receive', 'data:write'],
  inputSchema: globalBlockModuleInputSchema,
  outputSchema: globalBlockModuleOutputSchema,

  async publish(input: GlobalBlockModuleInput): Promise<GlobalBlockModuleOutput> {
    try {
      const validated = globalBlockModuleInputSchema.parse(input);

      const { data, error } = await supabase
        .from('global_blocks')
        .insert({ slot: validated.slot, type: validated.type, data: validated.data as Json, is_active: validated.is_active })
        .select('id, slot, type')
        .single();

      if (error) {
        logger.error('[GlobalBlocksModule] Insert error:', error);
        return { success: false, error: error.message };
      }

      return { success: true, id: data.id, slot: data.slot, type: data.type };
    } catch (error) {
      logger.error('[GlobalBlocksModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
};
