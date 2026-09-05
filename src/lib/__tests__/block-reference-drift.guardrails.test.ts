import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { BLOCK_REFERENCE } from '../block-reference';

/**
 * The block registry is what agents read. The renderer is what users see.
 * When they drift, an agent composes with the documented subset and the pages
 * come out as the poor cousin of what the block can do — two-column carried 23
 * fields (eyebrow, script-font accent, image aspect/fit, sticky column…) while
 * the registry documented 4, so gateway-composed pages used 4.
 *
 * This compares, per block, the fields the public renderer actually reads
 * (`data.X`) against the fields the registry documents. Blocks in PENDING are
 * known-stale and tolerated; the list only shrinks. Fix a block's registry
 * entry, remove it from PENDING, and drift can never silently return for it.
 * (Same shrinking-pending-list pattern as the currency and date sweeps.)
 */

const rendererDir = resolve(__dirname, '../../components/public/blocks');

/** kebab-case type → PascalCaseBlock.tsx, the repo's naming convention. */
function rendererPath(type: string): string | null {
  const pascal = type.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join('');
  const p = resolve(rendererDir, `${pascal}Block.tsx`);
  if (existsSync(p)) return p;
  // Acronym-cased filenames (CTABlock, YouTubeBlock, FloatingCTABlock) do not
  // round-trip through kebab→Pascal, so an exact-name check silently skipped
  // them — and youtube's entry documented a videoId the renderer never reads
  // while missing the url it does. Match case-insensitively so those blocks are
  // audited too.
  const wanted = `${pascal}Block.tsx`.toLowerCase();
  const hit = readdirSync(rendererDir).find((f) => f.toLowerCase() === wanted);
  return hit ? resolve(rendererDir, hit) : null;
}

/**
 * A renderer reads its block in two shapes, and this test only ever saw one:
 *
 *     data.title                                    ← member access
 *     const { title, subtitle = 'x' } = data;       ← destructuring
 *
 * Roughly half the renderers destructure, so half the registry was never
 * actually audited — the guard was green while ~33 fields went undocumented,
 * among them BadgeBlock's `showTitles` (the registry said `showTitle`). That is
 * the same class that let content be written to fields nothing renders.
 *
 * It matters more now that `inspect_rendered_page` exists: that sensor tells an
 * agent which stored fields "no renderer reads", judged against this catalogue.
 * A field that IS read but is missing from the catalogue therefore comes back as
 * a false positive, and the sensor advises deleting correct, rendered content. A
 * sensor that lies is worse than no sensor, so the catalogue has to be true —
 * which means this extractor has to see everything the renderer sees.
 *
 * A naive /\{([^}]*)\} = data/ breaks on defaults that are themselves objects or
 * arrays (`labels = {}`, `suggestedPrompts = ['…', '…']`), so the pattern body is
 * walked brace-balanced instead — over a source with comments, strings, template
 * text and regex literals blanked out, so no brace inside a literal can throw
 * the count off.
 */

/**
 * Blank comments, string bodies, template text and regex literals, preserving
 * every offset (blanked characters become spaces, newlines survive). Both passes
 * below then run over code only: a `data.foo` mentioned in a comment is not a
 * read, and a `{` inside a string is not a brace.
 */
