// inspect_rendered_page — the sensor that closes the build-blind loop.
//
// WHY THIS EXISTS (the real incident, optic /agentic, 2026-08-22)
// FlowWork asked FlowPilot to build a page. The agent wrote a hero block with
// `primary_cta`, `secondary_cta` and `subheadline`. HeroBlock reads
// `primaryButton`, `secondaryButton` and `subtitle`. All three keys saved
// fine — content_json is JSON, it stores anything — and none of them rendered.
// The page came out thin, and the agent reported it complete, because at no
// point does an agent SEE what it built. It writes into a black box.
//
// describe_blocks answers "what can I build". This answers "what did I build".
// They are the two halves of the same sense, which is why they share a home
// (src/lib/platform-seeds.ts) and a source of truth (block-reference.ts →
// block-tools.ts / block-schema.ts via scripts/sync-block-schema.ts).
//
// WHY IT IS NOT A BROWSER
// The truth about which fields render lives in the repo, not in a screenshot.
// A headless render is slower, can fail in production, and — decisively —
// answers question 1 WORSE: a browser sees an absent CTA, but it cannot tell
// you that the absent CTA is sitting in the database under the wrong key.
// The static comparison names the field. A real render is a possible second
// tier for layout/overflow/contrast questions; it is not this.
//
// WHY IT IS NOT REDUNDANT WITH THE WRITE GATE
// normalize-blocks.ts refuses unknown field names at write time on the
// manage_page / manage_page_blocks paths. That is the guard. This is the
// sensor, and it answers three things the guard structurally cannot:
//   1. pages that are ALREADY wrong (every page written before the guard, and
//      every page written through a path the guard does not sit on: template
//      installs, site migration, direct SQL, restored backups)
//   2. blocks that are VISUALLY EMPTY — every field name is spelled right and
//      the block still renders an empty band, because the content-bearing
//      field is missing. The guard has nothing to refuse there.
//   3. COMPOSITION — 9 text blocks in a row is not a field error, it is a bad
//      page, and no per-write check can see it.
//
// NO SECOND CATALOGUE
// Valid field names come from BLOCK_CREATION_TOOLS (generated from
// block-reference.ts), the same array the write gate refuses from. The
// "does it render anything" rule comes from BLOCK_CONTRACTS, the same
// hand-curated minimum-payload declaration the import gate enforces. Nothing
// here is a hand-maintained copy of either, so neither can drift from this.
//
// WHICH ALIASES THIS FOLDS — AND WHY ONLY THOSE (2026-08-22)
// normalize-blocks.ts forgives several wrong field names on the WRITE path.
// Replaying all of them here would be wrong; replaying none of them was wrong
// too. The dividing line is WHEN the rename happens:
//
//   (a) The RENDERER's own fallbacks — StatsBlock reads `stats || items`,
//       TimelineBlock reads `steps || items` and `variant || layout`. A block
//       stored under those names is ON THE PAGE, untouched, and our own seed
//       templates ship 27 such fields (14 stats.items, 9 timeline.items,
//       4 timeline.layout across 72 template pages). Not folding them made the
//       sensor report visible content as "read by nothing" — advice to delete
//       what a visitor can see. A sensor that lies is worse than no sensor: it
//       teaches the agent to destroy. These we FOLD, from the map exported by
//       normalize-blocks (FOLDED_ALIASES) through the shared fold function, so
//       there is one implementation and it cannot drift from the write path.
//
//   (b) Every other alias in normalize-blocks — the catalogue-aware text folds
//       (heading/headline→title, subheadline→subtitle), the per-type folds
//       (hero buttonText→primaryButton and body→subtitle, cta buttonLink→
//       buttonUrl, two-column leftContent/rightContent, text text/body→content,
//       team members[].image→photo) and the envelope alias (block_type/
//       block_data→type/data). Every one of these RENAMES BEFORE STORAGE. This
//       sensor reads what IS stored — so a value still sitting under one of
//       those names is one the write path never saw (template install, site
//       migration, direct SQL, a restored backup, or a page written before the
//       alias existed) and NOTHING reads it. Folding them here would silence
//       exactly the /agentic incident above: `subheadline` would come back
//       "fine" while the hero renders without its supporting line. Those stay
//       reported. FIELD_SYNONYMS is consumed the one way it is meant to be —
//       via suggestBlockFields(), as the `likely_meant` name in the finding.
//
// The fold is silent by design: no note, no composition remark, no effect on
// the verdict. `items` on a stats block is not a legacy name awaiting cleanup,
// it is a name the renderer reads, so "every written field is read by the
// renderer" stays literally true. And the only channel that could carry such a
// note is `unread_fields`, whose documented remedy is "rewrite that block" —
// no wording survives that framing intact. A mention there would be read as an
// instruction to touch working content, which is the failure this whole pass
// exists to prevent. src/lib/__tests__/rendered-page-sensor.guardrails.test.ts
// scans the public renderers for new `(data as any).x` fallbacks, so a fourth
// one cannot appear without this map being extended.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { BLOCK_CREATION_TOOLS, toolNameToBlockType } from '../block-tools.ts';
import {
  BLOCK_CONTRACTS,
  KNOWN_BLOCK_TYPES,
  DATA_DRIVEN_BLOCK_TYPES,
  applyRendererFallbacks,
  suggestBlockFields,
  suggestBlockTypes,
} from '../normalize-blocks.ts';

