import { useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { moduleRegistry } from '@/lib/module-registry';
import { useModuleReadiness } from '@/hooks/useModuleReadiness';
import type { ModulesSettings } from '@/hooks/useModules';

/**
 * Hook that wraps moduleRegistry.publish() with automatic
 * pre-flight integration checks.
 *
 * Usage:
 *   const { publish, preflight, readiness } = useModulePublish('newsletter');
 *   
 *   // Quick check without publishing
 *   const check = preflight();
 *   if (!check.ok) console.log(check.missing);
 *   
 *   // Publish with automatic pre-flight
 *   const result = await publish({ subject: '...', content_html: '...' });
 */
export function useModulePublish<TInput = unknown, TOutput = unknown>(
  moduleId: keyof ModulesSettings
) {
  const readiness = useModuleReadiness(moduleId);
  const { toast } = useToast();

  const preflight = useCallback(() => {
    return moduleRegistry.preflight(moduleId, readiness);
  }, [moduleId, readiness]);

  const publish = useCallback(
    async (input: TInput): Promise<TOutput | null> => {
      const check = moduleRegistry.preflight(moduleId, readiness);
      if (check.ok === false) {
        toast({
          title: 'Missing integrations',
          description: check.error,
          variant: 'destructive',
        });
        return null;
      }

      return moduleRegistry.publish<TInput, TOutput>(moduleId, input, readiness);
    },
    [moduleId, readiness, toast]
  );

  return { publish, preflight, readiness };
}
