import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { bootstrapModule } from '@/lib/module-bootstrap';
import { isUnifiedModule, getUnifiedSkillNames } from '@/lib/module-def';
import { useModules } from '@/hooks/useModules';
import type { ModulesSettings } from '@/hooks/useModules';

interface ReBootstrapButtonProps {
  moduleId: string;
  /** Hide entirely if module declares zero skill seeds. */
  hideIfNoSeeds?: boolean;
}

/**
 * Generic per-module re-bootstrap action. Idempotent — safe to run multiple times.
 *
 * Calls `bootstrapModule(moduleId)` which:
 *   - re-runs seedData (reference data)
 *   - re-enables declared skill seeds in agent_skills
 *   - re-seeds skill definitions for unified modules
 *   - re-registers automations (only if FlowPilot module is enabled)
 *
 * Replaces the FlowPilot-specific "Sync Missing Skills" button — every module
 * with a manifest can now be reseeded the same way (reconciliation, expenses,
 * recruitment, …). See mem://accounting/full-record-to-report-skill-coverage.
 */
export function ReBootstrapButton({ moduleId, hideIfNoSeeds = true }: ReBootstrapButtonProps) {
  const [busy, setBusy] = useState(false);
  const { data: modules } = useModules();
  const queryClient = useQueryClient();

  // Skip render if the module has no declared skill seeds and no unified definition.
  if (hideIfNoSeeds && isUnifiedModule(moduleId) && getUnifiedSkillNames(moduleId as keyof ModulesSettings).length === 0) {
    return null;
  }

  const handleClick = async (force = false) => {
    if (!modules) {
      toast.error('Module settings not loaded yet');
      return;
    }
    setBusy(true);
    try {
      const result = await bootstrapModule(moduleId as keyof ModulesSettings, modules, { force, triggeredBy: force ? 'admin-force' : 'admin' });
      if (result.degraded) {
        toast.error(
          `Module is degraded — circuit breaker tripped. Click "Force retry" to override.`,
          {
            action: {
              label: 'Force retry',
              onClick: () => handleClick(true),
            },
          },
        );
      } else if (result.errors.length > 0) {
        toast.error(`Re-bootstrap finished with ${result.errors.length} error(s): ${result.errors[0]}`);
      } else {
        toast.success(
          `Re-bootstrapped ${moduleId} — ${result.seededSkills} skill(s), ${result.seededAutomations} automation(s)`,
        );
      }
      queryClient.invalidateQueries({ queryKey: ['agent-skills'] });
      queryClient.invalidateQueries({ queryKey: ['flowpilot-bootstrap-stats'] });
      queryClient.invalidateQueries({ queryKey: ['bootstrap-runs', moduleId] });
      queryClient.invalidateQueries({ queryKey: ['bootstrap-health', moduleId] });
    } catch (err) {
      logger.error('[ReBootstrap] Failed:', err);
      toast.error('Re-bootstrap failed — check console');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      onClick={() => handleClick(false)}
      disabled={busy}
      variant="outline"
      size="sm"
      className="w-full h-8 text-xs"
    >
      {busy ? (
        <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Re-bootstrapping…</>
      ) : (
        <><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Re-bootstrap module</>
      )}
    </Button>
  );
}