function maskNonCode(src: string): string {
  const out = src.split('');
  const n = src.length;
  const blank = (a: number, b: number) => {
    for (let k = Math.max(a, 0); k < b && k < n; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  // `/` opens a regex literal only where a value may begin; after an identifier,
  // `)` or `]` it is division. These files contain no division today, but the
  // heuristic keeps a future one from swallowing the rest of the file.
  const regexCanStart = (prev: string) => prev === '' || !/[\w$)\]]/.test(prev);
  let prev = '';

  /** Scan code from `i`. With `untilBrace`, return at the matching `}`. */
  function scanCode(i: number, untilBrace: boolean): number {
    while (i < n) {
      const c = src[i];
      if (c === '/' && src[i + 1] === '/') {
        let e = src.indexOf('\n', i);
        if (e === -1) e = n;
        blank(i, e);
        i = e;
        continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        const e = src.indexOf('*/', i + 2);
        const end = e === -1 ? n : e + 2;
        blank(i, end);
        i = end;
        continue;
      }
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < n && src[j] !== c && src[j] !== '\n') {
          if (src[j] === '\\') j++;
          j++;
        }
        blank(i + 1, j);
        i = Math.min(j + 1, n);
        prev = c;
        continue;
      }
      if (c === '`') {
        i = scanTemplate(i);
        prev = '`';
        continue;
      }
      if (c === '/' && regexCanStart(prev)) {
        let j = i + 1;
        let inClass = false;
        while (j < n) {
          const d = src[j];
          if (d === '\\') { j += 2; continue; }
          if (d === '\n') break; // unterminated — it was not a regex after all
          if (d === '[') inClass = true;
          else if (d === ']') inClass = false;
          else if (d === '/' && !inClass) break;
          j++;
        }
        if (j < n && src[j] === '/') {
          blank(i + 1, j);
          i = j + 1;
          prev = '/';
          continue;
        }
      }
      if (untilBrace && c === '}') return i; // caller consumes it
      if (c === '{') {
        i = scanCode(i + 1, true);
        if (i < n) i++;
        prev = '}';
        continue;
      }
      if (!/\s/.test(c)) prev = c;
      i++;
    }
    return i;
  }

  /** Template literal: blank the literal text, keep `${ … }` as live code. */
  function scanTemplate(start: number): number {
    let i = start + 1;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { blank(i, i + 2); i += 2; continue; }
      if (c === '`') return i + 1;
      if (c === '$' && src[i + 1] === '{') {
        i = scanCode(i + 2, true);
        if (i < n) i++;
        continue;
      }
      blank(i, i + 1);
      i++;
    }
    return i;
  }

  scanCode(0, false);
  return out.join('');
}

