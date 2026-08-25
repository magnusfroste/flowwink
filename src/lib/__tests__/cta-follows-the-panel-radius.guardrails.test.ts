/**
 * En indragen färgpanel bär systemets panelradie.
 *
 * cta är inte full-bleed: BlockRenderer lägger den i innehållscontainern, så
 * dess primärfärgade yta är en PANEL — samma form som Newsletter,
 * PricingCalculator och AiFaq, vilka alla bär rounded-[var(--radius-block)].
 * CTA:n (Lovable-ursprung) ritade panelen med raka hörn — det enda blocket i
 * systemet som avvek, upptäckt av Magnus på optic 2026-08-25 som "ovanligt
 * kantiga hörn mot övriga designelement".
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CTA = readFileSync(
  join(__dirname, '../../components/public/blocks/CTABlock.tsx'),
  'utf-8',
);
const RENDERER = readFileSync(
  join(__dirname, '../../components/public/BlockRenderer.tsx'),
  'utf-8',
);

describe('cta följer panelradien', () => {
  it('alla tre indragna varianter (split, with-image, default) bär --radius-block', () => {
    const hits = CTA.match(/rounded-\[var\(--radius-block/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(3);
  });

  it('bakgrundsbilder klipps till hörnen — radie utan overflow-hidden är en radie som inte syns', () => {
    // Varje sektion som bär radien måste också klippa: with-image/split har
    // absolutpositionerade bilder som annars målar över hörnen.
    const sections = CTA.match(/rounded-\[var\(--radius-block[^"']*/g) ?? [];
    for (const cls of sections) {
      expect(cls, `radie utan clip: ${cls}`).toContain('overflow-hidden');
    }
  });

  it('pinnen vilar på att cta förblir icke-full-bleed — flyttas den, ompröva radien', () => {
    const fullBleed = RENDERER.match(/FULL_BLEED_TYPES = new Set\(\[[\s\S]*?\]\)/)?.[0] ?? '';
    expect(fullBleed).not.toContain("'cta'");
  });
});
