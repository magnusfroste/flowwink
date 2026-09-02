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
 *   3. validateBlockContracts — mark unknown TYPES, unknown FIELDS and blocks
 *      missing required fields with _remove (no step maps or aliases the type
 *      itself — see the reasoning in validateBlockContracts)
 *   4. strip _remove blocks
 *
 * TIPTAP_NESTED_FIELDS is auto-generated from block-reference.ts via sync-block-schema.ts.
 * To add nested tiptap handling for a new block: add itemFields to the array field in
 * block-reference.ts and re-run: bun run scripts/sync-block-schema.ts
 */
import { TIPTAP_NESTED_FIELDS, IMPORTABLE_BLOCK_TYPES } from './block-schema.ts';
import { BLOCK_CREATION_TOOLS, toolNameToBlockType } from './block-tools.ts';
import { suggestClosestNames } from './suggest-names.ts';

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
  // Block-level closers become line breaks BEFORE the tags are stripped —
  // otherwise "<h3>Faster</h3><ul><li>Visual</li>…" collapses into one
  // word-glued paragraph ("FasterVisual…"), which is exactly what an agent-
  // written tab looked like on 2026-09-02.
  const text = html
    .replace(/<\/(p|h[1-6]|li|div|tr)\s*>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .trim();
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
// Renderer-level field fallbacks (the only aliases a STORED page renders under)
// ---------------------------------------------------------------------------

/**
 * Alias → primary field names the RENDERER ITSELF falls back to.
 *
 *   StatsBlock:    `data.stats || (data as any).items`
 *   TimelineBlock: `data.steps || (data as any).items`
 *                  `data.variant || (data as any).layout`
 *
 * These are the one class of alias that is not a write-time rename: a block
 * stored under the alias RENDERS, today, untouched — and our own seed templates
 * ship 14 stats blocks and 9 timeline blocks in exactly that shape. Everything
 * else in this file renames BEFORE storage, so a stored value under one of
 * those names never reaches a renderer at all.
 *
 * That distinction is why this map is exported and why the fold below is a
 * named function rather than an inline branch: inspect_rendered_page reads
 * STORED blocks and must fold exactly these three pairs (or it reports content
 * that is visible on the page as "read by nothing"), and must fold nothing else
 * (or it goes blind to the very fields that were stored under a name the
 * renderer never looks at — the /agentic incident it exists for). One
 * implementation, two consumers; a second copy here would drift within a month
 * and start lying in both directions.
 */
export const FOLDED_ALIASES: Readonly<Record<string, ReadonlyArray<readonly [string, string]>>> = {
  stats: [['items', 'stats']],
  timeline: [['items', 'steps'], ['layout', 'variant']],
};

/**
 * Fold the renderer's own alias names to the primary name, **in place**.
 *
 * The write gate judges the block-reference field list, which documents only
 * the primary name, so without this pass the gate would refuse a shape the
 * platform itself ships and renders — a false refusal, and it would make every
 * template-installed page un-updatable through manage_page. Fold to the primary
 * name (one name wins, per Law 2) rather than documenting a second one in the
 * catalogue.
 *
 * Mutates: callers that must not touch their input (the sensor) pass a copy.
 */
export function applyRendererFallbacks(block: Record<string, unknown>): void {
  const data = block.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return;
  const pairs = FOLDED_ALIASES[String(block.type ?? '')];
  if (!pairs) return;
  for (const [from, to] of pairs) {
    const val = data[from];
    if (val === undefined) continue;
    const current = data[to];
    const targetEmpty = current === undefined || current === null
      || (typeof current === 'string' && current.trim() === '')
      || (Array.isArray(current) && current.length === 0);
    if (targetEmpty) data[to] = val;
    delete data[from];
  }
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
  // `heading`/`headline` → `title`: universal. Neither name is a field on ANY
  // block type (they appear in block-reference only inside prose descriptions
  // — "Main headline"), no renderer reads either, and every block that has one
  // calls it `title`. `headline` joined 2026-08-22 from the same live write that
  // exposed the envelope mix below: it is the identical class as `heading` — a
  // correctly-named block with one wrong field name, unambiguous in intent, and
  // nothing invisible gets saved by forgiving it. The skill instructions still
  // teach `title` (Law 2), exactly as they do for `heading`.
  //
  // `subheadline` → `subtitle` joined 2026-08-22 from the live /agentic hero on
  // optic, and passes the identical test: not a field on ANY block type, read by
  // no renderer, and every block with a supporting line calls it `subtitle` —
  // string in, string out, nothing ambiguous, nothing invisible saved. It is
  // also a word the platform itself put in front of the model: the landing-page
  // composer skill says "strong headline + subheadline + CTA". We aliased
  // `headline` from that same sentence; aliasing one half of a pair we wrote and
  // refusing the other would be the platform disagreeing with itself again.
  // Note what is NOT here: `subheading`, and the `primary_cta`/`secondary_cta`
  // from the same block. Aliases stay evidence-driven — a name nobody has
  // actually written gets the unknown-field refusal, which now names the right
  // field anyway (suggestBlockFields), so the model self-corrects and LEARNS the
  // name instead of having it silently swapped.
  //
  // The fold is catalogue-aware, and that is load-bearing: `quick-links` really
  // does call its heading `heading` (QuickLinksBlock reads data.heading), so an
  // unconditional heading→title rename took a CORRECT block and made it wrong —
  // silently before the field gate existed, and refused-with-the-wrong-name
  // after it. Never rename a field the block genuinely has, and never rename
  // INTO a field the block does not have: leaving the caller's own name in place
  // lets the refusal name what they actually sent.
  const knownFields = blockFieldMap().get(String(block.type ?? ''));
  for (const [alias, canonical] of [['heading', 'title'], ['headline', 'title'], ['subheadline', 'subtitle']] as const) {
    if (knownFields && (knownFields.has(alias) || !knownFields.has(canonical))) continue;
    const val = data[alias];
    if (typeof val === 'string' && val.trim() !== '') {
      const current = data[canonical];
      if (current === undefined || current === null || String(current).trim() === '') {
        data[canonical] = val;
      }
    }
    if (val !== undefined) delete data[alias]; // never renders — keeping it only re-teaches the mistake
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

  applyRendererFallbacks(block);

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
  // QuoteBlock renders `data.text`; `quote` is the LEGACY name block-reference
  // documents as "prefer text". Requiring `quote` alone was therefore a gate
  // that no correct block could pass and no incorrect one was caught by: every
  // quote we ship (and the editor, and the catalogue) writes `text`, so the
  // OR-group refused two of our own templates while a block carrying only
  // `quote` — which renders blank — would have been waved through.
  quote:              { required: [['text', 'quote']] },
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
  // TwoColumnBlock has a text-text mode: `isTextTextLayout` is true as soon as
  // leftColumn OR rightColumn is present (or layout 'text-text' with
  // secondaryContent), and it renders `leftColumn ?? content` beside
  // `rightColumn ?? secondaryContent`. Naming only content/imageSrc here
  // refused that whole mode — five two-column blocks across three of our own
  // templates render correctly today and were reported as missing content.
  'two-column':       { required: [['content', 'imageSrc', 'leftColumn', 'rightColumn', 'secondaryContent']] },
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
    // 0. Unknown block TYPE — fail closed, identically to validateBlockData.
    //
    // This gate used to be reachable only through validateBlockData (the
    // manage_page_blocks / create_page_block path). The manage_page path runs
    // through here instead, and here an unrecognised type merely had no entry
    // in BLOCK_CONTRACTS — so it fell out of the loop and was WRITTEN. Live
    // 2026-08-22: a model sent "two_column" and "sticky_story" (snake_case for
    // the real "two-column" / "sticky-scroll"); the page saved "green" and
    // rendered two invisible holes. A hero without `title` was refused loudly
    // on the same call — so the platform disagreed with itself about what a
    // valid block is, depending on which skill was invoked.
    //
    // "Missing contract" ≠ "unknown type": a legitimate block with no
    // obligatory fields (section-divider, newsletter, terms…) rightly has no
    // BLOCK_CONTRACTS entry. The truth about what EXISTS is KNOWN_BLOCK_TYPES
    // (= every case in BlockRenderer), so that is what we check here; the
    // contract lookup below keeps its own, separate meaning.
    //
    // Deliberately NO snake_case→kebab rescue (two_column → two-column), even
    // though it is one line and would "work":
    //   1. validateBlockData already refuses "two_column" outright. Mapping on
    //      this path only would re-create the very disagreement between the two
    //      write paths that this change exists to remove — and the mapping
    //      cannot be shared cheaply, because preflightBlockArgs passes the
    //      caller's raw type string to validateBlockData separately from the
    //      block it normalises.
    //   2. suggestBlockTypes() already folds `_`→`-`, so "two_column" is
    //      answered with `Did you mean: "two-column"?` — the model self-corrects
    //      in one turn AND learns the real name. A silent rescue fixes this page
    //      and teaches nothing; the same wrong name comes back next time, and
    //      wherever no rescue exists (describe_blocks output, block-reference
    //      docs, the editor) the model still has the wrong model.
    //   3. Tolerating a second spelling makes it a second naming convention
    //      that has to be maintained for every block type, forever.
    // Field-level aliases (heading→title) are forgiven above and stay forgiven:
    // there the caller named a real block correctly and only missed a field
    // name — no ambiguity about WHAT was intended, and nothing invisible saved.
    const type = String(block.type ?? '').trim();
    if (!KNOWN_BLOCK_TYPES.includes(type)) {
      const suggestions = suggestBlockTypes(type);
      console.warn(`[validate] Block ${block.id}: unknown block type "${type}" — marking for removal`);
      block._remove = true;
      block._remove_reason = type
        ? `"${type}" is not a block type — nothing renders it, so this block would be invisible on the page.`
          + (suggestions.length ? ` Did you mean: ${suggestions.map((s) => `"${s}"`).join(', ')}?` : '')
          + ' Call describe_blocks (optionally with block_type) for the exact field contract of a real type.'
        : 'Block missing "type" — each block needs { type, data }. '
          + 'Call describe_blocks to list the valid block types and their fields.';
      continue;
    }

    const data = block.data as Record<string, unknown> | undefined;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      // Used to be a bare `block._remove = true` with NO reason — which is how
      // stripRemovedBlocks ended up emitting the contentless
      // `"undefined" block: invalid`. Name the missing piece and show the shape.
      console.warn(`[validate] Block ${block.id} (${type}): no data object — marking for removal`);
      block._remove = true;
      block._remove_reason =
        `"${type}" block: missing its "data" object — every block is { type, data }, with the block's own `
        + `fields inside data, e.g. { "type": "${type}", "data": { ... } }. `
        + `Call describe_blocks({ block_type: "${type}" }) for the exact field list.`;
      continue;
    }

    // 0c. Unknown top-level FIELDS — fail closed, identically to
    // validateBlockData (which is why the check itself is shared, not copied).
    //
    // Same shape of hole as the unknown-TYPE one above, one level down, and it
    // outlived that fix by exactly one day. Live 2026-08-22 on optic /agentic:
    // a hero written with `primary_cta`, `secondary_cta` and `subheadline`.
    // HeroBlock reads primaryButton / secondaryButton / subtitle, so all three
    // values were stored and rendered by nothing — the page looked thin, the
    // agent reported it complete, and a third of the block's content was gone
    // without a word. This path only ever checked that REQUIRED fields were
    // PRESENT; it never asked whether the fields that were sent exist.
    //
    // Fail closed and all-or-nothing, exactly like a missing required field:
    // the reason travels back through stripRemovedBlocks → agent-execute →
    // the model, naming the field and (where a real one is close) the right
    // name, so the next turn corrects itself.
    //
    // Why refusing is right HERE even though the merge path (validateBlockData
    // with unknownFieldScope) deliberately fails open: on manage_page the whole
    // blocks array IS the caller's payload. Every field named in the refusal is
    // one they can see and remove before resending. In the merge case the agent
    // sends a handful of fields and the executor judges stored data the agent
    // never saw — refusing there would make a legacy page permanently
    // un-editable, which is a wall, not a gate.
    const fieldErrors = unknownFieldErrors(type, data);
    if (fieldErrors.length > 0) {
      console.warn(`[validate] Block ${block.id} (${type}): ${fieldErrors[0]}`);
      block._remove = true;
      const example = BLOCK_HINTS[type];
      block._remove_reason = fieldErrors[0]
        + (example ? `. Correct "${type}" structure: ${JSON.stringify(example)}` : '');
      continue;
    }

    const contract = BLOCK_CONTRACTS[type];
    // Known, renderable type with no required/forbidden fields (section-divider,
    // newsletter, terms…). Nothing to check — but it is NOT unknown.
    if (!contract) continue;

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
        // Self-correcting reason (the Tiptap-error pattern): name the block and
        // the field it needs. The old `items` hint for stats lived here; it is
        // gone because normalizeBlockData now folds stats.items → stats (the
        // renderer's own fallback), so the wrong name never reaches this line.
        block._remove_reason = `"${block.type}" block: missing required field [${group.join(' or ')}]`;
        break;
      }
    }
  }
}

