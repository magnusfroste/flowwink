/**
 * Ett kryss stänger.
 *
 * GalleryBlocks lightbox bar TVÅ stängningskryss i samma hörn: blockets egna
 * vita (byggt för den mörka botten där shadcn-dialogens temafärgade kryss är
 * nära osynligt) OCH DialogContents inbyggda. Fixen följer sidebar-
 * prejudikatet: [&>button]:hidden på DialogContent när ytan bär ett eget,
 * bättre lämpat kryss. Pinnen är en populationsvakt: varje publikt block som
 * ritar eget X inuti en DialogContent MÅSTE gömma det inbyggda.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(__dirname, '../../components/public/blocks');

describe('ett kryss stänger', () => {
  it('eget X i en DialogContent ⇒ det inbyggda är gömt', () => {
    const offenders: string[] = [];
    for (const f of readdirSync(DIR).filter((x) => x.endsWith('.tsx'))) {
      const src = readFileSync(join(DIR, f), 'utf-8');
      if (!src.includes('DialogContent') || !/<X className/.test(src)) continue;
      if (!src.includes('[&>button]:hidden')) offenders.push(f);
    }
    expect(offenders, `dubbelkryss: ${offenders.join(', ')}`).toEqual([]);
  });
});