/* ------------------------------------------------------------------ *
 * The catalogue, read (not copied) from the generated artifact.
 * ------------------------------------------------------------------ */

/** The slice of a generated creation tool this sensor reads. */
interface BlockCreationTool {
  function?: {
    name?: string;
    parameters?: { properties?: Record<string, unknown>; required?: unknown };
  };
}

let _fieldsCache: Map<string, Set<string>> | null = null;
/** Valid top-level field names per block type — the renderer's read surface. */
function validFields(): Map<string, Set<string>> {
  if (_fieldsCache) return _fieldsCache;
  const map = new Map<string, Set<string>>();
  for (const tool of BLOCK_CREATION_TOOLS as readonly BlockCreationTool[]) {
    const type = toolNameToBlockType(tool?.function?.name ?? '');
    if (!type) continue;
    map.set(type, new Set(Object.keys(tool?.function?.parameters?.properties ?? {})));
  }
  _fieldsCache = map;
  return map;
}

let _requiredCache: Map<string, string[]> | null = null;
/** The generated tool's own `required` list — fallback when no BLOCK_CONTRACT. */
function toolRequired(): Map<string, string[]> {
  if (_requiredCache) return _requiredCache;
  const map = new Map<string, string[]>();
  for (const tool of BLOCK_CREATION_TOOLS as readonly BlockCreationTool[]) {
    const type = toolNameToBlockType(tool?.function?.name ?? '');
    if (!type) continue;
    const req = tool?.function?.parameters?.required;
    map.set(type, Array.isArray(req) ? req.map(String) : []);
  }
  _requiredCache = map;
  return map;
}

const DATA_DRIVEN = new Set<string>(DATA_DRIVEN_BLOCK_TYPES as readonly string[]);

/**
 * The blocks AS THE RENDERER WILL SEE THEM — a copy, folded through the
 * renderer's own alias fallbacks (see "WHICH ALIASES THIS FOLDS" at the top).
 *
 * A sensor must never change the thing it measures. The rows here come
 * straight off the `pages` row and are handed on to preview() and the block
 * report, so the fold runs on a JSON deep copy — the same copy-then-judge
 * pattern preflightBlockArgs() uses for exactly the same reason. If the copy
 * cannot be made (it always can — content_json is JSON), the original is
 * returned unfolded: a false positive is bad, a mutated page row is worse.
 */
function foldedForComparison(blocks: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  let copy: Array<Record<string, unknown>>;
  try {
    copy = JSON.parse(JSON.stringify(blocks)) as Array<Record<string, unknown>>;
  } catch {
    return blocks;
  }
  for (const block of copy) {
    if (!block || typeof block !== 'object' || Array.isArray(block)) continue;
    applyRendererFallbacks(block);
  }
  return copy;
}

