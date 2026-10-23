/**
 * The translatable surface of a page — found, not enumerated.
 *
 * A page's content_json is a tree of blocks with strings in it, and only some
 * of those strings are prose: a hero's title is, its `variant: "split"` is not,
 * a button's label is, its `url` is not, a Tiptap text node is, its mark's
 * `href` is not. The walker below decides per string, by key and by shape,
 * and hands back a flat list with paths so the same strings can be written
 * back into an identical tree. Structure never changes: block count, keys,
 * ids, urls, icons all survive untouched.
 *
 * Why this exists: on www.flowwink.com (2026-09-04) FlowChat was asked to
 * translate 16 copied pages. Without a walker it had to read every
 * content_json into its context, rewrite it and send it back; it published the
 * English text as Swedish, cut the home page from 24 blocks to 11, and
 * translated the wrong locale's drafts. A skill that walks the tree server-side
 * makes "translate this page" one call, and the structure cannot be lost.
 */

/** Keys whose string values are never prose. Matched case-insensitively. */
export const NON_TEXT_KEYS = new Set([
  'id', 'type', 'url', 'src', 'href', 'icon', 'image', 'images', 'slug', 'variant', 'align', 'alignment',
  'color', 'bg', 'background', 'backgroundimage', 'backgroundcolor', 'textcolor', 'videourl', 'linkurl',
  'buttonurl', 'ctaurl', 'layout', 'width', 'height', 'classname', 'style', 'key', 'format', 'mode', 'size',
  'target', 'rel', 'mime', 'provider', 'locale', 'language', 'lang', 'anchor', 'blockid', 'animation',
  'author', 'company', 'name', 'email', 'phone', 'date', 'datetime', 'currency', 'sku', 'code', 'embed',
  'embedcode', 'html', 'script', 'font', 'fontfamily', 'weight', 'level', 'position', 'direction', 'ratio',
  'aspectratio', 'fit', 'objectfit', 'shape', 'theme', 'tone', 'preset', 'template', 'blocktype', 'field',
  'fieldname', 'fieldtype', 'inputtype', 'pattern', 'regex', 'value', 'values', 'option', 'status', 'state',
  'productid', 'pageid', 'formid', 'categoryid', 'category_id', 'product_id', 'page_id', 'form_id',
]);

/** Keys whose string values are prose even when short ("Hem", "Läs mer"). */
export const TEXT_KEYS = new Set([
  'title', 'subtitle', 'description', 'text', 'label', 'heading', 'subheading', 'eyebrow', 'badge', 'caption',
  'question', 'answer', 'placeholder', 'buttontext', 'buttonlabel', 'ctatext', 'ctalabel', 'linktext', 'quote',
  'body', 'summary', 'excerpt', 'intro', 'outro', 'note', 'hint', 'helptext', 'successmessage', 'errormessage',
  'submittext', 'submitlabel', 'tagline', 'headline', 'subheadline', 'kicker', 'lead', 'alt', 'alttext',
  'seotitle', 'metadescription', 'ogtitle', 'ogdescription', 'role',
  // A chip row's label ("Användningsområden") and the chips themselves — string
  // items of an array, each a word or two. synclair 2026-10-23: the English
  // home page kept its Swedish chips and label after translate_page.
  'tagslabel', 'tags', 'chips', 'bullets', 'highlights', 'benefits', 'points', 'options', 'keywords',
]);

/**
 * A `value` is data ("12 MP", "IP67", "0.4 kg") — unless it is a readout
 * written as words: no digit, more than one word ("Luft · Mark · Sjö",
 * "Air, land and sea"). The hero's HUD readouts are that shape.
 */
const READOUT_PROSE = /^[^0-9]*\p{L}[^0-9]*$/u;
export function isReadoutProse(text: string): boolean {
  const t = text.trim();
  return READOUT_PROSE.test(t) && /[\s·,/|–—-]/.test(t) && t.split(/[\s·,/|–—-]+/).filter(Boolean).length >= 2;
}

