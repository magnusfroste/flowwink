import { pickLocale } from '@/lib/pick-locale';

/**
 * The terms a visitor reading `lang` is shown: one version per kind
 * (contract_type), in that language — exact → same language → the site's → any.
 */
export function pickTermsInLanguage<T extends { contract_type?: string | null; language?: string | null; id: string }>(
  rows: T[],
  lang: string,
  siteLang: string,
): T[] {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    // Terms without a kind are each their own group — never merged away.
    const key = r.contract_type ? `type:${r.contract_type}` : `id:${r.id}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()].map((versions) => {
    if (versions.length === 1) return versions[0];
    const chosen = pickLocale({ available: versions.map((v) => String(v.language ?? '')), wanted: lang, fallback: siteLang });
    return versions.find((v) => String(v.language ?? '') === chosen) ?? versions[0];
  });
}