/** Remove all blocks marked with `_remove` in-place. Returns the reasons, so
 * callers can refuse-with-detail instead of silently shipping a thinner page. */
export function stripRemovedBlocks(blocks: Record<string, unknown>[]): string[] {
  const reasons = blocks.filter((b) => b._remove).map((b) => {
    if (b._remove_reason) return String(b._remove_reason);
    // Every rejection site above records a reason, so reaching this line means a
    // NEW one forgot to. The old fallback here interpolated a `type` that was
    // itself the missing thing and produced `"undefined" block: invalid` — seven
    // times, to an operator who could act on none of it. A fail-closed gate whose
    // refusal cannot be acted on is just a wall: even with nothing specific to
    // say, say what shape is expected and where the field list lives.
    const t = String(b.type ?? '').trim();
    return (t ? `"${t}" block` : 'Block')
      + ': rejected by the block validator without a recorded reason. '
      + 'Each block must be { type, data } with a renderable type — '
      + 'call describe_blocks for the valid types and their fields.';
  });
  if (reasons.length === 0) return [];
  const clean = blocks.filter((b) => !b._remove);
  blocks.length = 0;
  blocks.push(...clean);
  console.log(`[normalize] Removed ${reasons.length} invalid block(s)`);
  return reasons;
}

// ---------------------------------------------------------------------------
// Envelope aliases (block_type/block_data → type/data)
// ---------------------------------------------------------------------------

