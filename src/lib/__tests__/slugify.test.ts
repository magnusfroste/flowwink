/**
 * The single slug generator.
 *
 * The bug this replaces: `title.toLowerCase().replace(/[^a-z0-9]+/g, '-')` with
 * no transliteration first, which deletes every non-ASCII letter. On a
 * Swedish-first product that mangles a large share of all titles.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { slugify, fieldKey } from '../slugify';

describe('slugify — Nordic characters survive', () => {
  it.each([
    ['Varför öppna vikters', 'varfor-oppna-vikters'],
    ['Så förändrar AI-agenter framtiden', 'sa-forandrar-ai-agenter-framtiden'],
    ['Öppna Vikters Modeller', 'oppna-vikters-modeller'],
    ['Blåbærsyltetøy', 'blabaersyltetoy'],
    ['Ångström & Ö', 'angstrom-o'],
    ['Grüße aus München', 'grusse-aus-munchen'],
    ['Þórshöfn', 'thorshofn'],
    ['Łódź', 'lodz'],
    ['Café Crème', 'cafe-creme'],
  ])('%s -> %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('is what the old implementation got wrong', () => {
    const old = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    expect(old('Varför öppna vikters')).toBe('varf-r-ppna-vikters'); // the live bug
    expect(slugify('Varför öppna vikters')).toBe('varfor-oppna-vikters');
  });
});

describe('slugify — basic shaping', () => {
  it.each([
    ['Hello World', 'hello-world'],
    ['  leading and trailing  ', 'leading-and-trailing'],
    ['multiple   spaces', 'multiple-spaces'],
    ['Punctuation!!! Everywhere???', 'punctuation-everywhere'],
    ['already-slugged', 'already-slugged'],
    ['--edges--', 'edges'],
    ['CAPS LOCK', 'caps-lock'],
    ['numbers 123 kept', 'numbers-123-kept'],
  ])('%s -> %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('never emits doubled or edge separators', () => {
    for (const input of ['a -- b', '!!!a!!!b!!!', '   ', '- - -', 'a/b\\c']) {
      const out = slugify(input, { fallback: 'x' });
      expect(out).not.toMatch(/--/);
      expect(out).not.toMatch(/^-|-$/);
    }
  });
});

describe('slugify — degenerate input', () => {
  it('returns the fallback rather than an empty slug', () => {
    expect(slugify('🎉🎉🎉', { fallback: 'post' })).toBe('post');
    expect(slugify('', { fallback: 'post' })).toBe('post');
    expect(slugify('!!!', { fallback: 'post' })).toBe('post');
  });

  it('returns empty string when no fallback is given, never undefined', () => {
    expect(slugify('🎉')).toBe('');
    expect(slugify(null as unknown as string)).toBe('');
    expect(slugify(undefined as unknown as string)).toBe('');
  });

  it('collapses scripts it cannot transliterate instead of throwing', () => {
    expect(() => slugify('日本語のタイトル')).not.toThrow();
    expect(slugify('日本語のタイトル', { fallback: 'post' })).toBe('post');
  });
});

describe('slugify — maxLength', () => {
  it('truncates and does not leave a trailing separator', () => {
    // 'a-very-long-title-that' is 22 chars; cutting at 20 lands mid-word.
    const out = slugify('a very long title that keeps going', { maxLength: 20 });
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out).not.toMatch(/-$/);
  });

  it('leaves short slugs untouched', () => {
    expect(slugify('short', { maxLength: 60 })).toBe('short');
  });

  it('falls back when truncation would leave nothing', () => {
    expect(slugify('!!!!!!!!!!', { maxLength: 5, fallback: 'item' })).toBe('item');
  });
});

describe('fieldKey — identifier form', () => {
  it('uses underscores and still transliterates', () => {
    expect(fieldKey('Antal Öppna Ärenden')).toBe('antal_oppna_arenden');
    expect(fieldKey('  spaced  out  ')).toBe('spaced_out');
    expect(fieldKey('a--b')).toBe('a_b');
  });

  it('honours maxLength and fallback like slugify', () => {
    expect(fieldKey('x'.repeat(50), { maxLength: 40 })).toHaveLength(40);
    expect(fieldKey('🎉', { fallback: 'field' })).toBe('field');
  });
});

describe('slugify is stable', () => {
  it('is idempotent — slugging a slug changes nothing', () => {
    for (const input of ['Varför öppna vikters', 'Café Crème', 'Hello World', 'Þórshöfn']) {
      const once = slugify(input);
      expect(slugify(once)).toBe(once);
    }
  });
});

// ─── Guardrail ──────────────────────────────────────────────────────────────
// Five hand-rolled copies existed before this module, three of them dropping
// Swedish characters. Assert no new one appears: the giveaway is an ASCII-only
// character class applied to a lowercased string with no transliteration first.
describe('no hand-rolled slug generators in src/', () => {
  const ASCII_STRIP = /replace\(\s*\/\[\^a-z0-9[^\]]*\]\+?\/g/;

  const GRANDFATHERED = new Set([
    // slugify itself, and the test that proves the old behaviour was wrong.
    'src/lib/slugify.ts',
    'src/lib/__tests__/slugify.test.ts',
    // Mirrors agent-execute's slug logic byte for byte; it must keep matching
    // the backend, not this module. Drop it when the backend adopts slugify().
    'src/lib/__tests__/manage-deal-auto-lead.test.ts',
    // Not a slug generator — a search tokenizer that deliberately KEEPS å/ä/ö
    // as meaningful characters rather than folding them.
    'src/components/public/blocks/ConsultantMatcherBlock.tsx',
    // src/lib/modules/* is local Claude's exclusive territory. generateSlug()
    // there has the same non-ASCII bug; reported in session-memory.md, not
    // touched here.
    'src/lib/modules/helpers.ts',
  ]);

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(relative(process.cwd(), full));
    }
    return out;
  }

  it('every remaining ASCII-strip site is grandfathered', () => {
    const offenders: string[] = [];
    for (const rel of walk(join(process.cwd(), 'src'))) {
      if (GRANDFATHERED.has(rel)) continue;
      if (ASCII_STRIP.test(readFileSync(join(process.cwd(), rel), 'utf-8'))) offenders.push(rel);
    }
    expect(
      offenders,
      `hand-rolled slug generator(s) found — import { slugify } from '@/lib/slugify' instead:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('the grandfathered list has no stale entries', () => {
    for (const rel of GRANDFATHERED) {
      if (rel === 'src/lib/slugify.ts' || rel === 'src/lib/__tests__/slugify.test.ts') continue;
      const src = readFileSync(join(process.cwd(), rel), 'utf-8');
      expect(ASCII_STRIP.test(src), `${rel} no longer strips ASCII — drop it from GRANDFATHERED`).toBe(true);
    }
  });
});
