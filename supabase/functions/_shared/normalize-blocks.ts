/**
 * Shared block normalization utilities.
 *
 * Used by both agent-execute and migrate-page to guarantee that blocks
 * written to pages.content_json are always in a valid, renderable state —
 * regardless of how the AI chose to format them.
 *
 * Call order inside normalizeBlocks():
 *   1. normalizeBlockData  — tiptap fields, team mapping, table structure
 *   2. applyIconFallbacks  — assign icons where missing
 *   3. validateBlockContracts — mark blocks missing required fields with _remove
 *   4. strip _remove blocks
 *
 * TIPTAP_NESTED_FIELDS is auto-generated from block-reference.ts via sync-block-schema.ts.
 * To add nested tiptap handling for a new block: add itemFields to the array field in
 * block-reference.ts and re-run: bun run scripts/sync-block-schema.ts
 */
import { TIPTAP_NESTED_FIELDS } from './block-schema.ts';

// ---------------------------------------------------------------------------
// Tiptap helpers
// ---------------------------------------------------------------------------

/** Top-level (and nested) block data fields that must be Tiptap JSON docs. */
export const TIPTAP_FIELDS = ['content', 'leftContent', 'rightContent', 'body', 'answer'];

/** Convert a raw HTML/plain-text string into a minimal valid Tiptap doc. */
export function htmlToTiptap(html: string): Record<string, unknown> {
  const text = html.replace(/<[^>]*>/g, '').trim();
  if (!text) return { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
  const paragraphs = text.split(/\n\n|\n/).filter((p: string) => p.trim());
  return {
    type: 'doc',
    content: paragraphs.map((p: string) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: p.trim() }],
    })),
  };
}

// ---------------------------------------------------------------------------
// Per-block normalizer
// ---------------------------------------------------------------------------

/**
 * Normalise a single block's data object **in-place**:
 * - Convert raw string Tiptap fields → valid Tiptap JSON
 * - Walk nested arrays (tabs[].content, accordion[].answer)
 * - Map team.members[].image → .photo
 * - Normalise table columns/rows structure
 */
