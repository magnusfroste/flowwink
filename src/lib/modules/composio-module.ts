import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import type {
  ModuleDefinition,
} from '@/types/module-contracts';
import {
  composioActionInputSchema,
  composioActionOutputSchema,
  type ComposioActionInput,
  type ComposioActionOutput,
} from '@/types/module-contracts';

export const composioModule: ModuleDefinition<ComposioActionInput, ComposioActionOutput> = {
  id: 'composio',
  name: 'Composio',
  version: '1.0.0',
  description: 'Connect to 1000+ external apps via managed OAuth and intent-based tool resolution',
  capabilities: ['data:read', 'data:write', 'webhook:trigger'],
  inputSchema: composioActionInputSchema,
  outputSchema: composioActionOutputSchema,

  async publish(input: ComposioActionInput): Promise<ComposioActionOutput> {
    try {
      const validated = composioActionInputSchema.parse(input);

      const { data, error } = await supabase.functions.invoke('composio-proxy', {
        body: validated,
      });

      if (error) throw error;

      logger.log(`[ComposioModule] Action executed: ${validated.action}`);

      return {
        success: true,
        action: validated.action,
        result: data?.result ?? null,
      };
    } catch (err) {
      logger.error('[ComposioModule] Failed:', err);
      return {
        success: false,
        action: input.action,
        result: null,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  },
};