/* ------------------------------------------------------------------ *
 * Presence
 * ------------------------------------------------------------------ */

/**
 * Does this value put anything on the page?
 *
 * Deliberately strict about the two shapes that look filled and render blank:
 * the empty string (an agent writing `title: ""` to "clear" a field) and the
 * empty Tiptap doc ({type:"doc",content:[]}), which is what a rich-text editor
 * leaves behind when its content was dropped.
 */
function isPresent(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'boolean') return true;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (o.type === 'doc') return Array.isArray(o.content) && o.content.length > 0 && hasText(o);
    return Object.keys(o).length > 0;
  }
  return false;
}

/** A Tiptap doc of empty paragraphs stores fine and renders as whitespace. */
function hasText(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false;
  const n = node as Record<string, unknown>;
  if (typeof n.text === 'string' && n.text.trim().length > 0) return true;
  // Media/embed nodes are content even without text.
  if (typeof n.type === 'string' && ['image', 'video', 'iframe', 'horizontalRule'].includes(n.type)) return true;
  if (Array.isArray(n.content)) return n.content.some(hasText);
  return false;
}

/** Field names that put something visible-but-not-prose on the page. */
const MEDIA_FIELD = /(image|images|photo|video|logo|logos|icon|src|thumbnail|poster|lottie|avatar)/i;

/* ------------------------------------------------------------------ *
 * Result shape
 * ------------------------------------------------------------------ */

export interface UnreadFieldFinding {
  block_index: number;
  block_type: string;
  field: string;
  /** The catalogued field the agent most likely meant, when one is findable. */
  likely_meant: string | null;
  value_preview: string;
}

export interface EmptyBlockFinding {
  block_index: number;
  block_type: string;
  /** Which required group(s) had no present field — the exact reason it is blank. */
  missing: string[];
  reason: string;
}

export interface UnknownTypeFinding {
  block_index: number;
  block_type: string;
  did_you_mean: string[];
}

export interface BlockReport {
  index: number;
  type: string;
  id: string | null;
  fields_written: number;
  fields_read_by_renderer: number;
  unread_fields: string[];
  renders_content: boolean;
  carries_media: boolean;
}

export interface PageComposition {
  block_count: number;
  distinct_types: number;
  type_counts: Record<string, number>;
  order: string[];
  text_block_count: number;
  text_share_pct: number;
  adjacent_repeats: Array<{ from_index: number; type: string }>;
  blocks_with_media: number;
  opens_with: string | null;
  closes_with: string | null;
  notes: string[];
}

/**
 * The sensor's answer, typed — this shape IS the contract the skill's
 * instructions describe field by field, so it is declared once here rather
 * than left as a bag of unknowns for every caller to re-guess.
 */
export interface RenderedPageReport {
  status: 'success' | 'failed';
  error?: string;
  known_slugs?: string[];
  page?: Record<string, unknown>;
  verdict?: 'ok' | 'renders_but_thin' | 'needs_attention';
  block_count?: number;
  unread_fields?: UnreadFieldFinding[];
  empty_blocks?: EmptyBlockFinding[];
  unknown_block_types?: UnknownTypeFinding[];
  composition?: PageComposition;
  blocks?: BlockReport[];
  summary?: string;
}

/* ------------------------------------------------------------------ *
 * Handler
 * ------------------------------------------------------------------ */

interface PageRow {
  id: string;
  slug: string;
  title: string;
  status: string;
  locale: string;
  content_json: unknown;
  updated_at: string;
}

