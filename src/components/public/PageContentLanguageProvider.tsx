/** Provides the page's content language to its blocks — see src/lib/page-content-language.ts. */
import { useMemo, type ReactNode } from 'react';
import { PageContentLanguageContext } from '@/lib/page-content-language';

export function PageContentLanguageProvider({ lang, fallbackUnits, children }: { lang: string | null | undefined; fallbackUnits?: string[] | null; children: ReactNode }) {
  const value = useMemo(
    () => ({ lang: lang ?? null, fallbackUnits: new Set(fallbackUnits ?? []) }),
    [lang, fallbackUnits],
  );
  return <PageContentLanguageContext.Provider value={value}>{children}</PageContentLanguageContext.Provider>;
}