/** Walk back from a `}` to its matching `{`. Safe on masked source only. */
function openingBrace(src: string, close: number): number {
  let depth = 0;
  for (let i = close; i >= 0; i--) {
    if (src[i] === '}') depth++;
    else if (src[i] === '{') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Top-level binding names of one object pattern body. Handles renaming
 * (`{ a: b }` → a), defaults (`{ a = 1 }` → a), nested patterns (`{ a: { b } }`
 * → a, since only `data.a` is the read), quoted keys and rest elements.
 */
function patternKeys(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));

  const keys: string[] = [];
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    if (part.startsWith('...')) continue; // rest: names no field
    if (part.startsWith('[')) continue; // computed key: not statically known
    const key = part.split(/[:=]/)[0].trim().replace(/^['"]|['"]$/g, '');
    if (/^[A-Za-z_$][\w$-]*$/.test(key)) keys.push(key);
  }
  return keys;
}

/**
 * Names a renderer reads that the registry must NOT document, because
 * normalize-blocks folds them to the primary name before anything else sees
 * them. StatsBlock reads `data.stats || (data as any).items`; the fold turns a
 * written `items` into `stats`, and normalize-blocks states the ruling
 * explicitly: "Fold to the primary name (one name wins, per Law 2) rather than
 * documenting a second one in the catalogue." Documenting them here would
 * re-teach the name the platform is trying to retire. Keyed by block type so a
 * fold added for one block cannot excuse the same name on another.
 */
const FOLDED_ALIASES: Record<string, string[]> = {
  stats: ['items'],
  timeline: ['items', 'layout'],
};

/**
 * Fields the renderer reads off its `data` prop — its true consumption surface.
 * Three shapes, all of them present in this repo:
 *   data.x                          member access (also covers props.data.x)
 *   (data as any).x                 cast-then-read, used for legacy aliases
 *   const { x, y = 1 } = data       destructuring
 */
function rendererFields(path: string): Set<string> {
  const src = maskNonCode(readFileSync(path, 'utf-8'));
  const fields = new Set<string>();

  for (const m of src.matchAll(/\bdata\.([A-Za-z_$][\w$]*)/g)) fields.add(m[1]);
  for (const m of src.matchAll(/\(\s*data\s+as\s+[^)]+\)\s*\.([A-Za-z_$][\w$]*)/g)) fields.add(m[1]);

  // `= data` — but not `= data.x`, `= data?.x`, `= data[0]`, and not a pattern
  // destructured from something else that merely happens to bind a `data` key
  // (`const { data, error } = await q`).
  for (const m of src.matchAll(/=\s*data(?![\w$.?[])/g)) {
    const before = src.slice(0, m.index).replace(/\s+$/, '');
    if (!before.endsWith('}')) continue;
    const open = openingBrace(src, before.length - 1);
    if (open === -1) continue;
    for (const key of patternKeys(src.slice(open + 1, before.length - 1))) fields.add(key);
  }

  return fields;
}

/**
 * Shapes the extractor deliberately does NOT model. If one appears, the guard
 * would go quietly blind again for that renderer — exactly how it stayed green
 * through 33 undocumented fields — so it fails loudly and names the file
 * instead. Extend `rendererFields` above, do not widen this allowance.
 */
const UNMODELLED_SHAPES: Array<{ label: string; re: RegExp }> = [
  { label: 'dynamic key access — data[expr]', re: /\bdata\s*\[/ },
  // Binding positions only: a `(` or a declaration keyword must open the
  // pattern. `interface Props { data: { title?: string } }` is a type, not a
  // read, and every renderer in the repo declares one.
  {
    label: 'parameter destructuring — ({ data: { … } })',
    re: /\(\s*\{[^(){}]*\bdata\s*:\s*\{/,
  },
  {
    label: 'nested destructuring — const { data: { … } } = props',
    re: /\b(?:const|let|var)\s*\{[^{}]*\bdata\s*:\s*\{/,
  },
];

/**
 * Not yet audited — documented subset is known to be smaller than the renderer.
 * SHRINK ONLY. Adding a block here is admitting new drift; do that in a commit
 * that says why, or better, fix the registry entry instead.
 */
const PENDING = new Set<string>([]);

/**
 * Renderers that hand their whole `data` object to ANOTHER block's renderer.
 * BookingBlock's smart mode returns <SmartBookingBlock data={data} …/>, so a
 * field documented on `booking` may have its only read site in
 * SmartBookingBlock.tsx. The ghost-field audit below unions the delegate's
 * reads in; a hygiene test pins that the delegation still exists in source, so
 * a removed delegation cannot leave a silent excuse behind.
 */
const DATA_DELEGATIONS: Record<string, string[]> = {
  booking: ['smart-booking'],
};

/** The block's own reads plus those of every renderer it hands `data` to. */
function consumedFor(type: string): Set<string> {
  const fields = rendererFields(rendererPath(type)!);
  for (const delegate of DATA_DELEGATIONS[type] ?? []) {
    const p = rendererPath(delegate);
    if (p) for (const f of rendererFields(p)) fields.add(f);
  }
  return fields;
}

/**
 * GHOST FIELDS — the reverse direction of the drift test above, and the other
 * half of the same lie. The drift test catches fields the renderer reads that
 * the registry hides (agents compose with the poorer subset). This catches
 * fields the registry ADVERTISES that no renderer reads: the write gate
 * (unknownFieldErrors in normalize-blocks) builds its allowlist from this
 * catalogue, so an advertised-but-unread field is validated, stored, and then
 * silently does nothing.
 *
 * Two of those were confirmed on one day (Restagård, 2026-08-27): hero's
 * `imageSrc` was whitelisted but never read — every hero written with it fell
 * back to the gradient background (fixed with a renderer alias, PR #311) — and
 * contact's `showForm` promised a contact form the renderer has never
 * contained. The gate said "valid", the page said nothing.
 *
 * Every documented field must therefore have a read site in the public
 * renderer. Deliberate exceptions go in GHOST_ALLOWLIST with a reason; an
 * excuse that stops being true (the field gains a read, or leaves the
 * registry) is itself failed by the hygiene tests below.
 */
const GHOST_ALLOWLIST: Record<string, Record<string, string>> = {};

/** Documented top-level fields with no read site — the audit's core judgment. */
function ghostFieldsFor(
  block: (typeof BLOCK_REFERENCE)[number],
  consumed: Set<string>,
  excused: Set<string>,
): string[] {
  return block.fields
    .map((f) => f.name)
    .filter((name) => !consumed.has(name) && !excused.has(name))
    .sort();
}

describe('registry advertises nothing the renderer cannot read (ghost fields)', () => {
  const audited = BLOCK_REFERENCE.filter(
    (b) => !PENDING.has(b.type) && rendererPath(b.type),
  );

  for (const block of audited) {
    it(`${block.type}: every documented field has a read site`, () => {
      const excused = new Set(Object.keys(GHOST_ALLOWLIST[block.type] ?? {}));
      const ghosts = ghostFieldsFor(block, consumedFor(block.type), excused);
      expect(
        ghosts,
        `${block.type} documents fields its renderer never reads — the write gate ` +
          `accepts them, they are stored, and the effect silently never happens ` +
          `(the imageSrc/showForm class). Implement the field, alias it in the ` +
          `renderer, or remove it from block-reference (and give normalize-blocks ` +
          `a FIELD_SYNONYMS hint so writers are redirected):\n  ${ghosts.join(', ')}`,
      ).toEqual([]);
    });
  }

  it('data delegations pinned in DATA_DELEGATIONS still exist in source', () => {
    for (const [type, delegates] of Object.entries(DATA_DELEGATIONS)) {
      const src = maskNonCode(readFileSync(rendererPath(type)!, 'utf-8'));
      for (const delegate of delegates) {
        const component = delegate
          .split('-')
          .map((s) => s[0].toUpperCase() + s.slice(1))
          .join('');
        expect(
          new RegExp(`<${component}Block[^>]*\\bdata=\\{data\\}`).test(src),
          `${type}'s renderer no longer hands data={data} to ${component}Block — ` +
            `remove the delegation or the audit counts reads that no longer happen`,
        ).toBe(true);
      }
    }
  });

  it('every allowlisted excuse is still true', () => {
    for (const [type, fields] of Object.entries(GHOST_ALLOWLIST)) {
      const entry = BLOCK_REFERENCE.find((b) => b.type === type);
      expect(entry, `GHOST_ALLOWLIST names unknown block type "${type}"`).toBeTruthy();
      const documented = new Set(entry!.fields.map((f) => f.name));
      const consumed = consumedFor(type);
      for (const [field, reason] of Object.entries(fields)) {
        expect(
          documented.has(field),
          `GHOST_ALLOWLIST excuses ${type}.${field}, but the registry no longer ` +
            `documents it — delete the stale excuse`,
        ).toBe(true);
        expect(
          consumed.has(field),
          `GHOST_ALLOWLIST excuses ${type}.${field}, but the renderer now reads ` +
            `it — the excuse is stale, delete it so the field stays audited`,
        ).toBe(false);
        expect(
          reason.trim().length,
          `GHOST_ALLOWLIST entry ${type}.${field} needs a real reason, not a stub`,
        ).toBeGreaterThanOrEqual(20);
      }
    }
  });

  /**
   * Negative test of the gate itself: plant a ghost field on a real block and
   * assert the audit fells it. If an extractor change ever makes the consumed
   * set over-approximate (seeing reads that are not there), this is the test
   * that goes red first — a gate that cannot fall protects nothing.
   */
  it('fells a planted ghost field', () => {
    const hero = BLOCK_REFERENCE.find((b) => b.type === 'hero')!;
    const planted = {
      ...hero,
      fields: [
        ...hero.fields,
        {
          name: 'plantedGhostField',
          type: 'string' as const,
          required: false,
          description: 'deliberately unread — must be flagged',
        },
      ],
    };
    const ghosts = ghostFieldsFor(planted, consumedFor('hero'), new Set());
    expect(ghosts).toContain('plantedGhostField');
  });
});

describe('block registry documents what the renderer can do', () => {
  const audited = BLOCK_REFERENCE.filter(
    (b) => !PENDING.has(b.type) && rendererPath(b.type),
  );

  it('audits at least the blocks fixed so far', () => {
    expect(audited.map((b) => b.type)).toContain('two-column');
  });

  for (const block of audited) {
    it(`${block.type}: no renderer field is missing from the registry`, () => {
      const path = rendererPath(block.type)!;
      const consumed = rendererFields(path);
      const documented = new Set(block.fields.map((f) => f.name));
      const folded = new Set(FOLDED_ALIASES[block.type] ?? []);
      const undocumented = [...consumed]
        .filter((f) => !documented.has(f) && !folded.has(f))
        .sort();
      expect(
        undocumented,
        `${block.type}'s renderer reads fields the registry does not document — ` +
          `agents composing from the registry cannot use them:\n  ${undocumented.join(', ')}`,
      ).toEqual([]);
    });
  }

  it('PENDING only shrinks: no audited block is re-added', () => {
    // A block cannot be both audited-clean and pending; if a future edit re-adds
    // a fixed block to PENDING, this fails and the regression is loud.
    for (const b of audited) expect(PENDING.has(b.type)).toBe(false);
  });

  /**
   * The extractor's own blind-spot check. Silence is the failure mode here: a
   * renderer whose reads it cannot see is audited against an empty set and
   * passes, which is precisely how destructured fields stayed invisible.
   */
  it('sees a read in every renderer it audits', () => {
    const blind = audited
      .filter((b) => rendererFields(rendererPath(b.type)!).size === 0)
      .map((b) => b.type);
    expect(
      blind,
      'the extractor found no field reads in these renderers — either they truly ' +
        'read nothing, or they use a shape rendererFields() cannot see:\n  ' +
        blind.join(', '),
    ).toEqual([]);
  });

  it('no renderer uses a data shape the extractor cannot model', () => {
    const offenders: string[] = [];
    for (const file of readdirSync(rendererDir).filter((f) => f.endsWith('.tsx'))) {
      const src = maskNonCode(readFileSync(resolve(rendererDir, file), 'utf-8'));
      for (const shape of UNMODELLED_SHAPES) {
        if (shape.re.test(src)) offenders.push(`${file}: ${shape.label}`);
      }
    }
    expect(
      offenders,
      'these renderers read `data` in a shape this test does not extract, so their ' +
        'fields would go unaudited — teach rendererFields() the shape:\n  ' +
        offenders.join('\n  '),
    ).toEqual([]);
  });
});

/**
 * FOLDED_ALIASES is an exemption, and an exemption that stops being true is a
 * new blind spot wearing the old one's clothes. Pin both halves of its claim:
 * normalize-blocks really does fold the name, and the registry really does not
 * document it. If the fold is ever removed, this fails and the alias has to be
 * documented or the read removed — it cannot quietly stay invisible.
 */
describe('folded aliases stay folded, and stay out of the catalogue', () => {
  const normalizeSrc = readFileSync(
    resolve(__dirname, '../../../supabase/functions/_shared/normalize-blocks.ts'),
    'utf-8',
  );

  for (const [type, aliases] of Object.entries(FOLDED_ALIASES)) {
    for (const alias of aliases) {
      it(`${type}.${alias} is folded by normalize-blocks, not documented`, () => {
        expect(
          normalizeSrc,
          `${type}.${alias} is excused here because normalize-blocks folds it — ` +
            'no fold pair for it is left in that file',
        ).toContain(`['${alias}', '`);
        const entry = BLOCK_REFERENCE.find((b) => b.type === type);
        expect(entry, `${type} has no registry entry`).toBeTruthy();
        expect(
          entry!.fields.map((f) => f.name),
          `${type}.${alias} is a legacy alias the platform folds away — documenting ` +
            'it re-teaches the name normalize-blocks exists to retire',
        ).not.toContain(alias);
      });
    }
  }
});

/**
 * `describe_blocks` resolves a type with `entries.find(…)` — first match wins —
 * so a second entry for the same type is documentation that nothing will ever
 * serve. It is not hypothetical: kb-hub and kb-search each carried two entries
 * with DIFFERENT field lists, and the half an agent could see was the poorer
 * one (kb-hub's second entry held the only mention of kbPageSlug; kb-search's
 * first held the only mention of subtitle). Both fields are read by the
 * renderer, so the loser's fields were unreachable and, to the sensor, unread.
 */
/**
 * A third copy of the vocabulary. template-validator.ts keeps its own list of
 * legal block types, and a block registered only in block-reference.ts fails
 * template validation with "Invalid block type" — which reads as a broken
 * template rather than a stale list. Six types had drifted out of it
 * (ai-faq, latest-posts, pricing-calculator, sticky-scroll, handbook, terms).
 */
describe('template-validator knows every registered block type', () => {
  it('VALID_BLOCK_TYPES covers BLOCK_REFERENCE', () => {
    const src = readFileSync(resolve(__dirname, '../template-validator.ts'), 'utf-8');
    const list = /const VALID_BLOCK_TYPES: ContentBlockType\[\] = \[([\s\S]*?)\];/.exec(src);
    expect(list, 'VALID_BLOCK_TYPES was renamed or reshaped').toBeTruthy();
    const valid = new Set([...list![1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]));
    const missing = BLOCK_REFERENCE.map((b) => b.type).filter((t) => !valid.has(t)).sort();
    expect(
      missing,
      'these block types are in the registry but not in template-validator, so any ' +
        'template using them fails validation as an unknown type:\n  ' + missing.join(', '),
    ).toEqual([]);
  });
});

describe('BLOCK_REFERENCE keys are unique', () => {
  it('no block type is declared twice', () => {
    const seen = new Map<string, number>();
    for (const b of BLOCK_REFERENCE) seen.set(b.type, (seen.get(b.type) ?? 0) + 1);
    const dupes = [...seen].filter(([, n]) => n > 1).map(([t, n]) => `${t} ×${n}`);
    expect(
      dupes,
      'a duplicate entry is dead documentation — describe_blocks serves the first ' +
        'and the rest are invisible. Merge them into one entry (the union of the ' +
        'fields the renderer actually reads):\n  ' + dupes.join(', '),
    ).toEqual([]);
  });
});

/**
 * A field can be documented, read by the renderer, and still never reach the
 * page: two-column renders `note` in its text-text branch but the image+text
 * branch dropped it, so every optic services block set a note that silently
 * vanished. The drift test above cannot see this — `data.note` does appear in
 * the file, just in the wrong half.
 *
 * Layout branches are two presentations of one block; fields that are not about
 * layout (a note, a CTA) must survive both. This asserts that directly.
 */
describe('two-column layout branches agree on layout-independent fields', () => {
  const src = readFileSync(rendererPath('two-column')!, 'utf-8');
  // The text-text branch returns early; everything after is image+text.
  const split = src.indexOf('// Image+Text layout');
  const textText = src.slice(0, split);
  const imageText = src.slice(split);

  it('splits into two real branches', () => {
    expect(split).toBeGreaterThan(0);
    expect(imageText.length).toBeGreaterThan(500);
  });

  // A field may be read straight off `data` or via a derived local (the CTA is
  // normalized once because templates author it as either ctaText/ctaUrl or a
  // primaryButton object). Accept both spellings — what matters is that each
  // branch actually renders the value.
  const tokensFor = (field: string) => [`data.${field}`, field];

  for (const field of ['note', 'ctaText', 'ctaUrl', 'eyebrow']) {
    it(`renders ${field} in both layouts`, () => {
      const tokens = tokensFor(field);
      expect(tokens.some((t) => textText.includes(t)), `text-text branch drops ${field}`).toBe(true);
      expect(tokens.some((t) => imageText.includes(t)), `image+text branch drops ${field}`).toBe(true);
    });
  }
});