/**
 * Accept the SIBLING SKILL's envelope spelling on a block list, in place.
 *
 * The platform ships two page-write skills that name the same object twice:
 *   manage_page        blocks: [{ type, data }]
 *   create_page_block  block_type + block_data  (and blocks: [{ type, data }])
 * Live 2026-08-22, twice in a row from the same operator: a model took
 * manage_page's ARRAY shell and create_page_block's FIELD names —
 * `blocks: [{ block_type: "hero", block_data: { ... } }]`. Every block came back
 * typeless; seven blocks, nothing written, on both attempts.
 *
 * Why aliasing this is right while snake_case TYPE names (`two_column`) stay
 * refused a few lines up — the two look alike and are not the same thing:
 *   - `block_type` is OUR OWN vocabulary, published by our own sibling skill in
 *     the same domain, for the same object. The caller did not guess; they used
 *     a name this platform told them was correct, in the wrong place. That the
 *     two skills disagree is the platform's arbitrariness, not the caller's
 *     error — and there is nothing to teach by refusing, because the model
 *     already knows both names and cannot tell which surface wants which.
 *   - `two_column` is a spelling NOTHING in the platform ever published.
 *     Accepting it would mint a second name for every block type, forever, and
 *     would confirm a name that still fails in describe_blocks, in the editor
 *     and in block-reference. There the refusal-with-suggestion IS the fix.
 * The dividing line: forgive what we said ourselves, refuse what was invented.
 *
 * Deliberately conservative — only this exact pair, only where the canonical key
 * is absent, and halves are never blended: if a block carries both spellings,
 * `type`/`data` win and the collision is reported, because silently preferring
 * either could store a block the caller never described.
 */
