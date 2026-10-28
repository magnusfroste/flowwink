/**
 * Translation units — the page's text as an overlay would store it.
 *
 * `collectTranslatable` (translate-walk.ts) finds every prose string on a page
 * with its JSON path. A path is index-based: `[3, 'data', 'title']` is the
 * fourth block's title, and inserting one block above it moves every path on
 * the page. That is fine for translating a copy in place — the copy IS the
 * tree — and useless for an overlay that must survive the tree being edited.
 *
 * A unit is the same string under a key that survives editing:
 *
 *   `<block.id>.<path inside the block>`   b7f3a.data.title
 *                                           b7f3a.data.items[0].quote
 *   `page.title`, `page.meta.seoTitle`     the page's own fields
 *
 * Block ids are stable across reorders (every block carries one: 451 template
 * blocks and 276 live blocks on www, none without). Indices INSIDE a block
 * (items[0]) are not stable, but they are bounded to that block: reordering
 * three pricing tiers costs those three units, never the page.
 *
 * A Tiptap document is ONE unit, not its text nodes. Half a translated
 * paragraph is not a thing, and node paths change every time a sentence is
 * split. Its text — the text nodes in order — is what gets hashed, so a mark
 * moved or an attribute changed does not make the translation stale; a word
 * changed does.
 *
 * The hash is a fingerprint for staleness (FNV-1a 64), not a credential:
 * synchronous, identical in Deno and Node, and one line to reimplement.
 *
 * Design: docs/architecture/page-translations.md §2.2, §3.
 */
import { collectTranslatable, isTranslatable } from './translate-walk.ts';

export type UnitKind = 'text' | 'doc';

export interface TranslationUnit {
  /** The stable key: `<block.id>.<path>` or `page.<field>`. */
  unit: string;
  kind: UnitKind;
  /** The prose. For a doc, the text nodes in order joined by U+001F. */
  text: string;
  /** The Tiptap document itself, for `kind: 'doc'`. */
  doc?: unknown;
  /** Fingerprint of `text` — what the overlay stores as `source_hash`. */
  hash: string;
  /** JSON path from the page root — what `applyTranslations` needs. */
  path: (string | number)[];
}

/** One stored translation, as the overlay's `strings` jsonb holds it. */
export interface OverlayEntry {
  text?: string;
  doc?: unknown;
  source_hash: string;
}

export interface PageLike {
  title?: string | null;
  meta_json?: unknown;
  content_json?: unknown;
}

/** FNV-1a, 64-bit, as 16 hex chars. A fingerprint, not a secret. */
export function unitHash(text: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const bytes = new TextEncoder().encode(text);
  for (const b of bytes) {
    h ^= BigInt(b);
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}

export function isTiptapDoc(value: unknown): value is { type: 'doc'; content: unknown[] } {
  return !!value && typeof value === 'object' && (value as { type?: unknown }).type === 'doc'
    && Array.isArray((value as { content?: unknown }).content);
}

/** The prose of a Tiptap document: its text nodes, in order. Marks and attrs are not text. */
export function docText(doc: unknown): string {
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    const n = node as { type?: unknown; text?: unknown; content?: unknown };
    if (n.type === 'text' && typeof n.text === 'string') parts.push(n.text);
    if (n.content) walk(n.content);
  };
  walk(doc);
  return parts.join('\u001f');
}

/** `data.items[0].quote` — string segments dotted, indices bracketed. */
export function formatUnitPath(segments: (string | number)[]): string {
  let out = '';
  for (const seg of segments) {
    if (typeof seg === 'number') out += `[${seg}]`;
    else out += out ? `.${seg}` : seg;
  }
  return out;
}

function collectIn(node: unknown, rel: (string | number)[], abs: (string | number)[], prefix: string, out: TranslationUnit[]): void {
  if (isTiptapDoc(node)) {
    const text = docText(node);
    if (text.trim().length >= 2) {
      out.push({ unit: `${prefix}.${formatUnitPath(rel)}`, kind: 'doc', text, doc: node, hash: unitHash(text), path: abs });
    }
    return;
  }
  if (Array.isArray(node)) {
    const parentKey = [...rel].reverse().find((seg): seg is string => typeof seg === 'string') ?? '';
    node.forEach((item, i) => {
      if (typeof item === 'string') {
        if (isTranslatable(parentKey, item)) {
          out.push({ unit: `${prefix}.${formatUnitPath([...rel, i])}`, kind: 'text', text: item, hash: unitHash(item), path: [...abs, i] });
        }
      } else {
        collectIn(item, [...rel, i], [...abs, i], prefix, out);
      }
    });
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (typeof value === 'string') {
        if (isTranslatable(key, value)) {
          out.push({ unit: `${prefix}.${formatUnitPath([...rel, key])}`, kind: 'text', text: value, hash: unitHash(value), path: [...abs, key] });
        }
      } else if (value && typeof value === 'object') {
        collectIn(value, [...rel, key], [...abs, key], prefix, out);
      }
    }
  }
}

