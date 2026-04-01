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

// ---------------------------------------------------------------------------
// Pre-save validation (agentic feedback loop)
// ---------------------------------------------------------------------------

/** Minimal filled example per block type — included in validation errors so the
 *  AI can self-correct on retry without needing to guess the structure. */
const BLOCK_HINTS: Record<string, Record<string, unknown>> = {
  features: {
    features: [
      { id: 'f1', icon: 'ShieldCheck', title: 'Secure', description: 'Enterprise-grade security' },
      { id: 'f2', icon: 'Zap', title: 'Fast', description: 'Sub-second response times' },
    ],
    columns: '3',
    variant: 'cards',
  },
  stats: {
    stats: [{ value: '10 000+', label: 'Customers', icon: 'Users' }, { value: '99.9%', label: 'Uptime', icon: 'Activity' }],
  },
  tabs: {
    tabs: [
      { id: 'tab-1', title: 'Overview', icon: 'Info',
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Tab content here.' }] }] } },
      { id: 'tab-2', title: 'Details', icon: 'List',
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'More details here.' }] }] } },
    ],
    variant: 'underline',
    defaultTab: 'tab-1',
  },
  accordion: {
    items: [
      { question: 'How does it work?',
        answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'It connects to your existing systems.' }] }] } },
      { question: 'What does it cost?',
        answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Plans from €49/month.' }] }] } },
    ],
  },
  'bento-grid': {
    items: [
      { id: 'b1', title: 'Monitoring', description: 'Live sensor data from all devices', icon: 'Activity', span: 'wide' },
      { id: 'b2', title: 'Alerts', description: 'Instant notifications', icon: 'Bell', span: 'normal' },
      { id: 'b3', title: 'Analytics', description: 'Deep insights', icon: 'BarChart3', span: 'normal' },
    ],
    columns: 3,
    variant: 'default',
  },
  'two-column': {
    content: { type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Section title' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Describe your offer here.' }] },
    ]},
    imageSrc: 'https://example.com/image.jpg',
    imageAlt: 'Descriptive alt text',
    imagePosition: 'right',
  },
  pricing: {
    tiers: [
      { id: 't1', name: 'Starter', price: '€49', period: 'month',
        features: ['Feature A', 'Feature B'], buttonText: 'Get started', buttonUrl: '/contact' },
      { id: 't2', name: 'Pro', price: '€99', period: 'month', highlighted: true,
        features: ['Everything in Starter', 'Feature C', 'Feature D'], buttonText: 'Get started', buttonUrl: '/contact' },
    ],
    variant: 'cards',
  },
  testimonials: {
    testimonials: [
      { id: 't1', content: 'This product changed how we work.', author: 'Anna S.', role: 'CEO', company: 'Acme AB', rating: 5 },
    ],
    layout: 'grid',
    variant: 'cards',
  },
  team: {
    members: [
      { id: 'm1', name: 'Anna Svensson', role: 'CEO', bio: 'Leading the company since 2018.', photo: '' },
    ],
    columns: 3,
  },
};

/** Minimal Tiptap doc — used in error messages when a Tiptap field is wrong. */
const TIPTAP_HINT = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Your text here"}]}]}';

export interface BlockValidationResult {
  valid: boolean;
  errors: string[];
  /** Human-readable hint describing correct structure — shown to the AI on retry. */
  hint?: string;
  /** Minimal filled example for this block type — helps the AI self-correct. */
  example?: Record<string, unknown>;
}

/**
 * Validate a single block's data before saving.
 *
 * Returns actionable feedback so FlowPilot can self-correct on retry:
 *   { valid: false, errors: [...], hint: "...", example: {...} }
 *
 * Called by agent-execute before every add/update write.
 */
export function validateBlockData(
  blockType: string,
  blockData: Record<string, unknown>,
): BlockValidationResult {
  const errors: string[] = [];

  const contract = BLOCK_CONTRACTS[blockType];
  if (!contract) {
    // Unknown block type — pass through (normalize handles it)
    return { valid: true, errors: [] };
  }

  // 1. Forbidden fields
  if (contract.forbidden) {
    const bad = contract.forbidden.filter((f) => blockData[f] !== undefined && blockData[f] !== null);
    if (bad.length > 0) {
      errors.push(`"${blockType}" block has forbidden field(s): ${bad.join(', ')} — these belong to other block types`);
    }
  }

  // 2. Required field groups
  for (const group of contract.required) {
    const hasAny = group.some((f) => {
      const val = blockData[f];
      if (val === undefined || val === null) return false;
      if (typeof val === 'string' && val.trim() === '') return false;
      if (Array.isArray(val) && val.length === 0) return false;
      return true;
    });
    if (!hasAny) {
      errors.push(
        group.length === 1
          ? `"${blockType}" block is missing required field: "${group[0]}"`
          : `"${blockType}" block must have at least one of: ${group.map((f) => `"${f}"`).join(' | ')}`,
      );
    }
  }

  // 3. Top-level Tiptap fields must be objects, not strings
  for (const field of TIPTAP_FIELDS) {
    if (typeof blockData[field] === 'string') {
      errors.push(
        `"${blockType}" block: field "${field}" is a raw string — must be Tiptap JSON: ${TIPTAP_HINT}`,
      );
    }
  }

  // 4. Nested Tiptap fields inside arrays
  for (const { blockType: bt, arrayField, itemField } of TIPTAP_NESTED_FIELDS) {
    if (bt !== blockType) continue;
    const arr = blockData[arrayField];
    if (!Array.isArray(arr)) continue;
    arr.forEach((item: Record<string, unknown>, i: number) => {
      if (typeof item[itemField] === 'string') {
        errors.push(
          `"${blockType}" block: ${arrayField}[${i}].${itemField} is a raw string — must be Tiptap JSON: ${TIPTAP_HINT}`,
        );
      }
    });
  }

  if (errors.length === 0) return { valid: true, errors: [] };

  const example = BLOCK_HINTS[blockType];
  const hint = example
    ? `Correct "${blockType}" structure: ${JSON.stringify(example)}`
    : `Check the block schema for "${blockType}" and ensure all required fields are present.`;

  return { valid: false, errors, hint, example };
}
