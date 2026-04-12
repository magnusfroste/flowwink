import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';
import { defineModule } from '@/lib/module-def';
import {
  FederationPeerInput,
  FederationPeerOutput,
  federationPeerInputSchema,
  federationPeerOutputSchema,
} from '@/types/module-contracts';

export const federationModule = defineModule<FederationPeerInput, FederationPeerOutput>({
  id: 'federation',
  name: 'Federation',
  version: '1.0.0',
  description: 'Agent-to-Agent protocol — register and manage peer connections',
  capabilities: ['data:read', 'data:write'],
  inputSchema: federationPeerInputSchema,
  outputSchema: federationPeerOutputSchema,

  skills: [
    'a2a_chat',
    'a2a_request',
    'openclaw_start_session',
    'openclaw_end_session',
    'openclaw_report_finding',
    'openclaw_exchange',
    'openclaw_get_status',
    'queue_beta_test',
    'resolve_finding',
    'scan_beta_findings',
  ],

  async publish(input: FederationPeerInput): Promise<FederationPeerOutput> {
    try {
      const validated = federationPeerInputSchema.parse(input);

      const { data, error } = await supabase
        .from('a2a_peers')
        .insert([{
          name: validated.name,
          url: validated.url,
          outbound_token: validated.outbound_token || '',
          capabilities: (validated.capabilities || {}) as Json,
          status: 'paused' as const,
        }])
        .select('id, name, status')
        .single();

      if (error) throw error;

      logger.log(`[FederationModule] Peer registered: ${data.id}`);

      return {
        success: true,
        peer_id: data.id,
        name: data.name,
        status: data.status,
      };
    } catch (err) {
      logger.error('[FederationModule] Failed to register peer:', err);
      return {
        success: false,
        peer_id: '',
        name: input.name,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  },
});
