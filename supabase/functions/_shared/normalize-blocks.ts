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
import { TIPTAP_NESTED_FIELDS, IMPORTABLE_BLOCK_TYPES } from './block-schema.ts';
import { BLOCK_CREATION_TOOLS, toolNameToBlockType } from './block-tools.ts';

// ---------------------------------------------------------------------------
// Tiptap helpers
// ---------------------------------------------------------------------------

/** Top-level (and nested) block data fields that must be Tiptap JSON docs. */
// leftColumn/rightColumn are what TwoColumnBlock actually reads for its
// two-text mode. leftContent/rightContent match no renderer — kept only so any
// stored legacy rows keep normalizing, but do not write new content to them.
export const TIPTAP_FIELDS = ['content', 'leftColumn', 'rightColumn', 'leftContent', 'rightContent', 'body', 'answer', 'secondaryContent'];

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

  // 0. Field ALIASES — the names models reach for that no renderer reads.
  // These run FIRST so the validation gate never sees the wrong name (and so
  // the unknown-field check below judges the corrected shape). Every mapping
  // below is a name a real agent write used; the renderer's own name wins.
  //
  // `heading` → `title`: universal. No block reads `heading`; every block that
  // has a headline calls it `title`.
  if (typeof data.heading === 'string' && data.heading.trim() !== '') {
    if (data.title === undefined || data.title === null || String(data.title).trim() === '') {
      data.title = data.heading;
    }
    delete data.heading; // never renders — keeping it only re-teaches the mistake
  }

  if (block.type === 'hero') {
    // HeroBlock reads primaryButton: { text, url }. Agents write the flat
    // cta-shaped pair (buttonText + buttonLink/buttonUrl) that the cta block
    // uses — plausible, and silently invisible in the hero.
    const btnText = data.buttonText;
    const btnUrl = data.buttonLink ?? data.buttonUrl;
    if (typeof btnText === 'string' && btnText.trim() !== '' && !data.primaryButton) {
      data.primaryButton = { text: btnText, url: typeof btnUrl === 'string' ? btnUrl : '' };
    }
    delete data.buttonText;
    delete data.buttonLink;
    delete data.buttonUrl;
    // `body` is the text block's word for it; the hero's supporting line is
    // `subtitle`. (body is also a TIPTAP_FIELD, so an unmapped body would be
    // converted to a Tiptap doc the hero never renders.)
    if (data.body !== undefined && (data.subtitle === undefined || data.subtitle === null || String(data.subtitle).trim() === '')) {
      if (typeof data.body === 'string' && data.body.trim() !== '') {
        data.subtitle = data.body;
        delete data.body;
      }
    }
  }

  if (block.type === 'cta') {
    // CtaBlock reads buttonUrl. `buttonLink` is the most common miss and reads
    // as a working CTA in the payload while the button links nowhere.
    if (typeof data.buttonLink === 'string' && data.buttonLink.trim() !== ''
        && (data.buttonUrl === undefined || data.buttonUrl === null || String(data.buttonUrl).trim() === '')) {
      data.buttonUrl = data.buttonLink;
    }
    delete data.buttonLink;

    // `buttons: [{ text, url }, ...]` — the shape a multi-button CTA suggests.
    // CTABlock has exactly two fixed slots, so the first entry becomes the
    // primary pair and the second the secondary one; anything beyond that has
    // nowhere to render. Every mapping below only fills an empty slot, so a
    // flat field the caller also sent explicitly wins over the array.
    if (Array.isArray(data.buttons)) {
      const slots = [
        ['buttonText', 'buttonUrl'],
        ['secondaryButtonText', 'secondaryButtonUrl'],
      ] as const;
      (data.buttons as unknown[]).slice(0, slots.length).forEach((btn, i) => {
        if (!btn || typeof btn !== 'object') return;
        const b = btn as Record<string, unknown>;
        const [textKey, urlKey] = slots[i];
        const text = b.text ?? b.label ?? b.title;
        const url = b.url ?? b.link ?? b.href;
        if (typeof text === 'string' && text.trim() !== ''
            && (data[textKey] === undefined || data[textKey] === null || String(data[textKey]).trim() === '')) {
          data[textKey] = text;
        }
        if (typeof url === 'string' && url.trim() !== ''
            && (data[urlKey] === undefined || data[urlKey] === null || String(data[urlKey]).trim() === '')) {
          data[urlKey] = url;
        }
      });
    }
    delete data.buttons;

    // `primaryButtonText`/`primaryButtonUrl` — the hero's naming reached for on
    // the cta. Nothing renders them; the cta calls the same pair buttonText/
    // buttonUrl. This alias is what makes trimming the required OR-group to
    // ["buttonText"] safe: a legacy row carrying only the old name is rewritten
    // to the renderer's name before the gate judges it, so it stays editable.
    for (const [from, to] of [['primaryButtonText', 'buttonText'], ['primaryButtonUrl', 'buttonUrl']] as const) {
      if (typeof data[from] === 'string' && data[from].trim() !== ''
          && (data[to] === undefined || data[to] === null || String(data[to]).trim() === '')) {
        data[to] = data[from];
      }
      delete data[from];
    }
  }

  if (block.type === 'features') {
    // FeaturesBlock renders data.features only. `items` is what the other
    // card-shaped blocks (bento-grid, accordion, marquee) call the same array,
    // so it is the obvious wrong guess here — and it used to be named in the
    // required OR-group while being refused by the unknown-field gate.
    if (Array.isArray(data.items) && !Array.isArray(data.features)) {
      data.features = data.items;
    }
    delete data.items;
  }

  if (block.type === 'two-column') {
    // leftContent/rightContent match no renderer (see TIPTAP_FIELDS above).
    // TwoColumnBlock's two-text mode reads leftColumn/rightColumn.
    for (const [from, to] of [['leftContent', 'leftColumn'], ['rightContent', 'rightColumn']] as const) {
      if (data[from] !== undefined && (data[to] === undefined || data[to] === null)) {
        data[to] = typeof data[from] === 'string' ? htmlToTiptap(data[from] as string) : data[from];
      }
      delete data[from];
    }
  }

  if (block.type === 'text') {
    // TextBlock renders `content` only. `text` and `body` are what models
    // reach for; both produced blocks that saved fine and rendered blank.
    for (const from of ['text', 'body'] as const) {
      const val = data[from];
      const contentEmpty = data.content === undefined || data.content === null;
      if (val !== undefined && contentEmpty) {
        data.content = typeof val === 'string' ? htmlToTiptap(val) : val;
      }
      if (val !== undefined) delete data[from];
    }
  }

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

  // 3b. bento-grid: agents write plausible-but-wrong shapes (FlowChat on optic
  // 2026-08-19 — lowercase icons, no item ids, columns 2, invented layout/cta
  // fields). The renderer looks icons up by EXACT lucide PascalCase name, and
  // the editor keys items by id, so normalize what is safely mechanical here;
  // invented fields are rejected by the contract below with a hint instead.
  if (block.type === 'bento-grid') {
    if (Array.isArray(data.items)) {
      data.items = (data.items as Record<string, unknown>[]).map((item, i) => ({
        ...item,
        id: item.id || `bento-${Date.now()}-${i}`,
        // 'cpu' → 'Cpu'. Multi-word lucide names (TrendingUp) can't be derived
        // from all-lowercase, but single words are the common agent mistake.
        icon: typeof item.icon === 'string' && item.icon
          ? (item.icon as string).charAt(0).toUpperCase() + (item.icon as string).slice(1)
          : item.icon,
      }));
    }
    const cols = Number(data.columns);
    if (data.columns !== undefined && cols !== 3 && cols !== 4) {
      console.warn(`[normalize] Block ${block.id} (bento-grid): columns ${data.columns} → 3 (schema allows 3 or 4)`);
      data.columns = 3;
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
 *
 * INVARIANT: every name in a group must be a valid field for that block type
 * (i.e. present in block-reference.ts, and so in the generated
 * BLOCK_CREATION_TOOLS the unknown-FIELD gate reads). A name that only exists
 * here is a trap: it satisfies this gate and is then refused by the unknown-
 * field gate, while the "must have at least one of: …" error text hands the
 * agent that unusable name to retry with. `cta` carried
 * primaryButtonText|buttons and `features` carried items that way until
 * 2026-08-22 — both are now aliased to the renderer's name in
 * normalizeBlockData instead. Pinned by the contract/field-parity test in
 * src/lib/__tests__/block-write-safety.guardrails.test.ts.
 */
export const BLOCK_CONTRACTS: Record<string, { required: string[][]; forbidden?: string[] }> = {
  hero:               { required: [['title']] },
  text:               { required: [['content']] },
  quote:              { required: [['quote']] },
  cta:                { required: [['buttonText']], forbidden: ['videoUrl', 'videoType'] },
  features:           { required: [['features']], forbidden: ['backgroundType', 'videoUrl'] },
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
  // Terms block: content comes from published contract_templates via RPC —
  // the block itself has only presentation options, nothing required.
  terms:              { required: [] },
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
  'bento-grid':       { required: [['items']], forbidden: ['layout', 'ctaText', 'ctaLink'] },
  'notification-toast': { required: [['notifications']] },
  // Were only in the test mirror — synced back so the runtime gate matches it.
  popup:              { required: [] },
  'latest-posts':     { required: [] },
  // Added 2026-07-25: these became importable without contracts, which left the
  // import gate skipping them entirely (and CI red). Permissive where the block
  // has a designed empty state or auto-fetches its own data; a data requirement
  // only where the block renders nothing at all without it (same convention as
  // features/stats/testimonials above).
  'parallax-section': { required: [['title', 'backgroundImage']] },
  'section-divider':  { required: [] },   // pure layout (shape/colour), like `separator`
  'featured-carousel': { required: [['slides']] },
  'sticky-scroll':    { required: [['chapters']] },
  'ai-faq':           { required: [] },   // has emptyStateText — empty is a designed state
  'pricing-calculator': { required: [['variables', 'basePrice']] },
  'quick-links':      { required: [['links']] },
  'chat-launcher':    { required: [] },   // auto-connects to the chat endpoint
  'ai-assistant':     { required: [] },   // auto-connects to the chat endpoint
  contact:            { required: [] },   // renders a form; title/subtitle optional
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
        block._remove_reason = `"${block.type}" block: forbidden fields [${bad.join(', ')}]`;
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
        // Self-correcting reason (the Tiptap-error pattern): name the block,
        // the field it needs, and — when the caller plainly used a common
        // wrong name — what they probably meant. The live miss: a stats block
        // with `items` was dropped without a word.
        const hint = String(block.type) === 'stats' && (data as any).items !== undefined
          ? ' (you sent "items" — the stats block calls this field "stats")'
          : '';
        block._remove_reason = `"${block.type}" block: missing required field [${group.join(' or ')}]${hint}`;
        break;
      }
    }
  }
}

