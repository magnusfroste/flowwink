import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scanHardcodedShapes, MARKER } from '../../../scripts/lib/scan-hardcoded-shapes.mjs';

/**
 * Guardrail (ratchet): no public component gains a `rounded-full` or a
 * `font-serif` — the radius and heading-font dials own those forms, and a
 * class that hard-codes them ignores the dial on every site. Synclair,
 * 2026-10-21/22: quick-links drew pills on a sharp-cornered site and a serif
 * heading beside Inter Bold; the page audit found the same in timeline,
 * ai-faq and team. Discovers, does not enumerate: every file under
 * src/components/public; the baseline may only shrink. A form that is round
 * or serif by design carries the marker on its line and is not counted.
 */
const ROOT = resolve(__dirname, '../../..');
const baseline: Record<string, { roundedFull: number; fontSerif: number }> = JSON.parse(
  readFileSync(resolve(ROOT, 'src/lib/__tests__/fixtures/hardcoded-shapes-baseline.json'), 'utf-8'),
);
const current = scanHardcodedShapes(ROOT) as Record<string, { roundedFull: number; fontSerif: number }>;

describe('inga nya hårdkodade former i publika komponenter', () => {
  it('ingen fil har fler rounded-full eller font-serif än sin baslinje', () => {
    const grew = Object.entries(current)
      .flatMap(([file, c]) => (['roundedFull', 'fontSerif'] as const)
        .filter((k) => c[k] > (baseline[file]?.[k] ?? 0))
        .map((k) => `${file}: ${k} ${c[k]} (baseline ${baseline[file]?.[k] ?? 0})`));
    expect(
      grew,
      `Antalet får bara krympa. Använd radien från ratten (rounded-[var(--radius)]) och rubrikfonten från ratten, `
      + `eller märk en form som är rund/serif BY DESIGN med "${MARKER}" på raden. `
      + 'Har du i stället FÄRRE: kör `node scripts/regen-hardcoded-shapes-baseline.mjs`.',
    ).toEqual([]);
  });

  it('baslinjen speglar verkligheten — inga rader för filer som är rena, inga högre tal än i dag', () => {
    const stale = Object.entries(baseline)
      .filter(([file, b]) => (current[file]?.roundedFull ?? 0) < b.roundedFull || (current[file]?.fontSerif ?? 0) < b.fontSerif)
      .map(([file]) => file);
    expect(stale, 'kör `node scripts/regen-hardcoded-shapes-baseline.mjs` så baslinjen krymper med koden').toEqual([]);
  });

  it('skannern räknar formen, inte filen: markören friar en rad, inget annat', () => {
    expect(Object.keys(current).every((f) => f.startsWith('src/components/public/'))).toBe(true);
    expect(MARKER).toBe('shape-by-design');
  });
});
