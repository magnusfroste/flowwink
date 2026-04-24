import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  DEFAULT_LOCALE_ID,
  getPack,
  setActivePackId,
  onActivePackChange,
  ACTIVE_PACK_STORAGE_KEY,
} from '@/lib/locale-packs';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

const SETTING_KEY = 'accounting_locale';

/**
 * Tenant-level active locale pack, persisted in site_settings (key/value).
 * Falls back to localStorage / DEFAULT_LOCALE_ID when not set.
 *
 * Switching the active pack:
 *   1. Persists the new id to site_settings (tenant-wide).
 *   2. Calls setActivePackId() which updates localStorage and broadcasts
 *      the ACTIVE_PACK_EVENT — LocalePackProvider listens and invalidates
 *      every accounting-related query so the UI refetches automatically.
 *   3. Lazily seeds the new pack's chart of accounts + templates if missing.
 */
export function useTenantLocalePack() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: activeId, isLoading } = useQuery({
    queryKey: ['site-settings', SETTING_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', SETTING_KEY)
        .maybeSingle();
      if (error) throw error;
      const v = (data?.value as any);
      const id =
        (typeof v === 'string' ? v : v?.id) ||
        (typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_PACK_STORAGE_KEY) : null) ||
        DEFAULT_LOCALE_ID;
      // Mirror server value into the local registry cache so synchronous
      // getActivePack() calls (modules, AI instructions) match the server.
      if (typeof window !== 'undefined' && localStorage.getItem(ACTIVE_PACK_STORAGE_KEY) !== id) {
        setActivePackId(id);
      }
      return id as string;
    },
  });

  // Re-sync when another tab / component changes the active pack.
  useEffect(() => {
    return onActivePackChange(() => {
      qc.invalidateQueries({ queryKey: ['site-settings', SETTING_KEY] });
    });
  }, [qc]);

  const setActive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('site_settings')
        .upsert({ key: SETTING_KEY, value: { id } as any }, { onConflict: 'key' });
      if (error) throw error;

      // Broadcast first so subscribers (LocalePackProvider, AI module
      // instructions) pick up the new pack before we kick off seeding.
      setActivePackId(id);

      // Lazily seed chart + templates for the new pack if not present.
      // Errors here are non-fatal — UI will show empty until retried.
      try {
        const pack = getPack(id);
        const { count: accCount } = await supabase
          .from('chart_of_accounts')
          .select('id', { count: 'exact', head: true })
          .eq('locale', pack.id);
        if ((accCount ?? 0) === 0 && pack.chart.length > 0) {
          const accounts = pack.chart.map((a) => ({ ...a, locale: pack.id }));
          for (let i = 0; i < accounts.length; i += 50) {
            const { error: insertErr } = await supabase
              .from('chart_of_accounts')
              .insert(accounts.slice(i, i + 50));
            if (insertErr) throw insertErr;
          }
        }
        const { count: tplCount } = await supabase
          .from('accounting_templates')
          .select('id', { count: 'exact', head: true })
          .eq('locale', pack.id);
        if ((tplCount ?? 0) === 0 && pack.templates.length > 0) {
          const templates = pack.templates.map((t) => ({
            ...t,
            locale: pack.id,
            is_system: t.is_system ?? true,
            template_lines: t.template_lines as any,
          })) as any[];
          for (let i = 0; i < templates.length; i += 20) {
            const { error: insertErr } = await supabase
              .from('accounting_templates')
              .insert(templates.slice(i, i + 20));
            if (insertErr) throw insertErr;
          }
        }
      } catch (seedErr) {
        logger.warn('[locale-pack] seed failed', seedErr);
      }

      return id;
    },
    onSuccess: (id) => {
      // Provider already invalidates cache via the broadcast event,
      // but we explicitly bump the settings key for the toast to feel snappy.
      qc.invalidateQueries({ queryKey: ['site-settings', SETTING_KEY] });
      toast({
        title: 'Active locale pack updated',
        description: `${getPack(id).label} — accounting modules refreshed`,
      });
    },
    onError: (err: any) => {
      toast({ title: 'Failed to update', description: err.message, variant: 'destructive' });
    },
  });

  return {
    activeId: activeId ?? DEFAULT_LOCALE_ID,
    activePack: getPack(activeId),
    isLoading,
    setActive: setActive.mutate,
    isSaving: setActive.isPending,
  };
}
