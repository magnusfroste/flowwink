/**
 * MIRROR of src/lib/slugify.ts for the edge runtime — keep the two identical
 * (slugify-edge-parity.guardrails.test.ts runs both over the same words).
 *
 * The frontend got ONE slug generator; the edge functions kept their own
 * ASCII-only copies, so every blog post FlowPilot published on optic got an
 * address like /blog/n-r-ai-agenten-… ("När") and …verktygs-tkomst…
 * ("verktygsåtkomst") — eight posts by 2026-10-08. Stored slugs are not
 * rewritten (live URLs); new records get the right one.
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