/** Remove all blocks marked with `_remove` in-place. Returns the reasons, so
 * callers can refuse-with-detail instead of silently shipping a thinner page. */
export function stripRemovedBlocks(blocks: Record<string, unknown>[]): string[] {
  const reasons = blocks.filter((b) => b._remove)
    .map((b) => String(b._remove_reason ?? `"${b.type}" block: invalid`));
  if (reasons.length === 0) return [];
  const clean = blocks.filter((b) => !b._remove);
  blocks.length = 0;
  blocks.push(...clean);
  console.log(`[normalize] Removed ${reasons.length} invalid block(s)`);
  return reasons;
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
): string[] {
  const { validate = true } = options;
  const typed = blocks as Record<string, unknown>[];

  for (const block of typed) {
    normalizeBlockData(block);
  }

  applyIconFallbacks(typed);

  if (validate) {
    validateBlockContracts(typed);
    return stripRemovedBlocks(typed);
  }
  return [];
}

// ---------------------------------------------------------------------------
// Pre-save validation (agentic feedback loop)
// ---------------------------------------------------------------------------

/** Minimal filled example per block type — included in validation errors so the
 *  AI can self-correct on retry without needing to guess the structure. */
const BLOCK_HINTS: Record<string, Record<string, unknown>> = {
  // hero/text are the two most-written blocks and had no example at all — the
  // fallback hint ("check the schema") is exactly the dead end that made agents
  // re-send buttonText/heading/body a second time.
  hero: {
    eyebrow: 'SINCE 1998',
    title: 'Your headline here',
    subtitle: 'One supporting line that says what you do.',
    primaryButton: { text: 'Get started', url: '/contact' },
  },
  text: {
    title: 'Section title',
    content: { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Your paragraph text here.' }] },
    ]},
  },
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

