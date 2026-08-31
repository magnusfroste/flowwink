/**
 * Which version to show, given what exists and what was asked for.
 *
 * FlowWink now answers that question in four places — the visitor's page, the
 * admin's working language, the `ui_text` pack, and next the email template
 * chosen for a recipient. Each had started to grow its own spelling of the same
 * ladder, which is how three implementations become three behaviours.
 *
 * The ladder, once:
 *
 *   1. the exact tag            'sv-SE' answers 'sv-SE'
 *   2. the same language        'sv' answers 'sv-SE', and 'en-GB' answers 'en'
 *   3. the site's default       whatever the operator declared
 *   4. nothing                  the caller decides what an absence means
 *
 * Step 4 is deliberate. A page with no version in the wanted language must not
 * silently become another language; a string with no translation must fall to
 * the English in the code. Those are different answers to the same absence, so
 * this function reports it rather than choosing.
 *
 * The twin `public.pick_locale()` in SQL follows the same ladder for the parts
 * that resolve on the server. Change one, change both — the guardrail in
 * pick-locale.guardrails.test.ts pins the shared cases.
 */

/** 'sv-SE' → 'sv'. A tag without a region is returned unchanged. */
export function baseSubtag(tag: string): string {
  return String(tag ?? '').trim().toLowerCase().split('-')[0];
}

export interface PickLocaleOptions {
  /** Every locale that actually exists for this thing. */
  available: Iterable<string>;
  /** What the reader asked for, or is being served. */
  wanted?: string | null;
  /** The site's declared default, used when `wanted` has no version. */
  fallback?: string | null;
}

/**
 * @returns the locale to use, exactly as it appears in `available`, or null
 *   when nothing matches — never a guess.
 */
export function pickLocale({ available, wanted, fallback }: PickLocaleOptions): string | null {
  const options = [...available]
    .map((l) => String(l ?? '').trim())
    .filter(Boolean);
  if (options.length === 0) return null;

  const byExact = new Map<string, string>();
  const byLanguage = new Map<string, string>();
  for (const option of options) {
    const lower = option.toLowerCase();
    if (!byExact.has(lower)) byExact.set(lower, option);
    const base = baseSubtag(option);
    // The least specific spelling of a language wins as its representative, so
    // a site with both 'en' and 'en-GB' answers a request for 'en' with 'en'.
    if (!byLanguage.has(base) || option.length < byLanguage.get(base)!.length) {
      byLanguage.set(base, option);
    }
  }

  for (const candidate of [wanted, fallback]) {
    const tag = String(candidate ?? '').trim().toLowerCase();
    if (!tag) continue;
    const exact = byExact.get(tag);
    if (exact) return exact;
    const sameLanguage = byLanguage.get(baseSubtag(tag));
    if (sameLanguage) return sameLanguage;
  }

  return null;
}
