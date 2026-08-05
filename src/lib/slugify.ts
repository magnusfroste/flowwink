/**
 * One slug generator for the whole app.
 *
 * Before this there were five, and they disagreed. A tag named "Öppna vikter"
 * became `oppna-vikter` in blog tags, `-ppna-vikter` in entity tags, and
 * `oppna-vikter` again in Flowtable — the same word, three slugs, depending on
 * which screen you happened to be on. The plain-ASCII variants
 * (`replace(/[^a-z0-9]+/g, '-')` with no transliteration first) silently delete
 * every non-ASCII letter, so on a Swedish-first product "Varför öppna vikters"
 * came out as `varf-r-ppna-vikters`.
 *
 * The order below is the whole trick: transliterate the letters that do NOT
 * decompose (ø, æ, ß, þ, ð, ł, đ), then NFKD-decompose the rest and drop the
 * combining marks, and only then collapse to ASCII. Doing the ASCII collapse
 * first — as every previous copy did — throws the information away before
 * anything can preserve it.
 *
 * Scope: this generates slugs for NEW records. Existing stored slugs are not
 * rewritten — that would break live URLs. A record keeps whatever slug it was
 * born with.
 */

/** Letters NFKD leaves alone, so they need an explicit mapping. */
const TRANSLITERATIONS: Array<[RegExp, string]> = [
  [/ø/g, 'o'],
  [/æ/g, 'ae'], // the ligature spells out; ä/å still fold to 'a' via NFKD
  [/œ/g, 'oe'],
  [/ß/g, 'ss'],
  [/þ/g, 'th'],
  [/ð/g, 'd'],
  [/đ/g, 'd'],
  [/ł/g, 'l'],
  [/ħ/g, 'h'],
  [/ŧ/g, 't'],
  [/ı/g, 'i'],
  [/·/g, ''],
];

export interface SlugifyOptions {
  /** Truncate to this many characters (trailing separators trimmed after). */
  maxLength?: number;
  /** Word separator. `-` for URLs, `_` for identifiers/field keys. */
  separator?: string;
  /** Returned when the input yields nothing usable (e.g. an emoji-only title). */
  fallback?: string;
}

/**
 * URL/identifier-safe slug, diacritics preserved as their base letters.
 *
 *   slugify('Varför öppna vikters')  // 'varfor-oppna-vikters'
 *   slugify('Blåbærsyltetøy')        // 'blabaersyltetoy'
 *   slugify('Grüße', { separator: '_' }) // 'gruesse' -> 'grusse'
 */
export function slugify(input: string, options: SlugifyOptions = {}): string {
  const { maxLength, separator = '-', fallback = '' } = options;

  let s = String(input ?? '').toLowerCase();
  for (const [pattern, replacement] of TRANSLITERATIONS) s = s.replace(pattern, replacement);

  // NFKD splits å → a + ring, ﬁ → fi, ① → 1; the combining marks then go.
  s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

  // Anything still not [a-z0-9] becomes a separator; runs collapse; ends trim.
  const sepClass = separator.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  s = s
    .replace(/[^a-z0-9]+/g, separator)
    .replace(new RegExp(`${sepClass}{2,}`, 'g'), separator)
    .replace(new RegExp(`^${sepClass}+|${sepClass}+$`, 'g'), '');

  if (maxLength && s.length > maxLength) {
    s = s.slice(0, maxLength).replace(new RegExp(`${sepClass}+$`), '');
  }

  return s || fallback;
}

/** Identifier form — underscores instead of hyphens (Flowtable field keys). */
export function fieldKey(input: string, options: Omit<SlugifyOptions, 'separator'> = {}): string {
  return slugify(input, { ...options, separator: '_' });
}
