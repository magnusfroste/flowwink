/**
 * The admin's view of page translation overlays (page_translations), and the
 * skills that write them. Reads go straight to the table (RLS: staff read
 * everything); writes go through agent-execute so the hash stamping, the
 * "fresh units are never rewritten" rule and the publish checks live in ONE
 * place — the same one FlowPilot and the MCP gateway use.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { OverlayHead } from '@/lib/page-translation-state';
import type { OverlayEntry } from '../../supabase/functions/_shared/i18n/translation-units';

export interface OverlayRow extends OverlayHead {
  slug: string | null;
  strings: Record<string, OverlayEntry>;
  translated_at: string | null;
  translated_by: string | null;
}

const ALL_KEY = ['page-translations', 'all'] as const;

/** Every overlay's head row — the pages list and the Languages card. */
const OVERLAY_HEAD_COLUMNS: string = 'page_id, locale, status, coverage, title:strings->"page.title"->>text';

export function usePageOverlays(enabled = true) {
  return useQuery({
    queryKey: ALL_KEY,
    enabled,
    queryFn: async (): Promise<OverlayHead[]> => {
      const { data, error } = await supabase
        .from('page_translations')
        // The title rides along so the list can show a page in the working
        // language. Typed as a plain string: the client's select-string parser
        // recurses forever on a JSON path whose key holds a dot.
        .select(OVERLAY_HEAD_COLUMNS);
      // An instance that has not applied the migration yet has no overlays.
      if (error) {
        if (error.code === '42P01') return [];
        throw error;
      }
      return (data ?? []) as unknown as OverlayHead[];
    },
    staleTime: 30 * 1000,
  });
}

/**
 * One entity's overlays (a product, a category), strings included — the
 * generic table content_translations, which the page view reads through
 * its page_translations view. `entity_id` is the product's id.
 */
export interface EntityOverlayRow extends Omit<OverlayRow, 'page_id'> {
  entity_id: string;
}

export function useEntityOverlayRows(entity: 'product' | 'product_category' | 'product_attribute', entityId: string | undefined) {
  return useQuery({
    queryKey: ['content-translations', entity, entityId],
    enabled: !!entityId,
    queryFn: async (): Promise<EntityOverlayRow[]> => {
      const { data, error } = await supabase
        .from('content_translations')
        .select('entity_id, locale, status, coverage, slug, strings, translated_at, translated_by')
        .eq('entity', entity)
        .eq('entity_id', entityId!);
      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') return [];
        throw error;
      }
      return (data ?? []) as unknown as EntityOverlayRow[];
    },
    staleTime: 10 * 1000,
  });
}

/** The overlays of several rows of one entity kind (a product's variant attributes). */
export function useEntityOverlayRowsMany(entity: 'product_attribute', ids: string[]) {
  const key = [...ids].sort().join(',');
  return useQuery({
    queryKey: ['content-translations', entity, 'many', key],
    enabled: ids.length > 0,
    queryFn: async (): Promise<EntityOverlayRow[]> => {
      const { data, error } = await supabase
        .from('content_translations')
        .select('entity_id, locale, status, coverage, slug, strings, translated_at, translated_by')
        .eq('entity', entity)
        .in('entity_id', ids);
      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') return [];
        throw error;
      }
      return (data ?? []) as unknown as EntityOverlayRow[];
    },
    staleTime: 10 * 1000,
  });
}

/** One page's overlays, strings included — the translation view. */
export function usePageOverlayRows(pageId: string | undefined) {
  return useQuery({
    queryKey: ['page-translations', 'page', pageId],
    enabled: !!pageId,
    queryFn: async (): Promise<OverlayRow[]> => {
      const { data, error } = await supabase
        .from('page_translations')
        .select('page_id, locale, status, coverage, slug, strings, translated_at, translated_by')
        .eq('page_id', pageId!);
      if (error) {
        if (error.code === '42P01') return [];
        throw error;
      }
      return (data ?? []) as unknown as OverlayRow[];
    },
    staleTime: 10 * 1000,
  });
}

export interface SkillResult { success?: boolean; error?: string; status?: string; [k: string]: unknown }

/** Run a translation skill as the admin UI; the result is the skill's own answer. */
export async function runTranslationSkill(skillName: string, args: Record<string, unknown>): Promise<SkillResult> {
  const { data, error } = await supabase.functions.invoke('agent-execute', {
    body: { skill_name: skillName, arguments: args, agent_type: 'admin_ui' },
  });
  if (error) throw new Error(error.message);
  if (data?.status === 'pending_approval') {
    throw new Error('This action needs approval under Approvals before it runs.');
  }
  const result = (data?.result ?? data) as SkillResult;
  if (result && result.success === false) throw new Error(String(result.error ?? 'The skill refused.'));
  return result;
}

export function useTranslationSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ skill, args }: { skill: string; args: Record<string, unknown> }) => runTranslationSkill(skill, args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['page-translations'] });
      queryClient.invalidateQueries({ queryKey: ['content-translations'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product'] });
      queryClient.invalidateQueries({ queryKey: ['product-categories'] });
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      queryClient.invalidateQueries({ queryKey: ['pages'] });
      queryClient.invalidateQueries({ queryKey: ['site-settings', 'site_languages'] });
    },
  });
}