/** The block tree's units: each block's text keyed under `<keyPrefix><block.id>`. */
function collectBlockUnits(content: unknown, absRoot: (string | number)[], keyPrefix: string, out: TranslationUnit[]): void {
  if (!Array.isArray(content)) return;
  content.forEach((block, i) => {
    if (!block || typeof block !== 'object') return;
    const id = (block as { id?: unknown }).id;
    const prefix = typeof id === 'string' && id.trim() ? id.trim() : `#${i}`;
    collectIn(block, [], [...absRoot, i], `${keyPrefix}${prefix}`, out);
  });
}

function collectMetaUnits(meta: unknown, keyPrefix: string, out: TranslationUnit[]): void {
  if (!meta || typeof meta !== 'object') return;
  for (const f of collectTranslatable(meta, ['meta_json'])) {
    out.push({ unit: `${keyPrefix}.meta.${formatUnitPath(f.path.slice(1))}`, kind: 'text', text: f.text, hash: unitHash(f.text), path: f.path });
  }
}

/**
 * Every unit on a page: title, meta, then each block's text under the block's
 * id. A block without an id (legacy data the normaliser has not touched) is
 * keyed by position, `#<index>`, so nothing is silently dropped — but such a
 * key moves with the block, which is why the normaliser assigns ids.
 */
export function collectUnits(page: PageLike): TranslationUnit[] {
  const out: TranslationUnit[] = [];
  if (typeof page.title === 'string' && isTranslatable('title', page.title)) {
    out.push({ unit: 'page.title', kind: 'text', text: page.title, hash: unitHash(page.title), path: ['title'] });
  }
  collectMetaUnits(page.meta_json, 'page', out);
  collectBlockUnits(page.content_json, ['content_json'], '', out);
  return out;
}

/** A blog post as the overlay sees it — the fields that carry text. */
export interface PostLike {
  title?: string | null;
  excerpt?: string | null;
  meta_json?: unknown;
  content_json?: unknown;
  featured_image_alt?: string | null;
}

/**
 * Every unit of a blog post: `post.title`, `post.excerpt`, `post.meta.<key>`,
 * the body as ONE doc unit (`post.content` — a post is one document, and half
 * a translated article is not a thing), `post.featured_image_alt`. A legacy
 * post whose body is a block array is keyed per block, `post.content.<id>…`,
 * the page rule.
 */
export function collectPostUnits(post: PostLike): TranslationUnit[] {
  const out: TranslationUnit[] = [];
  const text = (unit: string, key: string, value: unknown, path: (string | number)[]) => {
    if (typeof value === 'string' && isTranslatable(key, value)) {
      out.push({ unit, kind: 'text', text: value, hash: unitHash(value), path });
    }
  };
  text('post.title', 'title', post.title, ['title']);
  text('post.excerpt', 'excerpt', post.excerpt, ['excerpt']);
  collectMetaUnits(post.meta_json, 'post', out);
  if (isTiptapDoc(post.content_json)) {
    const body = docText(post.content_json);
    if (body.trim().length >= 2) {
      out.push({ unit: 'post.content', kind: 'doc', text: body, doc: post.content_json, hash: unitHash(body), path: ['content_json'] });
    }
  } else {
    collectBlockUnits(post.content_json, ['content_json'], 'post.content.', out);
  }
  text('post.featured_image_alt', 'alt', post.featured_image_alt, ['featured_image_alt']);
  return out;
}

export interface ProductLike {
  name?: string | null;
  description?: string | null;
}

/**
 * Every unit of a product (`product.name`, `product.description`) or a
 * category (`category.name`, `category.description`) — the two fields a
 * visitor reads. Price, SKU, stock and images are facts, not text, and stay
 * on the row in every language (§10).
 */
export function collectProductUnits(row: ProductLike, prefix: 'product' | 'category' = 'product'): TranslationUnit[] {
  const out: TranslationUnit[] = [];
  const text = (unit: string, value: unknown, path: (string | number)[]) => {
    if (typeof value === 'string' && value.trim().length > 0) {
      out.push({ unit, kind: 'text', text: value, hash: unitHash(value), path });
    }
  };
  text(`${prefix}.name`, row.name, ['name']);
  text(`${prefix}.description`, row.description, ['description']);
  return out;
}

/**
 * A variant attribute as its overlay stores it: the attribute's name and each
 * of its values, keyed by the value's id (`attribute.value.<id>`) so a
 * re-ordered or renamed value keeps its own translation and a stale one is
 * exactly the value that changed. Attributes are site-wide, so one overlay
 * serves every product with that option (§10).
 */