export async function executeInspectRenderedPage(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<RenderedPageReport> {
  const pageId = typeof args.page_id === 'string' ? args.page_id.trim() : '';
  const rawSlug = typeof args.slug === 'string' ? args.slug.trim() : '';
  // "/agentic", "agentic" and "/agentic/" are the same page to a human, so
  // they must be the same page here — a slug miss on a leading slash would
  // make the sensor report "page not found" about a page that exists.
  const slug = rawSlug.replace(/^\/+/, '').replace(/\/+$/, '');
  const locale = typeof args.locale === 'string' ? args.locale.trim() : '';

  if (!pageId && !slug) {
    return {
      error: 'Provide page_id or slug — e.g. { "slug": "agentic" }. This skill inspects one page.',
      status: 'failed',
    };
  }

  let q = supabase
    .from('pages')
    .select('id, slug, title, status, locale, content_json, updated_at')
    .is('deleted_at', null);
  q = pageId ? q.eq('id', pageId) : q.eq('slug', slug);
  // The locale filter is applied SEPARATELY below, never as part of the lookup.
  // Observed 2026-08-22: a caller volunteered locale "sv-SE" (the page reads as
  // Swedish) while the row is stored as "en"; the filter excluded it and the
  // error said only `No page found for slug "…"` — hiding the criterion that
  // actually rejected it, while the fallback list in the SAME response happily
  // named that very slug. A sensor built to end silent failures must not fail
  // silently about its own filter. This is a READ: refusing to look at the page
  // the caller obviously meant, over a metadata mismatch, helps no one.
  const { data, error } = await q.order('updated_at', { ascending: false }).limit(5);

  if (error) return { error: `Could not load page: ${error.message}`, status: 'failed' };

  let localeNote: string | undefined;
  const allRows = (data ?? []) as PageRow[];
  const rows = (() => {
    if (!locale || allRows.length === 0) return allRows;
    const exact = allRows.filter((r) => r.locale === locale);
    if (exact.length > 0) return exact;
    const found = allRows.map((r) => r.locale ?? 'null').join(', ');
    localeNote =
      `You asked for locale "${locale}" but this page is stored as "${found}" — ` +
      `inspected anyway. If the stored locale is wrong, that is a separate fix on the page itself; ` +
      `the sensor does not filter a read on it.`;
    return allRows;
  })();
  if (rows.length === 0) {
    const { data: near } = await supabase
      .from('pages')
      .select('slug')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(25);
    return {
      error:
        `No page found for ${pageId ? `page_id "${pageId}"` : `slug "${slug}"`}` +
        `${locale ? ` (locale "${locale}" was requested; it is not used to exclude a match)` : ''}` +
        `. Compare against known_slugs below — if the slug you want is listed, resend it verbatim.`,
      known_slugs: (near ?? []).map((r: { slug: string }) => r.slug),
      status: 'failed',
    };
  }

  const page = rows[0];
  const otherLocales = rows.slice(1).map((r) => r.locale);

  const raw = page.content_json;
  // Judged copy, never the stored array — the fold below is the renderer's
  // read, not an edit of the page.
  const blocks: Array<Record<string, unknown>> = Array.isArray(raw)
    ? foldedForComparison(raw as Array<Record<string, unknown>>)
    : [];

  if (!Array.isArray(raw)) {
    return {
      page: { id: page.id, slug: page.slug, title: page.title, status: page.status, locale: page.locale },
      verdict: 'needs_attention',
      block_count: 0,
      summary:
        'content_json is not a block array — this page renders nothing at all. '
        + 'Rewrite it with manage_page content_json as a JSON array of { type, data } blocks.',
      status: 'success',
    };
  }

  const fieldMap = validFields();
  const reqMap = toolRequired();

  const unreadFields: UnreadFieldFinding[] = [];
  const emptyBlocks: EmptyBlockFinding[] = [];
  const unknownTypes: UnknownTypeFinding[] = [];
  const blockReports: BlockReport[] = [];
  const typeCounts: Record<string, number> = {};

  blocks.forEach((block, index) => {
    const type = typeof block?.type === 'string' ? block.type : '';
    const dataRaw = block?.data;
    const bdata: Record<string, unknown> =
      dataRaw && typeof dataRaw === 'object' && !Array.isArray(dataRaw)
        ? (dataRaw as Record<string, unknown>)
        : {};
    const id = typeof block?.id === 'string' ? block.id : null;

    typeCounts[type || '(missing type)'] = (typeCounts[type || '(missing type)'] ?? 0) + 1;

    if (!type || !KNOWN_BLOCK_TYPES.includes(type)) {
      unknownTypes.push({
        block_index: index,
        block_type: type || '(missing)',
        did_you_mean: type ? suggestBlockTypes(type) : [],
      });
      blockReports.push({
        index, type: type || '(missing)', id,
        fields_written: Object.keys(bdata).length,
        fields_read_by_renderer: 0,
        unread_fields: Object.keys(bdata),
        renders_content: false,
        carries_media: false,
      });
      return;
    }

    const known = fieldMap.get(type);
    const written = Object.keys(bdata).filter((k) => !k.startsWith('_'));

    // ---- Finding 1: written but read by nothing --------------------------
    // Only for types that HAVE a declared field list. The data-driven blocks
    // (products, kb-hub, …) have no creation tool, so "unknown" would be a
    // guess, and a guess here reads as an instruction to delete good content.
    const unread = known && known.size > 0 ? written.filter((k) => !known.has(k)) : [];
    for (const f of unread) {
      const suggestions = suggestBlockFields(type, f);
      unreadFields.push({
        block_index: index,
        block_type: type,
        field: f,
        likely_meant: suggestions[0] ?? null,
        value_preview: preview(bdata[f]),
      });
    }

    // ---- Finding 2: renders as an empty band -----------------------------
    // Data-driven blocks fetch their own rows; an empty `data` is correct for
    // them and flagging it would be noise.
    let rendersContent = true;
    if (!DATA_DRIVEN.has(type)) {
      const contract = BLOCK_CONTRACTS[type];
      const groups: string[][] = contract
        ? contract.required
        : (reqMap.get(type) ?? []).map((f) => [f]);
      const missing = groups.filter((group) => !group.some((f) => isPresent(bdata[f])));
      if (missing.length > 0) {
        rendersContent = false;
        emptyBlocks.push({
          block_index: index,
          block_type: type,
          missing: missing.map((g) => g.join(' or ')),
          reason:
            `"${type}" renders nothing without ${missing.map((g) => g.join(' or ')).join(' and ')}`
            + (unread.length
              ? ` — note this block also wrote ${unread.map((f) => `"${f}"`).join(', ')}, which nothing reads.`
              : '.'),
        });
      }
    }

    const carriesMedia = written.some((k) => MEDIA_FIELD.test(k) && isPresent(bdata[k]));

    blockReports.push({
      index, type, id,
      fields_written: written.length,
      fields_read_by_renderer: written.length - unread.length,
      unread_fields: unread,
      renders_content: rendersContent,
      carries_media: carriesMedia,
    });
  });

  /* ---- Finding 3: composition ------------------------------------------ */
  const types = blocks.map((b) => (typeof b?.type === 'string' ? b.type : '(missing)'));
  const textCount = typeCounts['text'] ?? 0;
  const adjacentRepeats: Array<{ from_index: number; type: string }> = [];
  for (let i = 0; i + 1 < types.length; i++) {
    if (types[i] === types[i + 1]) adjacentRepeats.push({ from_index: i, type: types[i] });
  }
  const mediaBlocks = blockReports.filter((b) => b.carries_media).length;

  const notes: string[] = [];
  if (blocks.length === 0) {
    notes.push('The page has no blocks at all — a visitor sees an empty document.');
  } else {
    if (types[0] !== 'hero') notes.push(`Opens on "${types[0]}"; 55 of the 70 shipped template pages open on "hero".`);
    if (types[types.length - 1] !== 'cta') notes.push(`Closes on "${types[types.length - 1]}"; 32 of 70 shipped pages close on "cta" — the page never makes its ask.`);
    if (textCount >= 2) notes.push(`${textCount} "text" blocks. Not one of the 70 shipped template pages contains two — three claims belong in "features" or "stats", steps in "timeline", questions in "accordion".`);
    if (blocks.length >= 4 && textCount / blocks.length > 0.34) notes.push(`"text" is ${Math.round((textCount / blocks.length) * 100)}% of this page; across the shipped templates it is 2.9%. This page is an essay with headings, not a composition.`);
    for (const r of adjacentRepeats) notes.push(`Blocks ${r.from_index} and ${r.from_index + 1} are both "${r.type}" — back-to-back same type is the signal that one of them wanted to be something else.`);
    if (mediaBlocks === 0 && blocks.length >= 3) notes.push('No block carries an image, video, logo or icon — the page is a wall of text to look at.');
    if (new Set(types).size <= 2 && blocks.length >= 4) notes.push(`Only ${new Set(types).size} distinct block types across ${blocks.length} blocks — the page does not alternate visual weight.`);
  }

  const issueCount = unreadFields.length + emptyBlocks.length + unknownTypes.length;
  const verdict = issueCount > 0 ? 'needs_attention' : notes.length > 0 ? 'renders_but_thin' : 'ok';

  return {
    page: {
      id: page.id,
      slug: page.slug,
      title: page.title,
      status: page.status,
      locale: page.locale,
      updated_at: page.updated_at,
      ...(otherLocales.length ? { other_locales: otherLocales } : {}),
      // Named, never silent: the caller asked for one locale and got another.
      ...(localeNote ? { locale_note: localeNote } : {}),
    },
    verdict,
    block_count: blocks.length,

    // Question 1: what did I write that nothing reads?
    unread_fields: unreadFields,
    // Question 2: what renders as an empty band?
    empty_blocks: emptyBlocks,
    unknown_block_types: unknownTypes,

    // Question 3: is this a page or an essay?
    composition: {
      block_count: blocks.length,
      distinct_types: new Set(types).size,
      type_counts: typeCounts,
      order: types,
      text_block_count: textCount,
      text_share_pct: blocks.length ? Math.round((textCount / blocks.length) * 100) : 0,
      adjacent_repeats: adjacentRepeats,
      blocks_with_media: mediaBlocks,
      opens_with: types[0] ?? null,
      closes_with: types[types.length - 1] ?? null,
      notes,
    },

    blocks: blockReports,
    summary: buildSummary(page.slug, blocks.length, unreadFields, emptyBlocks, unknownTypes, notes),
    status: 'success',
  };
}

function preview(v: unknown): string {
  if (typeof v === 'string') return v.length > 60 ? `${v.slice(0, 57)}…` : v;
  try {
    const s = JSON.stringify(v);
    return s && s.length > 60 ? `${s.slice(0, 57)}…` : String(s);
  } catch {
    return String(v);
  }
}

function buildSummary(
  slug: string,
  blockCount: number,
  unread: UnreadFieldFinding[],
  empty: EmptyBlockFinding[],
  unknownTypes: UnknownTypeFinding[],
  notes: string[],
): string {
  const parts: string[] = [`/${slug}: ${blockCount} block(s).`];
  if (unread.length) {
    const named = unread
      .map((u) => `${u.block_type}.${u.field}${u.likely_meant ? ` → "${u.likely_meant}"` : ''}`)
      .join(', ');
    parts.push(`${unread.length} field(s) stored that NO renderer reads: ${named}. Rewrite the block with the right names — the content is in the database but invisible.`);
  }
  if (empty.length) {
    parts.push(`${empty.length} block(s) render as an empty section: ${empty.map((e) => `#${e.block_index} ${e.block_type} (missing ${e.missing.join(' and ')})`).join(', ')}.`);
  }
  if (unknownTypes.length) {
    parts.push(`${unknownTypes.length} block(s) use a type the renderer does not know: ${unknownTypes.map((u) => u.block_type).join(', ')} — these render as nothing.`);
  }
  if (!unread.length && !empty.length && !unknownTypes.length) {
    parts.push('Every written field is read by the renderer and every block renders content.');
  }
  if (notes.length) parts.push(`Composition: ${notes.length} note(s) — see composition.notes.`);
  return parts.join(' ');
}
