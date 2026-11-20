// The real dependencies of translate_site (the logic is translate-site.ts).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleEnableLanguage, handleListStaleTranslations, siteLanguages } from './page-translations.ts';
import { handleTranslateContent } from './translate-content.ts';
import { handleTranslateUiText, type UiTextCatalog } from './translate-ui-text.ts';
import { PLATFORM_UI_TEXT } from '../locale/ui-text.ts';
import { runTranslateSite, SWEEP_KEY, type StaleFinding, type SweepState, type TranslateSiteArgs } from './translate-site.ts';

export async function handleTranslateSite(
  supabase: SupabaseClient,
  args: TranslateSiteArgs,
  catalog: UiTextCatalog,
): Promise<Record<string, unknown>> {
  return runTranslateSite(args, {
    languages: () => siteLanguages(supabase),
    enableLanguage: (locale) => handleEnableLanguage(supabase, { locale }) as Promise<{ success?: boolean; error?: string }>,
    listStale: (locale) => handleListStaleTranslations(supabase, { locale, limit: 1 }) as Promise<{ success?: boolean; error?: string; stale?: StaleFinding[] }>,
    translateItem: (f, locale) => handleTranslateContent(supabase, {
      entity: f.entity, id: f.id, slug: f.id ? undefined : f.slug, locale, publish: true,
    }) as Promise<{ success?: boolean; error?: string }>,
    translateUi: (locale) => handleTranslateUiText(supabase, { locale }, catalog) as Promise<{ success?: boolean; error?: string; translated?: number }>,
    platformSpeaks: (locale) => !!PLATFORM_UI_TEXT[locale.split('-')[0]],
    readState: async () => {
      const { data, error } = await supabase.from('site_settings').select('value').eq('key', SWEEP_KEY).maybeSingle();
      if (error) throw new Error(`${SWEEP_KEY} read failed: ${error.message}`);
      return ((data?.value ?? {}) as SweepState);
    },
    writeState: async (state) => {
      const { error } = await supabase.from('site_settings').upsert({ key: SWEEP_KEY, value: state }, { onConflict: 'key' });
      if (error) throw new Error(`${SWEEP_KEY} write failed: ${error.message}`);
    },
    now: () => Date.now(),
  });
}
