import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { ContentBlock, Page } from '@/types/cms';

/**
 * A/B testing support for public pages (pages parity: ab_testing).
 *
 * Asks the experiment engine (get_experiment_variant RPC) whether a running
 * experiment exists for the slug. Assignment is deterministic + sticky on the
 * visitor id (same id → same variant, server-side hash), and the call records
 * a unique impression. When the visitor lands in bucket B the variant page's
 * content is returned and rendered in place of the control content.
 *
 * Conversions: FormBlock dispatches `fw:experiment-conversion` on successful
 * submit; the listener below reports it for the visitor's assigned variant.
 */

// Same persistent visitor id the page-view tracker uses.
export function getVisitorId(): string {
  const key = 'pez_visitor_id';
  let visitorId = localStorage.getItem(key);
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem(key, visitorId);
  }
  return visitorId;
}

interface ExperimentVariant {
  active: boolean;
  experiment_id?: string;
  variant?: 'a' | 'b';
  content_json?: ContentBlock[];
  title?: string;
  meta_json?: Page['meta_json'];
}

export function usePageExperiment(pageSlug: string, enabled: boolean) {
  const { data } = useQuery({
    queryKey: ['page-experiment', pageSlug],
    queryFn: async (): Promise<ExperimentVariant> => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await supabase.rpc('get_experiment_variant' as any, {
          p_slug: pageSlug,
          p_visitor_id: getVisitorId(),
        });
        if (error) {
          logger.log('[usePageExperiment] rpc error (ignored):', error.message);
          return { active: false };
        }
        return (data ?? { active: false }) as unknown as ExperimentVariant;
      } catch (e) {
        logger.log('[usePageExperiment] unavailable (ignored):', e);
        return { active: false };
      }
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Report conversions (fired by FormBlock on successful submit) while an
  // experiment is active on this page.
  useEffect(() => {
    if (!data?.active) return;
    const onConversion = () => {
      supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .rpc('record_experiment_conversion' as any, {
          p_slug: pageSlug,
          p_visitor_id: getVisitorId(),
        })
        .then(({ error }) => {
          if (error) logger.log('[usePageExperiment] conversion error (ignored):', error.message);
        });
    };
    window.addEventListener('fw:experiment-conversion', onConversion);
    return () => window.removeEventListener('fw:experiment-conversion', onConversion);
  }, [data?.active, pageSlug]);

  if (data?.active && data.variant === 'b' && Array.isArray(data.content_json)) {
    return {
      isVariant: true as const,
      content: data.content_json,
      title: data.title,
      meta: data.meta_json,
    };
  }
  return { isVariant: false as const };
}