export function normalizeBlockEnvelopes(blocks: unknown[]): void {
  const PAIRS = [['block_type', 'type'], ['block_data', 'data']] as const;
  for (const raw of blocks) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const block = raw as Record<string, unknown>;
    for (const [alias, canonical] of PAIRS) {
      if (!(alias in block)) continue;
      const current = block[canonical];
      const canonicalEmpty = current === undefined || current === null
        || (typeof current === 'string' && current.trim() === '');
      if (canonicalEmpty) {
        block[canonical] = block[alias];
      } else {
        console.warn(
          `[normalize] Block ${block.id ?? '(no id)'}: both "${canonical}" and "${alias}" were sent — `
          + `keeping "${canonical}", ignoring "${alias}". manage_page takes { type, data }; "${alias}" is `
          + `create_page_block's name for the same thing. Pick one form per call, never both.`,
        );
      }
      // Either way the alias must not survive into content_json: no renderer
      // reads it, and a stored half-shape re-teaches the mix on the next read.
      delete block[alias];
    }
  }
}

/**
 * A page is a FLAT ARRAY of blocks. The commonest wrong answer is a shape that
 * DESCRIBES a page instead — `{ hero: {...}, sections: [...] }` — observed live
 * 2026-08-22. It used to reach normalizeBlocks and throw `blocks is not
 * iterable`: a crash message, not an answer. A caller that gets a stack trace
 * cannot correct itself, so it goes looking for another skill (the exact move
 * that produced a worse page an hour earlier that evening).
 *
 * Returns null when the shape is acceptable (array, or absent). ONE message,
 * used by both the preflight and the executor — two copies is how the write
 * paths disagreed about types for months.
 */