export interface AttributeLike {
  name?: string | null;
  product_attribute_values?: Array<{ id: string; value?: string | null }> | null;
}

export function collectAttributeUnits(row: AttributeLike): TranslationUnit[] {
  const out: TranslationUnit[] = [];
  if (typeof row.name === 'string' && row.name.trim()) {
    out.push({ unit: 'attribute.name', kind: 'text', text: row.name, hash: unitHash(row.name), path: ['name'] });
  }
  (row.product_attribute_values ?? []).forEach((v, i) => {
    if (typeof v.value === 'string' && v.value.trim()) {
      out.push({ unit: `attribute.value.${v.id}`, kind: 'text', text: v.value, hash: unitHash(v.value), path: ['product_attribute_values', i, 'value'] });
    }
  });
  return out;
}

/** The kinds of content an overlay can belong to (content_translations.entity). */
export type ContentEntity = 'page' | 'blog_post' | 'product' | 'product_category' | 'product_attribute';

export const CONTENT_ENTITIES: readonly ContentEntity[] = ['page', 'blog_post', 'product', 'product_category', 'product_attribute'];

/** One walker, entity-aware at the root: which fields of the row carry text. */
export function collectEntityUnits(entity: ContentEntity, row: PageLike & PostLike & ProductLike & AttributeLike): TranslationUnit[] {
  if (entity === 'product') return collectProductUnits(row, 'product');
  if (entity === 'product_category') return collectProductUnits(row, 'category');
  if (entity === 'product_attribute') return collectAttributeUnits(row);
  return entity === 'blog_post' ? collectPostUnits(row) : collectUnits(row);
}

export interface OverlayDiff {
  /** Source units with no entry — never translated. */
  missing: TranslationUnit[];
  /** Entries whose source text has changed since they were written. Still shown, but counted. */
  stale: TranslationUnit[];
  /** Entries that match their source. */
  fresh: TranslationUnit[];
  /** Entry keys whose unit no longer exists on the page. Dropped on the next write. */
  orphans: string[];
}

/** What `translate_page` has to do, what the admin shows, what `list_stale_translations` returns. */
export function diffOverlay(units: TranslationUnit[], strings: Record<string, OverlayEntry> | null | undefined): OverlayDiff {
  const overlay = strings ?? {};
  const seen = new Set<string>();
  const diff: OverlayDiff = { missing: [], stale: [], fresh: [], orphans: [] };
  for (const u of units) {
    seen.add(u.unit);
    const entry = overlay[u.unit];
    if (!entry) diff.missing.push(u);
    else if (entry.source_hash !== u.hash) diff.stale.push(u);
    else diff.fresh.push(u);
  }
  for (const key of Object.keys(overlay)) if (!seen.has(key)) diff.orphans.push(key);
  return diff;
}

/**
 * The page in language L: the source tree with every fresh or stale entry's
 * text in place. Missing entries keep the source text — visible, and counted
 * by `diffOverlay`. Returns the replacements for `applyTranslations`.
 */
export function overlayReplacements(units: TranslationUnit[], strings: Record<string, OverlayEntry> | null | undefined): Array<{ path: (string | number)[]; text?: string; doc?: unknown }> {
  const overlay = strings ?? {};
  const out: Array<{ path: (string | number)[]; text?: string; doc?: unknown }> = [];
  for (const u of units) {
    const entry = overlay[u.unit];
    if (!entry) continue;
    if (u.kind === 'doc') { if (isTiptapDoc(entry.doc)) out.push({ path: u.path, doc: entry.doc }); }
    else if (typeof entry.text === 'string' && entry.text) out.push({ path: u.path, text: entry.text });
  }
  return out;
}

/** A deep copy of `root` with text AND doc replacements applied. Untouched otherwise. */
export function applyOverlay(root: unknown, replacements: Array<{ path: (string | number)[]; text?: string; doc?: unknown }>): unknown {
  const copy = JSON.parse(JSON.stringify(root ?? null));
  for (const r of replacements) {
    let node: unknown = copy;
    for (let i = 0; i < r.path.length - 1; i++) {
      node = node && typeof node === 'object' ? (node as Record<string | number, unknown>)[r.path[i]] : undefined;
      if (node == null) break;
    }
    if (!node || typeof node !== 'object') continue;
    const last = r.path[r.path.length - 1];
    const target = node as Record<string | number, unknown>;
    if (r.doc !== undefined) { if (isTiptapDoc(target[last])) target[last] = JSON.parse(JSON.stringify(r.doc)); }
    else if (typeof r.text === 'string' && typeof target[last] === 'string') target[last] = r.text;
  }
  return copy;
}
