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

  // Chart accounts: top up against the CONSTRAINT, never against a read.
  //
  // This asked the table which codes it already had, then inserted the
  // difference. PostgREST caps an unfiltered select at 1000 rows and reports
  // nothing; se-bas2024 ships 1262 accounts, so the read could not see the
  // last 262 — they looked missing on every top-up, the insert hit
  // chart_of_accounts_locale_code_key, and `throw error` aborted the rest of
  // the function, taking the template top-up below with it. The unique
  // constraint protected the data; nothing protected the run.
  //
  // Read-and-filter is removed rather than paginated. ON CONFLICT DO NOTHING
  // against the real constraint UNIQUE (locale, account_code) cannot be
  // truncated, has no read→write window, leaves existing rows (and any
  // operator edits to their names) untouched, and is idempotent by
  // construction — which is what "top up" was always trying to be.
  if (pack.chart.length > 0) {
    const rows = pack.chart.map((a: any) => ({ ...a, locale: pack.id }));
    for (let i = 0; i < rows.length; i += 50) {
      const { error } = await supabase.from('chart_of_accounts')
        .upsert(rows.slice(i, i + 50), {
          onConflict: 'locale,account_code',
          ignoreDuplicates: true,
        });
      if (error) throw error;
    }
    logger.log(`[locale-pack] topped up ${rows.length} pack accounts for ${pack.id}`);
  }

  // Fiscal positions: which VAT treatment applies to which counterparty. Same
  // rail as the chart — upsert against the real constraint, never against a
  // read, so a pack release reaches existing instances without a pack switch.
  const positions = (pack.vat as { positions?: unknown[] }).positions ?? [];
  if (positions.length > 0) {
    // Casten är medveten: de genererade typerna byggs ur en LEVANDE databas, och
    // en tabell som just fötts i en migration finns inte där förrän någon
    // regenererar dem. Samma sak gäller partners. Alternativet vore att vänta
    // med rälsen tills typerna hunnit ikapp — då når paketets positioner ingen.
    const { error } = await (supabase.from('fiscal_positions' as never) as any)
      .upsert(
        positions.map((p: any) => ({
          locale: pack.id,
          position_id: p.id,
          label: p.label,
          note: p.note,
          country_codes: p.country_codes,
          vat_required: p.vat_required,
          override_rate: p.override_rate,
          sequence: p.sequence,
        })),
        { onConflict: 'locale,position_id', ignoreDuplicates: true },
      );
    if (error) throw error;
    logger.log(`[locale-pack] topped up ${positions.length} fiscal positions for ${pack.id}`);
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

  // `chosenId` is the tenant's EXPLICIT choice — null until an admin (or the
  // install script) activates a pack. Display falls back to DEFAULT_LOCALE_ID
  // so currency formatting etc. stays sane, but SEEDING keys off chosenId:
  // empty-until-chosen. FlowWink is a generic BOS; a German instance must not
  // wake up with 263 Swedish accounts because nobody had picked yet.
  const { data: chosenId, isLoading } = useQuery({
    queryKey: ['site-settings', SETTING_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', SETTING_KEY)
        .maybeSingle();
      if (error) throw error;
      const v = (data?.value as any);
      const id = (typeof v === 'string' ? v : v?.id) || null;
      // Mirror server value into the local registry cache so synchronous
      // getActivePack() calls (modules, AI instructions) match the server.
      const effective = id ?? DEFAULT_LOCALE_ID;
      if (typeof window !== 'undefined' && localStorage.getItem(ACTIVE_PACK_STORAGE_KEY) !== effective) {
        setActivePackId(effective);
      }
      return id as string | null;
    },
  });
  const activeId = chosenId ?? DEFAULT_LOCALE_ID;

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
    // chosenId, not activeId: seeding requires an EXPLICIT activation. Before
    // that, the correct chart is the empty one — bookkeeping refuses loudly
    // (account_for raises) instead of silently filling a German instance with
    // Swedish accounts.
    if (!chosenId || topUpDoneFor === chosenId) return;
    topUpDoneFor = chosenId;
    topUpLocalePackSeeds(chosenId).catch((err) => {
      // logger.error, not warn: warn is stripped in production, and a failure
      // here leaves the books unusable in a way nothing else reports.
      logger.error('[locale-pack] boot top-up failed', err);
      // Let the next admin page load retry instead of latching the guard.
      topUpDoneFor = null;
    });
  }, [chosenId]);

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
    activeId,
    activePack: getPack(activeId),
    /** null until an admin activates a pack — the UI should say so. */
    chosenId: chosenId ?? null,
    hasChosen: chosenId != null,
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