export function blocksShapeError(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (Array.isArray(raw)) return null;
  const got = typeof raw === 'object'
    ? `an object with key(s): ${Object.keys(raw as object).slice(0, 8).join(', ')}`
    : `a ${typeof raw}`;
  return (
    `content_json must be a flat ARRAY of blocks — got ${got}. ` +
    `A page is not { hero, sections }: every section IS a block, in order. ` +
    `Shape: [{"type":"hero","data":{"title":"…"}},{"type":"features","data":{"features":[…]}}]. ` +
    `Call describe_blocks for the block types and their exact fields, then resend the whole array.`
  );
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Full normalization pipeline for a content_json blocks array.
 *
 * Steps:
 *   0. normalizeBlockEnvelopes — block_type/block_data → type/data
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

  // Envelope FIRST: every step below reads `type`/`data`, so a sibling-skill
  // spelling has to become the canonical one before anything looks at it —
  // otherwise normalizeBlockData sees type `undefined` and skips every
  // per-type alias, and the gate then judges an untouched shape.
  normalizeBlockEnvelopes(typed);

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
export const BLOCK_HINTS: Record<string, Record<string, unknown>> = {
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
export const TIPTAP_HINT = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Your text here"}]}]}';

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

/**
 * Wrong FIELD names whose right name shares too few letters for the similarity
 * pass below to find it. Suggestion text only — nothing is routed or rescued on
 * this map; every entry is filtered against the block's real field list before
 * it is ever shown, so a synonym can never name a field the type does not have.
 *
 * Keys are normalised (lowercase, separators stripped), so one entry covers
 * `primary_cta`, `primaryCta` and `primary-cta` alike.
 *
 * Every entry below is a name a real agent write used. This is NOT a second
 * field catalogue: the catalogue is blockFieldMap() (generated from
 * block-reference.ts) and stays the only authority on what exists.
 */
const FIELD_SYNONYMS: Record<string, string[]> = {
  // The live miss this gate was built for (optic /agentic, 2026-08-22): a hero
  // written with primary_cta / secondary_cta / subheadline. The two CTA names
  // are refused, not aliased — see the reasoning at the unknown-field gate.
  primarycta: ['primaryButton', 'buttonText'],
  secondarycta: ['secondaryButton', 'secondaryButtonText'],
  cta: ['primaryButton', 'buttonText'],
  ctatext: ['buttonText', 'primaryButton'],
  ctalabel: ['buttonText', 'primaryButton'],
  ctalink: ['buttonUrl', 'primaryButton'],
  ctaurl: ['buttonUrl', 'primaryButton'],
  callotoaction: ['primaryButton', 'buttonText'],
  // Text-shaped misses. `heading`/`headline`/`subheadline` are folded by
  // normalizeBlockData on the blocks that HAVE title/subtitle; these entries
  // catch the blocks that do not — quick-links calls its heading `heading`, and
  // the refusal has to point there rather than at a `title` it never had.
  heading: ['title', 'heading'],
  headline: ['title', 'heading'],
  subheadline: ['subtitle', 'description'],
  subheading: ['subtitle', 'description'],
  title: ['heading', 'text'],
  tagline: ['subtitle', 'eyebrow'],
  intro: ['subtitle', 'content'],
  lead: ['subtitle', 'content'],
  summary: ['subtitle', 'content'],
  description: ['subtitle', 'content'],
  body: ['content', 'subtitle'],
  text: ['content', 'title'],
  label: ['title', 'eyebrow'],
  caption: ['subtitle', 'imageAlt'],
  // Media-shaped misses.
  image: ['imageSrc', 'backgroundImage', 'src'],
  imageurl: ['imageSrc', 'backgroundImage', 'src'],
  photo: ['imageSrc', 'backgroundImage', 'src'],
  background: ['backgroundImage', 'backgroundType'],
  video: ['videoUrl'],
  link: ['buttonUrl', 'url'],
  href: ['buttonUrl', 'url'],
};


/**
 * Suggest the valid FIELD names closest to what the caller sent, for one block
 * type — the field-level twin of suggestBlockTypes(), and deliberately the same
 * crude similarity rather than a fuzzy-match library.
 *
 * It reads the SAME catalogue the gate refuses from (blockFieldMap), so a
 * suggestion can never drift from what is actually accepted.
 */
export function suggestBlockFields(blockType: string, invented: string): string[] {
  const valid = blockFieldMap().get(blockType);
  if (!valid || valid.size === 0) return [];
  // The similarity itself is generic and lives in suggest-names.ts, shared with
  // the skill-PARAMETER bounce in workspace-chat. An unknown block field and an
  // unknown skill parameter are the same defect twice; a second copy of the
  // matcher would be the drift class this codebase keeps paying for.
  return suggestClosestNames(invented, valid, { synonyms: FIELD_SYNONYMS, limit: 2 });
}

/**
 * The unknown-top-level-FIELD check, shared verbatim by BOTH write paths.
 *
 * Returns [] when every field is known (or when the type has no declared field
 * list — the data-driven blocks, which have no creation tool). One message per
 * block, naming every unknown field and, where one exists, the right name.
 *
 * Silence here is the defect it closes (verified live on optic /agentic,
 * 2026-08-22): a hero written with `primary_cta`, `secondary_cta` and
 * `subheadline`. All three saved, none renders — HeroBlock reads primaryButton
 * / secondaryButton / subtitle — so a third of the block's content sat in the
 * database while the page looked thin and the agent reported it complete.
 */
export function unknownFieldErrors(
  blockType: string,
  scope: Record<string, unknown>,
): string[] {
  const validFields = blockFieldMap().get(blockType);
  if (!validFields || validFields.size === 0) return [];
  const unknown = Object.keys(scope).filter((k) => !k.startsWith('_') && !validFields.has(k));
  if (unknown.length === 0) return [];
  const named = unknown.map((f) => {
    const suggestions = suggestBlockFields(blockType, f);
    return suggestions.length
      ? `${f} (did you mean ${suggestions.map((s) => `"${s}"`).join(' or ')}?)`
      : f;
  });
  return [
    `"${blockType}" block has unknown field(s): ${named.join(', ')} — nothing reads them, so they would be stored and never rendered. `
    + `Valid fields for "${blockType}": ${[...validFields].join(', ')}`,
  ];
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
  // The check itself lives in unknownFieldErrors() because validateBlockContracts
  // (the manage_page path) must refuse the identical set with the identical
  // wording — two copies is how the two paths disagreed about TYPES for months.
  errors.push(...unknownFieldErrors(blockType, options.unknownFieldScope ?? blockData));

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

// ---------------------------------------------------------------------------
// Pre-stage preflight (approval-gate parity)
// ---------------------------------------------------------------------------

export interface BlockPreflightResult {
  /** True when the arguments actually carried blocks this function could judge. */
  checked: boolean;
  /** Per-block reasons. Empty ⇒ the same call would pass agent-execute's gate. */
  errors: string[];
}

/**
 * Judge a page-write skill's NESTED block payload **without touching the DB** —
 * the same contracts, in the same order, that agent-execute applies at write
 * time.
 *
 * Why this exists (FlowWork, verified 2026-08-22): a chat surface with a human
 * approval gate stages a write first and executes it only after a person has
 * clicked approve. The block contracts were enforced at execution — i.e. AFTER
 * the model had left the loop. So a manage_page call carrying a hero block with
 * no `title` produced a pretty approval card, a human click, and only then the
 * refusal "Fix the named fields and retry — nothing was written". The message is
 * WRITTEN to be self-correcting, and in FlowPilot's ReAct loop it is: the tool
 * result comes back and the model fixes the field next turn. The approval gate
 * broke that feedback loop and handed the error to the wrong actor.
 *
 * Callers that stage before executing must run this BEFORE staging and return
 * its errors to the model as a tool result. The contracts live here and only
 * here — a second copy of them next to the approval gate is precisely the drift
 * class (two copies, one edited) this file already fights.
 *
 * Mirrors, argument-shape for argument-shape:
 *   - manage_page create/update  → normalizeBlocks(blocks ?? content_json)
 *   - manage_page_blocks add     → normalizeBlockData → validateBlockData
 *   - create_page_block          → same, single and batch
 * `manage_page_blocks action=update` is deliberately NOT judged: the executor
 * validates the MERGE of incoming fields into the stored block, which needs the
 * row. Guessing without it would bounce writes that would have succeeded, so
 * that path stays the executor's job (fail open, not fail closed).
 */
export function preflightBlockArgs(
  skillName: string,
  args: Record<string, unknown>,
): BlockPreflightResult {
  const NONE: BlockPreflightResult = { checked: false, errors: [] };
  if (!args || typeof args !== 'object') return NONE;

  // The caller's arguments must survive this untouched: they are what a human
  // sees on the approval card and what agent-execute receives. Normalization
  // mutates in place, so judge a copy.
  const copy = <T>(v: T): T => (v === undefined || v === null ? v : JSON.parse(JSON.stringify(v)) as T);

  /** One candidate block, judged exactly as agent-execute's add path does. */
  const judgeOne = (type: unknown, data: unknown): string[] => {
    const blockType = String(type ?? '').trim();
    if (!blockType) return ['Block missing "type" — each block needs { type, data }.'];
    // Normalize FIRST, then validate — the order is load-bearing (see the
    // comment on the add path in agent-execute): the alias/raw-string
    // forgiveness must get its pass before the gate judges the shape.
    const candidate: Record<string, unknown> = {
      id: 'preflight',
      type: blockType,
      data: (copy(data) as Record<string, unknown>) ?? {},
      spacing: {},
      animation: { type: 'fade-up' },
    };
    normalizeBlockData(candidate);
    const result = validateBlockData(blockType, candidate.data as Record<string, unknown>);
    if (result.valid) return [];
    return [`"${blockType}" block: ${result.errors.join('; ')}${result.hint ? ` — ${result.hint}` : ''}`];
  };

  if (skillName === 'manage_page') {
    const action = String(args.action ?? '').trim();
    if (action !== 'create' && action !== 'update') return NONE;
    // content_json is an alias for blocks — `get` returns the column under that
    // name, so that is the name a caller naturally sends back.
    const raw = args.blocks !== undefined ? args.blocks : (args as Record<string, unknown>).content_json;
    // A non-array is not "nothing to judge" — it IS the error, and returning
    // NONE here let a doomed write stage and a human approve it before the
    // executor crashed on it (observed 2026-08-22).
    const shapeErr = blocksShapeError(raw);
    if (shapeErr) return { checked: true, errors: [shapeErr] };
    if (!Array.isArray(raw)) return NONE;
    return { checked: true, errors: normalizeBlocks(copy(raw) as unknown[]) };
  }

  if (skillName === 'create_page_block') {
    const batch = args.blocks;
    if (Array.isArray(batch) && batch.length > 0) {
      // Same envelope tolerance as manage_page — otherwise the fix for the
      // mixed form would create a NEW disagreement (accepted over there,
      // refused over here) of exactly the kind it exists to remove.
      const items = copy(batch) as Array<Record<string, unknown>>;
      normalizeBlockEnvelopes(items);
      const errors: string[] = [];
      for (const b of items) {
        errors.push(...judgeOne(b?.type, b?.data));
      }
      // NB stricter than the executor, on purpose: its batch path skips the bad
      // blocks and writes the rest. A half-applied batch is not something a
      // human should be asked to approve — bounce the call, let the model fix
      // the named fields, stage a whole page section or none of it.
      return { checked: true, errors };
    }
    const blockType = args.block_type;
    if (typeof blockType !== 'string' || !blockType.trim()) return NONE;
    return { checked: true, errors: judgeOne(blockType, args.block_data ?? {}) };
  }

  if (skillName === 'manage_page_blocks') {
    if (String(args.action ?? '').trim() !== 'add') return NONE;
    const blockType = args.block_type;
    // A missing block_type is the required-parameter gate's finding, not ours.
    if (typeof blockType !== 'string' || !blockType.trim()) return NONE;
    return { checked: true, errors: judgeOne(blockType, args.block_data ?? {}) };
  }

  return NONE;
}