// ---------------------------------------------------------------------------
// Known types & known fields (fail-closed write gate)
// ---------------------------------------------------------------------------

/**
 * Block types that RENDER but are deliberately excluded from AI page-IMPORT,
 * so they are absent from IMPORTABLE_BLOCK_TYPES (block-reference.ts →
 * getImportableBlockTypes()). They fetch their own data from the DB, which is
 * why an importer must not invent them — but an agent adding a products or a
 * kb-hub block to a page is doing something completely legitimate, and the
 * write gate must not call those types "invented".
 * Kept in sync with block-reference.ts by
 * src/lib/__tests__/block-write-safety.guardrails.test.ts.
 */
export const DATA_DRIVEN_BLOCK_TYPES = [
  'products', 'cart', 'featured-product',
  'kb-featured', 'kb-hub', 'kb-search', 'kb-accordion',
  'smart-booking', 'handbook', 'consultant-matcher',
] as const;

/** Every block type BlockRenderer can render — the write gate's allowlist. */
export const KNOWN_BLOCK_TYPES: readonly string[] = [
  ...IMPORTABLE_BLOCK_TYPES,
  ...DATA_DRIVEN_BLOCK_TYPES,
];

/**
 * Valid top-level data field names per block type, derived from the generated
 * BLOCK_CREATION_TOOLS (whose properties ARE the block-reference field list).
 * Built once, lazily — the tools array is large and most calls never need it.
 */
