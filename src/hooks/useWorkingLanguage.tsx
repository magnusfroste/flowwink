import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePlatformLocaleSettings } from '@/hooks/useSiteSettings';
import { logger } from '@/lib/logger';

const STORAGE_KEY = 'flowwink.admin.workingLanguage';

/**
 * Which language the editor is working in right now.
 *
 * A page per language is the right storage model — it is what gives each
 * language its own URL, which is the whole reason to publish a translation at
 * all. But it made the admin list grow from twelve rows to nineteen, and a
 * third language would have made it thirty-six. That is the model leaking into
 * a surface it has no business being in.
 *
 * So the editor picks a language once, for the whole session, the way a
 * translator actually works: today I am doing the English pass. The list then
 * shows one row per page again, in that language.
 *
 * The choice is remembered per browser. It is deliberately NOT stored on the
 * server: it is a property of the person editing, not of the site.
 */
export function useWorkingLanguage() {
  const { data: platformLocale } = usePlatformLocaleSettings();
  const siteLang = (platformLocale?.default_locale ?? 'en').toLowerCase().split('-')[0];

  // Every language that actually has pages. A site with one language never
  // sees the control at all — a switch that offers no choice is clutter.
  const { data: languages = [] } = useQuery({
    queryKey: ['admin-page-languages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pages')
        .select('locale, translation_group_id')
        .is('deleted_at', null)
        .not('translation_group_id', 'is', null);
      if (error) throw error;
      const found = new Set<string>();
      for (const row of data ?? []) {
        if (row.locale) found.add(String(row.locale).toLowerCase());
      }
      return [...found].sort();
    },
    staleTime: 1000 * 60 * 5,
  });

  const [lang, setLangState] = useState<string | null>(null);

  // Read once the site language is known, so an unset preference lands on the
  // language the operator actually writes in rather than on 'en'.
  useEffect(() => {
    if (lang !== null) return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      logger.warn('[working-language] localStorage unavailable, using the site language', err);
    }
    setLangState(stored || siteLang);
  }, [lang, siteLang]);

  const setLang = useCallback((next: string) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch (err) {
      logger.warn('[working-language] could not remember the choice', err);
    }
  }, []);

  return {
    /** null until the site language has loaded. */
    lang: lang ?? siteLang,
    setLang,
    /** Languages that have pages. Fewer than two means: do not offer a choice. */
    languages: languages.length > 1 ? languages : [],
    siteLang,
  };
}
