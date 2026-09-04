import { describe, it, expect } from 'vitest';
import { ALL_TEMPLATES } from '../../data/templates';
import { headerVariantPresets } from '../../hooks/useGlobalBlocks';

/**
 * A header variant is a preset in the editor. A template that names one
 * variant while carrying another variant's decisive fields renders as the
 * fields say, while the editor shows the variant selected — on
 * www.flowwink.com (2026-09-04) "clean" + blur + sticky meant the header only
 * became transparent after toggling to sticky and back. The decisive fields
 * are the ones that change what a visitor sees: background and stickiness.
 */
const DECISIVE = ['backgroundStyle', 'stickyHeader'] as const;

describe('every template header agrees with its own variant', () => {
  it('no template names a variant while carrying another variant\'s decisive fields', () => {
    const offenders: string[] = [];
    for (const t of ALL_TEMPLATES) {
      const h = (t as { headerSettings?: Record<string, unknown> }).headerSettings;
      if (!h || typeof h.variant !== 'string') continue;
      const preset = headerVariantPresets[h.variant];
      if (!preset) continue;
      for (const key of DECISIVE) {
        if (h[key] !== undefined && preset[key] !== undefined && h[key] !== preset[key]) {
          offenders.push(`${t.id}: variant "${h.variant}" but ${key}=${JSON.stringify(h[key])} (preset: ${JSON.stringify(preset[key])})`);
        }
      }
    }
    expect(offenders, 'Pick the variant whose look you mean, or change the fields to match it').toEqual([]);
  });
});
