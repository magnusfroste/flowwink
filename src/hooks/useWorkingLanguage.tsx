import { useCallback, useEffect, useState } from 'react';
import { useSiteLanguages } from '@/hooks/useSiteSettings';
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
  // Declared, not inferred. Scanning pages for locales made adding a language
  // a side effect of creating a page; the set now says what the site publishes.
  const { defaultLanguage: siteLang, languages: declared, isMultilingual } = useSiteLanguages();

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
    /** Fewer than two means: do not offer a choice. */
    languages: isMultilingual ? declared : [],
    siteLang,
  };
}
