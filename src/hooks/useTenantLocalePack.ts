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

// Top-up guard — run the missing-template check once per session, not per render.
let topUpDoneFor: string | null = null;

/**
 * Seed any pack templates missing on this instance (by template_name+locale).
 * Runs on admin boot AND on pack switch, so template-library releases reach
 * existing instances without a pack switch. User templates + usage_count on
 * existing rows are untouched. Chart accounts are topped up the same way.
 */
export async function topUpLocalePackSeeds(packId: string): Promise<void> {
  const pack = getPack(packId);

  // Chart accounts: insert missing codes only.
  if (pack.chart.length > 0) {
    const { data: existingAcc } = await supabase
      .from('chart_of_accounts')
      .select('account_code')
      .eq('locale', pack.id);
    const haveCodes = new Set((existingAcc ?? []).map((r) => r.account_code));
    const missingAcc = pack.chart
      .filter((a: any) => !haveCodes.has(a.account_code))
      .map((a: any) => ({ ...a, locale: pack.id }));
    for (let i = 0; i < missingAcc.length; i += 50) {
      const { error } = await supabase.from('chart_of_accounts').insert(missingAcc.slice(i, i + 50));
      if (error) throw error;
    }
    if (missingAcc.length > 0) logger.log(`[locale-pack] seeded ${missingAcc.length} new accounts for ${pack.id}`);
  }

  // Templates: insert missing system templates only.
  if (pack.templates.length > 0) {
    const { data: existingTpls } = await supabase
      .from('accounting_templates')
      .select('template_name')
      .eq('locale', pack.id);
    const have = new Set((existingTpls ?? []).map((r) => r.template_name));
    const missing = pack.templates
      .filter((t) => !have.has(t.template_name))
      .map((t) => ({
        ...t,
        locale: pack.id,
        is_system: t.is_system ?? true,
        template_lines: t.template_lines as any,
      })) as any[];
    for (let i = 0; i < missing.length; i += 20) {
      const { error } = await supabase.from('accounting_templates').insert(missing.slice(i, i + 20));
      if (error) throw error;
    }
    if (missing.length > 0) logger.log(`[locale-pack] seeded ${missing.length} new accounting templates for ${pack.id}`);
  }
}

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

  // Boot-time top-up: when the template library grows in a release, seed the
  // missing templates/accounts for the already-active pack (once per session).
  //
  // This is why useLocalePackBootstrap() exists — for a long time this hook was
  // only mounted on two admin pages, so "boot-time" meant "if an admin happens
  // to open Accounting → Settings". A fresh install where nobody did was left
  // with a near-empty chart of accounts while the RPCs kept posting to their
  // hardcoded defaults (1930, 2890, 3970, 7970).
  useEffect(() => {
    if (!activeId || topUpDoneFor === activeId) return;
    topUpDoneFor = activeId;
    topUpLocalePackSeeds(activeId).catch((err) => {
      // logger.error, not warn: warn is stripped in production, and a failure
      // here leaves the books unusable in a way nothing else reports.
      logger.error('[locale-pack] boot top-up failed', err);
      // Let the next admin page load retry instead of latching the guard.
      topUpDoneFor = null;
    });
  }, [activeId]);

  const setActive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('site_settings')
        .upsert({ key: SETTING_KEY, value: { id } as any }, { onConflict: 'key' });
      if (error) throw error;

      // Broadcast first so subscribers (LocalePackProvider, AI module
      // instructions) pick up the new pack before we kick off seeding.
      setActivePackId(id);

      // Lazily seed missing chart accounts + templates for the new pack.
      // Errors here are non-fatal — UI will show empty until retried.
      try {
        await topUpLocalePackSeeds(id);
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

/**
 * Seed the active pack's chart of accounts + templates on the first admin
 * session (idempotent — inserts missing codes only). Mount in AdminLayout,
 * next to useFlowPilotBootstrap, so EVERY admin page load tops the instance up
 * rather than only the two pages that happened to consume the pack.
 *
 * Purpose-named wrapper: the call site should read as "bootstrap", not as an
 * unused return value. React Query dedupes the underlying settings query with
 * the real consumers, so mounting both costs nothing.
 */
export function useLocalePackBootstrap(): void {
  useTenantLocalePack();
}