const URL_LIKE = /^(https?:\/\/|mailto:|tel:|\/|#|data:)/i;
const HEX_COLOR = /^#?[0-9a-f]{3,8}$/i;
const IDENTIFIER = /^[a-z0-9_.:/-]+$/i;
const HAS_LETTER = /\p{L}/u;

export interface TranslatableString {
  /** JSON path segments from the root value. */
  path: (string | number)[];
  key: string;
  text: string;
}

/** Whether one string, found under `key`, is prose a translator should touch. */
export function isTranslatable(key: string, value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (text.length < 2 || !HAS_LETTER.test(text)) return false;
  const k = key.toLowerCase();
  if ((k === 'value' || k === 'values') && isReadoutProse(text)) return true;
  if (NON_TEXT_KEYS.has(k)) return false;
  if (URL_LIKE.test(text) || HEX_COLOR.test(text)) return false;
  if (TEXT_KEYS.has(k)) return true;
  // Table cells (col1, col2, …) are prose even when one word: "Feature", "Yes".
  if (/^(col|cell|column)\d*$/.test(k)) return true;
  // Unknown key: prose has spaces or punctuation; identifiers ("primary",
  // "lucide-arrow-right", "en-GB") do not.
  if (IDENTIFIER.test(text)) return false;
  return /\s/.test(text) || text.length > 24;
}

/** Depth-first walk collecting every translatable string with its path. */
export function collectTranslatable(root: unknown, path: (string | number)[] = [], out: TranslatableString[] = []): TranslatableString[] {
  if (Array.isArray(root)) {
    // A string item is judged by the key the array sits under (tags[0] is a
    // "tags" string). Until 2026-10-23 only object VALUES were offered, so
    // FormField.options[], PricingTier.features[] and a hero's tags[] were
    // never translated — the "string items inside arrays" row in language.md.
    const parentKey = [...path].reverse().find((seg): seg is string => typeof seg === 'string') ?? '';
    root.forEach((item, i) => {
      if (typeof item === 'string') {
        if (isTranslatable(parentKey, item)) out.push({ path: [...path, i], key: parentKey, text: item });
      } else {
        collectTranslatable(item, [...path, i], out);
      }
    });
    return out;
  }
  if (root && typeof root === 'object') {
    for (const [key, value] of Object.entries(root as Record<string, unknown>)) {
      if (typeof value === 'string') {
        if (isTranslatable(key, value)) out.push({ path: [...path, key], key, text: value });
      } else if (value && typeof value === 'object') {
        // Tiptap link marks carry href under attrs; the walker's key rules
        // already skip it. Nothing special needed.
        collectTranslatable(value, [...path, key], out);
      }
    }
  }
  return out;
}

/** A deep copy of `root` with the strings at `paths` replaced. Untouched otherwise. */
export function applyTranslations(root: unknown, translations: Array<{ path: (string | number)[]; text: string }>): unknown {
  const copy = JSON.parse(JSON.stringify(root ?? null));
  for (const t of translations) {
    let node: any = copy;
    for (let i = 0; i < t.path.length - 1; i++) {
      node = node?.[t.path[i] as any];
      if (node == null) break;
    }
    const last = t.path[t.path.length - 1];
    if (node && typeof node === 'object' && typeof node[last as any] === 'string') node[last as any] = t.text;
  }
  return copy;
}

/** Split strings into batches the model can return faithfully: bounded count and size. */
export function batchStrings<T extends { text: string }>(items: T[], maxItems = 40, maxChars = 6000): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let chars = 0;
  for (const it of items) {
    const len = it.text.length;
    if (current.length && (current.length >= maxItems || chars + len > maxChars)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(it);
    chars += len;
  }
  if (current.length) batches.push(current);
  return batches;
}

/** Block count and a shallow shape signature — the structural invariant a translation must keep. */
export function structureSignature(blocks: unknown): string {
  if (!Array.isArray(blocks)) return 'not-an-array';
  return blocks.map((b: any) => (b && typeof b === 'object' ? `${b.type ?? '?'}:${Object.keys(b).length}` : typeof b)).join('|');
}