export function normalizeBlockData(block: Record<string, unknown>): void {
  const data = block.data as Record<string, unknown> | undefined;
  if (!data) return;

  // 1. Top-level tiptap fields
  for (const field of TIPTAP_FIELDS) {
    if (typeof data[field] === 'string') {
      console.warn(
        `[normalize] Block ${block.id} (${block.type}): field "${field}" was raw string — converting to Tiptap`,
      );
      data[field] = htmlToTiptap(data[field] as string);
    }
  }

  // 2. Nested tiptap fields — auto-discovered from TIPTAP_NESTED_FIELDS (generated from block-reference.ts)
  for (const { blockType, arrayField, itemField } of TIPTAP_NESTED_FIELDS) {
    if (block.type === blockType && Array.isArray(data[arrayField])) {
      for (const item of data[arrayField] as Record<string, unknown>[]) {
        if (typeof item[itemField] === 'string') {
          console.warn(
            `[normalize] Block ${block.id} (${blockType}): ${arrayField}[].${itemField} was raw string — converting`,
          );
          item[itemField] = htmlToTiptap(item[itemField] as string);
        }
      }
    }
  }

  // 4. team: AI returns "image", frontend expects "photo"
  if (block.type === 'team' && Array.isArray(data.members)) {
    data.members = (data.members as Record<string, unknown>[]).map(
      (member: Record<string, unknown>) => {
        const normalized: Record<string, unknown> = {
          ...member,
          id: member.id || `member-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          photo: member.photo || member.image || '',
          role: member.role || '',
        };
        delete normalized.image;
        return normalized;
      },
    );
  }

  // 5. table: ensure columns have ids and rows map correctly
  if (block.type === 'table') {
    if (!Array.isArray(data.columns)) {
      data.columns = [];
    } else {
      data.columns = (data.columns as Record<string, unknown>[]).map(
        (col: Record<string, unknown>, i: number) => ({
          id: col.id || `col${i + 1}`,
          header: col.header || col.name || col.title || `Column ${i + 1}`,
          align: col.align || 'left',
        }),
      );
    }

    const columns = data.columns as Array<{ id: string; header: string }>;

    if (!Array.isArray(data.rows)) {
      data.rows = [];
    } else {
      data.rows = (data.rows as unknown[]).map((row) => {
        if (row && typeof row === 'object' && !Array.isArray(row)) {
          const rowObj = row as Record<string, unknown>;
          const normalized: Record<string, string> = {};
          columns.forEach((col) => {
            normalized[col.id] = String(rowObj[col.id] ?? rowObj[col.header] ?? '');
          });
          return normalized;
        }
        if (Array.isArray(row)) {
          const normalized: Record<string, string> = {};
          columns.forEach((col, i) => { normalized[col.id] = String(row[i] ?? ''); });
          return normalized;
        }
        const normalized: Record<string, string> = {};
        columns.forEach((col) => { normalized[col.id] = ''; });
        return normalized;
      });
    }

    data.variant = data.variant || 'default';
    data.size = data.size || 'md';
    data.stickyHeader = data.stickyHeader ?? false;
    data.highlightOnHover = data.highlightOnHover ?? true;
  }
}

// ---------------------------------------------------------------------------
// Icon fallbacks
// ---------------------------------------------------------------------------

/** Block types whose array items should always have an icon. */
export const ICON_FALLBACKS: Record<string, string> = {
  features: 'Star',
  stats: 'TrendingUp',
  timeline: 'Circle',
  'link-grid': 'Link',
  'trust-bar': 'ShieldCheck',
  'shipping-info': 'Truck',
};

/** Keyword → Lucide icon name mapping for context-aware guessing. */
export const KEYWORD_ICON_MAP: [RegExp, string][] = [
  [/temperatur|temp|värme|heat/i, 'Thermometer'],
  [/vatten|water|h2o|leak/i, 'Droplets'],
  [/luft|air|vent|ventil/i, 'Wind'],
  [/ljud|noise|sound|audio/i, 'Volume2'],
  [/säkerhet|security|safe|shield/i, 'ShieldCheck'],
  [/rök|smoke|brand|fire/i, 'Flame'],
  [/dörr|door|access/i, 'DoorOpen'],
  [/väg|road|trafik|traffic/i, 'Route'],
  [/väder|weather|climat/i, 'CloudSun'],
  [/snö|snow/i, 'Snowflake'],
  [/råtta|rat|pest|skadedjur/i, 'Bug'],
  [/radon|strålning|radiation/i, 'AlertTriangle'],
  [/sensor|iot|monitor/i, 'Activity'],
  [/moln|cloud|server/i, 'Cloud'],
  [/analys|ai|data|insikt/i, 'BarChart3'],
  [/energi|energy|el|power/i, 'Zap'],
  [/position|track|spår/i, 'MapPin'],
  [/desk|arbetsplats|kontors/i, 'Monitor'],
  [/besök|count|räkn/i, 'Users'],
  [/kontakt|contact|mail/i, 'Mail'],
  [/realtid|real.?time|live/i, 'Radio'],
  [/plattform|platform|integration/i, 'Layers'],
];

export function guessIcon(text: string, fallback: string): string {
  const lower = text.toLowerCase();
  for (const [re, icon] of KEYWORD_ICON_MAP) {
    if (re.test(lower)) return icon;
  }
  return fallback;
}

/**
 * Walk all blocks and assign a sensible icon to array items that are missing one.
 * Applies to: features, stats, timeline, link-grid, trust-bar, shipping-info.
 */
export function applyIconFallbacks(blocks: Record<string, unknown>[]): void {
  const ARRAY_FIELDS = ['features', 'stats', 'steps', 'items', 'links'];
  for (const block of blocks) {
    const data = block.data as Record<string, unknown> | undefined;
    if (!data) continue;
    const fallback = ICON_FALLBACKS[String(block.type)];
    if (!fallback) continue;
    for (const field of ARRAY_FIELDS) {
      const arr = data[field] as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        if (!item.icon || String(item.icon).trim() === '' || item.icon === 'null') {
          const searchText = `${item.title || ''} ${item.description || ''} ${item.label || ''}`;
          item.icon = guessIcon(searchText, fallback);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Block contract validation
// ---------------------------------------------------------------------------

/**
 * Required field contracts per block type.
 * Each inner array is an OR-group: at least one field in the group must be
 * present and non-empty for the block to be considered valid.
 */
export const BLOCK_CONTRACTS: Record<string, { required: string[][]; forbidden?: string[] }> = {
  hero:               { required: [['title']] },
  text:               { required: [['content']] },
  quote:              { required: [['quote']] },
  cta:                { required: [['buttonText', 'primaryButtonText', 'buttons']], forbidden: ['videoUrl', 'videoType'] },
  features:           { required: [['features', 'items']], forbidden: ['backgroundType', 'videoUrl'] },
  stats:              { required: [['stats']] },
  testimonials:       { required: [['testimonials']] },
  team:               { required: [['members']] },
  logos:              { required: [['logos']] },
  timeline:           { required: [['steps']] },
  accordion:          { required: [['items']] },
  image:              { required: [['src']] },
  gallery:            { required: [['images']] },
  youtube:            { required: [['videoId']] },
  'two-column':       { required: [['content', 'imageSrc']] },
  form:               { required: [['fields']] },
  newsletter:         { required: [] },
  map:                { required: [['address']] },
  booking:            { required: [] },
  pricing:            { required: [['tiers']] },
  comparison:         { required: [['products', 'features']] },
  tabs:               { required: [['tabs']] },
  marquee:            { required: [['items']] },
  embed:              { required: [['url']] },
  lottie:             { required: [['src']] },
  table:              { required: [['columns']] },
  countdown:          { required: [['targetDate']] },
  progress:           { required: [['items']] },
  badge:              { required: [['badges']] },
  'social-proof':     { required: [['items']] },
  'trust-bar':        { required: [['items']] },
  'shipping-info':    { required: [['items']] },
  'link-grid':        { required: [['links']] },
  'announcement-bar': { required: [['message']] },
  'floating-cta':     { required: [['buttonText']] },
  'article-grid':     { required: [] },
  'bento-grid':       { required: [['items']] },
  'notification-toast': { required: [['notifications']] },
};

/**
 * Validate required/forbidden fields and mark invalid blocks with `_remove: true`.
 * Call `stripRemovedBlocks()` after this to actually remove them.
 */
export function validateBlockContracts(blocks: Record<string, unknown>[]): void {
  for (const block of blocks) {
    const data = block.data as Record<string, unknown> | undefined;
    if (!data) { block._remove = true; continue; }

    const contract = BLOCK_CONTRACTS[String(block.type)];
    if (!contract) continue; // unknown type — keep as-is

    if (contract.forbidden) {
      const bad = contract.forbidden.filter((f) => data[f] !== undefined && data[f] !== null);
      if (bad.length > 0) {
        console.warn(
          `[validate] Block ${block.id} (${block.type}): forbidden fields [${bad.join(', ')}] — marking for removal`,
        );
        block._remove = true;
        continue;
      }
    }

    for (const group of contract.required) {
      const hasAny = group.some((f) => {
        const val = data[f];
        if (val === undefined || val === null) return false;
        if (typeof val === 'string' && val.trim() === '') return false;
        if (Array.isArray(val) && val.length === 0) return false;
        return true;
      });
      if (!hasAny) {
        console.warn(
          `[validate] Block ${block.id} (${block.type}): missing required fields [${group.join('|')}] — marking for removal`,
        );
        block._remove = true;
        break;
      }
    }
  }
}

/** Remove all blocks marked with `_remove` in-place. */
export function stripRemovedBlocks(blocks: Record<string, unknown>[]): void {
  const removed = blocks.filter((b) => b._remove).length;
  if (removed === 0) return;
  const clean = blocks.filter((b) => !b._remove);
  blocks.length = 0;
  blocks.push(...clean);
  console.log(`[normalize] Removed ${removed} invalid block(s)`);
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Full normalization pipeline for a content_json blocks array.
 *
 * Steps:
 *   1. normalizeBlockData  per block (tiptap, team, table)
 *   2. applyIconFallbacks  across all blocks
 *   3. validateBlockContracts (optional — set validate=false to skip removal)
 *   4. stripRemovedBlocks
 */
export function normalizeBlocks(
  blocks: unknown[],
  options: { validate?: boolean } = {},
): void {
  const { validate = true } = options;
  const typed = blocks as Record<string, unknown>[];

  for (const block of typed) {
    normalizeBlockData(block);
  }

  applyIconFallbacks(typed);

  if (validate) {
    validateBlockContracts(typed);
    stripRemovedBlocks(typed);
  }
}
