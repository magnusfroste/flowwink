import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { useModules } from '@/hooks/useModules';
import { bootstrapModule } from '@/lib/module-bootstrap';

/**
 * useFlowPilotBootstrap
 *
 * After the modular refactor, FlowPilot's init is owned by the module system:
 *   - Toggle FlowPilot module ON in /admin/modules → bootstrapModule('flowpilot')
 *     seeds soul, identity, agents-rules, tool_policy, starter objectives,
 *     core skills, and the weekly digest automation.
 *
 * This hook now serves as a SAFETY NET only: if FlowPilot is enabled but soul
 * is missing (e.g. partial install, manual DB edit), it triggers a re-bootstrap
 * of the module. No more calls to the legacy setup-flowpilot edge function from here.
 */
export function useFlowPilotBootstrap() {
  const hasTriggered = useRef(false);
  const queryClient = useQueryClient();
  const { data: modules } = useModules();
  const isFlowPilotEnabled = modules?.flowpilot?.enabled ?? false;

  const repair = useMutation({
    mutationFn: async () => {
      logger.log('[FlowPilotBootstrap] Soul missing for enabled FlowPilot — running module bootstrap to repair…');
      if (!modules) throw new Error('Modules settings not loaded');
      const result = await bootstrapModule('flowpilot', modules);
      logger.log('[FlowPilotBootstrap] Repair complete:', result);

      // Fire an initial heartbeat so objectives get decomposed quickly
      try {
        await supabase.functions.invoke('flowpilot-heartbeat', {
          body: { time: new Date().toISOString(), trigger: 'auto-repair' },
        });
      } catch (hbError) {
        logger.warn('[FlowPilotBootstrap] Initial heartbeat failed (non-fatal):', hbError);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-skills'] });
      queryClient.invalidateQueries({ queryKey: ['agent-objectives'] });
      queryClient.invalidateQueries({ queryKey: ['agent-automations'] });
      queryClient.invalidateQueries({ queryKey: ['agent-memory'] });
    },
    onError: (error) => {
      logger.error('[FlowPilotBootstrap] Repair failed:', error);
    },
  });

  useEffect(() => {
    if (!isFlowPilotEnabled || !modules || hasTriggered.current) return;

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('agent_memory')
        .select('id')
        .eq('key', 'soul')
        .maybeSingle();
      if (cancelled || error) return;
      if (!data) {
        hasTriggered.current = true;
        repair.mutate();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isFlowPilotEnabled, modules]);
}