let _blockFieldsCache: Map<string, Set<string>> | null = null;
function blockFieldMap(): Map<string, Set<string>> {
  if (_blockFieldsCache) return _blockFieldsCache;
  const map = new Map<string, Set<string>>();
  for (const tool of BLOCK_CREATION_TOOLS as readonly any[]) {
    const type = toolNameToBlockType(tool?.function?.name ?? '');
    if (!type) continue;
    map.set(type, new Set(Object.keys(tool?.function?.parameters?.properties ?? {})));
  }
  _blockFieldsCache = map;
  return map;
}

const TYPE_SYNONYMS: Record<string, string[]> = {
  // Names real agent writes invented, where the closest valid type shares no
  // letters with the guess. Suggestion text only — nothing routes on this.
  faq: ['accordion', 'ai-faq'],
  faqs: ['accordion', 'ai-faq'],
  questions: ['accordion', 'ai-faq'],
  banner: ['hero', 'announcement-bar'],
  paragraph: ['text'],
  richtext: ['text'],
  content: ['text'],
  video: ['youtube', 'embed'],
  button: ['cta'],
  buttons: ['cta', 'quick-links'],
  columns: ['two-column'],
  card: ['features', 'bento-grid'],
  cards: ['features', 'bento-grid'],
  grid: ['features', 'bento-grid'],
  services: ['features', 'bento-grid'],
  clients: ['logos', 'testimonials'],
  reviews: ['testimonials'],
  people: ['team'],
  staff: ['team'],
  'contact-form': ['contact', 'form'],
  faqsection: ['accordion', 'ai-faq'],
};

/**
 * Suggest the valid types closest to what the caller invented. Deliberately a
 * crude similarity (substring both ways + word/initialism match), not a
 * fuzzy-match library: its job is to put the right name in the error text, and
 * the full type list travels in the hint anyway.
 */
