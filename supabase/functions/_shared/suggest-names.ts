/**
 * Generic "did you mean" name matching — domain-free.
 *
 * Extracted from normalize-blocks.ts, where the same similarity pass sat
 * welded to the block catalogue. It is not a block idea: an unknown BLOCK
 * FIELD and an unknown SKILL PARAMETER are the same defect seen twice, and a
 * guard that names the mistake without naming the fix sends the model looking
 * for another door rather than correcting the one it is holding.
 *
 * Live, verified in agent_activity (2026-08-22):
 *   19:40:44  manage_page          failed  → "[preflight-bounce] unknown parameter(s) is_published"
 *   19:41:21  landing_page_compose success → a page of four bare text blocks
 * The model did not fix `is_published`. It switched to a weaker skill and
 * built a weaker page. A guard on the good path made the unguarded path more
 * attractive — so every bounce has to carry its own remedy.
 *
 * Deliberately a crude similarity (synonym → exact-modulo-casing →
 * containment → shared words), not a fuzzy-match library: its job is to put
 * the right name in the error text, and the full valid list travels alongside
 * it anyway.
 */

/** lowercase + drop separators, so primary_cta / primaryCta / primary-cta match. */
export function normalizeName(name: string): string {
  return String(name || '').toLowerCase().replace(/[\s_-]+/g, '');
}

/** camelCase / snake_case / kebab-case → lowercase word tokens. */
export function nameWords(name: string): string[] {
  return String(name || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .map((w) => w.toLowerCase())
    .filter(Boolean);
}

/**
 * Crude English stem, enough to see that `published` and `publish` are the
 * same word. Used only by the enum pass — the name similarity above stays
 * literal on purpose.
 */
export function stemWord(word: string): string {
  const w = String(word || '').toLowerCase();
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s')) return w.slice(0, -1);
  return w;
}

export interface SuggestNamesOptions {
  /**
   * Known wrong-name → right-name(s) map, keyed by normalizeName(). Every
   * entry is filtered against `valid` before it is returned, so a synonym can
   * never name something that does not exist.
   */
  synonyms?: Record<string, string[]>;
  /** How many suggestions to return. Default 2. */
  limit?: number;
}

/**
 * Suggest the valid names closest to what the caller invented.
 *
 * `valid` is the SAME collection the caller refuses from, so a suggestion can
 * never drift from what is actually accepted.
 */
export function suggestClosestNames(
  invented: string,
  valid: Iterable<string>,
  opts: SuggestNamesOptions = {},
): string[] {
  const validSet = valid instanceof Set ? valid as Set<string> : new Set(valid);
  if (validSet.size === 0) return [];
  const n = normalizeName(invented);
  if (!n) return [];
  const limit = opts.limit ?? 2;
  const out: string[] = [];
  const push = (f: string) => { if (validSet.has(f) && !out.includes(f)) out.push(f); };

  // 1. Known synonym (filtered against the real name list).
  for (const s of opts.synonyms?.[n] ?? []) push(s);

  // 2. Same name, other casing: `sub_title` → `subtitle`, `background_image` →
  //    `backgroundImage`. The single most common miss and always unambiguous —
  //    so it answers alone; a second guess beside a certainty only adds doubt.
  for (const f of validSet) if (normalizeName(f) === n) return [f];

  // 3. Containment, both ways, on names long enough for it to mean something
  //    ("buttonlabel" ↔ "buttonText" is caught by the word pass instead).
  if (n.length >= 5) {
    for (const f of validSet) {
      const fn = normalizeName(f);
      if (fn.length >= 4 && (fn.includes(n) || n.includes(fn))) push(f);
    }
  }

  // 4. Shared word: `buttonLabel` → `buttonText`, `heroTitle` → `title`.
  const words = new Set(nameWords(invented));
  const scored: Array<{ field: string; shared: number }> = [];
  for (const f of validSet) {
    if (out.includes(f)) continue;
    const shared = nameWords(f).filter((w) => words.has(w)).length;
    if (shared > 0) scored.push({ field: f, shared });
  }
  scored.sort((a, b) => b.shared - a.shared || a.field.length - b.field.length);
  for (const s of scored) push(s.field);

  return out.slice(0, limit);
}

/** One enum-value hit: the parameter that owns the value, and the value. */
export interface EnumValueHit {
  parameter: string;
  value: string;
}

/**
 * The pass that actually rescues `is_published`.
 *
 * Name similarity cannot help there — `is_published` shares no letters worth
 * having with `action`, `status`, `slug`, `title`, `meta` or `blocks`. But the
 * schema says more than parameter NAMES: `action` declares an enum, and one of
 * its values is `publish`, which is the stem of the word the caller invented.
 * So the fix is readable straight off the schema — `action: "publish"` — and
 * it is the RIGHT fix, better than the nearest-name guess would have been.
 *
 * Law 1 safe: this reads the skill's own declared enum, it does not carry a
 * hardcoded `is_published` → `action` pair. Any skill that declares an enum
 * gets the same treatment for free.
 *
 * @param properties JSON-schema `properties` object of the skill's parameters.
 * @param sentValue  What the caller passed for the invented key. A literal
 *   `false` suppresses the suggestion: `is_published: false` does NOT mean
 *   `action: "publish"`, and a guard must not put a wrong fix in the model's
 *   mouth just to have something to say.
 */
export function suggestEnumValueFix(
  invented: string,
  properties: Record<string, unknown> | null | undefined,
  sentValue?: unknown,
): EnumValueHit[] {
  if (!properties || typeof properties !== 'object') return [];
  if (sentValue === false) return [];
  const stems = new Set(nameWords(invented).map(stemWord));
  if (stems.size === 0) return [];
  const hits: EnumValueHit[] = [];
  for (const [param, schema] of Object.entries(properties)) {
    const enumValues = (schema as any)?.enum;
    if (!Array.isArray(enumValues)) continue;
    for (const ev of enumValues) {
      if (typeof ev !== 'string' && typeof ev !== 'number') continue;
      const evWords = nameWords(String(ev)).map(stemWord);
      if (evWords.length === 0) continue;
      // Every word of the enum value must be a word the caller used, so
      // `publish` matches `is_published` but `list` does not match `list_id`
      // → `action:"list"` by accident of a single shared token in a longer
      // value. Single-word enums are the common case and stay exact.
      if (evWords.every((w) => stems.has(w))) {
        hits.push({ parameter: param, value: String(ev) });
      }
    }
  }
  return hits.slice(0, 3);
}