export function suggestBlockTypes(invented: string): string[] {
  const n = String(invented || '').toLowerCase().replace(/[\s_]+/g, '-');
  const bare = n.replace(/-/g, '');
  const synonyms = TYPE_SYNONYMS[n] ?? TYPE_SYNONYMS[bare] ?? [];
  const scored: Array<{ type: string; score: number }> = [];
  for (const type of KNOWN_BLOCK_TYPES) {
    const t = type.toLowerCase();
    const tBare = t.replace(/-/g, '');
    let score = 0;
    if (tBare === bare) score = 100;
    else if (bare.includes(tBare) || tBare.includes(bare)) score = 60 + Math.min(tBare.length, bare.length);
    else {
      // shared leading run ("faq" ↔ "ai-faq" is caught above; "testimonial" ↔
      // "testimonials" and "call-to-action" ↔ "cta" need the word-level pass)
      const words = n.split('-').filter(Boolean);
      const tWords = t.split('-').filter(Boolean);
      const shared = words.filter((w) => tWords.some((tw) => tw.startsWith(w) || w.startsWith(tw)));
      if (shared.length > 0) score = 20 + shared.length * 5;
      // initialism: call-to-action → cta
      const initials = words.map((w) => w[0]).join('');
      if (initials.length > 1 && initials === tBare) score = 90;
    }
    if (score > 0) scored.push({ type, score });
  }
  const ranked = scored.sort((a, b) => b.score - a.score || a.type.length - b.type.length)
    .map((s) => s.type);
  return [...new Set([...synonyms, ...ranked])].slice(0, 3);
}

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
 * Called by agent-execute before every add/update write — and ALWAYS AFTER
 * normalizeBlockData(), so the alias mapping (heading→title, hero buttonText→
 * primaryButton, raw strings→Tiptap) has already run and the gate judges the
 * shape that will actually be stored.
 *
 * `options.unknownFieldScope` limits the unknown-FIELD check to one object —
 * the update path passes the caller's incoming fields, because merged data can
 * legitimately carry fields written before this gate existed, and refusing
 * those would leave a page permanently un-editable by an agent.
 */
export function validateBlockData(
  blockType: string,
  blockData: Record<string, unknown>,
  options: { unknownFieldScope?: Record<string, unknown> } = {},
): BlockValidationResult {
  const errors: string[] = [];

  // 0. Unknown block TYPE — fail closed. An invented type used to be written
  // through untouched: it saved, "succeeded", and rendered as nothing at all
  // (BlockRenderer has no case for it), so the agent reported a section that
  // did not exist. Naming the near misses turns the dead end into a retry.
  if (!KNOWN_BLOCK_TYPES.includes(blockType)) {
    const suggestions = suggestBlockTypes(blockType);
    return {
      valid: false,
      errors: [
        `"${blockType}" is not a block type — nothing renders it, so this block would be invisible on the page.`
        + (suggestions.length ? ` Did you mean: ${suggestions.map((s) => `"${s}"`).join(', ')}?` : ''),
      ],
      hint: `Valid block types: ${KNOWN_BLOCK_TYPES.join(', ')}. `
        + 'Call describe_blocks (optionally with block_type) for each type\'s exact field contract.',
    };
  }

  // 0b. Unknown top-level FIELDS on a known type. These used to be written and
  // silently ignored by the renderer — the call answered "updated" while the
  // page did not change. Keys starting with "_" are internal plumbing.
  const validFields = blockFieldMap().get(blockType);
  if (validFields && validFields.size > 0) {
    const scope = options.unknownFieldScope ?? blockData;
    const unknown = Object.keys(scope).filter((k) => !k.startsWith('_') && !validFields.has(k));
    if (unknown.length > 0) {
      errors.push(
        `"${blockType}" block has unknown field(s): ${unknown.join(', ')} — nothing reads them, so they would be stored and never rendered. `
        + `Valid fields for "${blockType}": ${[...validFields].join(', ')}`,
      );
    }
  }

  const contract = BLOCK_CONTRACTS[blockType];
  if (!contract) {
    // Known, renderable type with no required/forbidden contract (e.g. the
    // data-driven blocks). The unknown-field check above still applies.
    return errors.length === 0
      ? { valid: true, errors: [] }
      : { valid: false, errors, hint: `Check describe_blocks({ block_type: "${blockType}" }) for the exact field contract.` };
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
