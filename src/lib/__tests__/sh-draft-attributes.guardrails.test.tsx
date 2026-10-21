import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { HeroBlock } from '@/components/public/blocks/HeroBlock';
import { FeaturesBlock } from '@/components/public/blocks/FeaturesBlock';
import { TextBlock } from '@/components/public/blocks/TextBlock';
import { parseTagGroups, formatTagGroups, parseSpecs, formatSpecs } from '@/lib/tag-groups';
import { BLOCK_REFERENCE } from '@/lib/block-reference';
import type { FeatureItem } from '@/types/cms';

/**
 * Guardrail: the small shapes a design draft is full of are attributes on
 * the blocks that already exist — a chip row under a hero's CTAs, chip
 * groups under a grid or after a text, a product card as a feature item
 * (picture, tagline, spec rows, its own surface), a form beside its intro —
 * and a surface inside an inverse band that asks for the inverse again is
 * back on the theme's own ground. Synclair's SH draft, 2026-10-21.
 */
const r = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);
const doc = (t: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });

describe('chips and specs as lines', () => {
  it('round-trip "Label: a, b" and "Label: value"', () => {
    const g = parseTagGroups('Adapts to your mission: ISR, Interceptor\nArduPilot, PX4\n\n');
    expect(g).toEqual([{ label: 'Adapts to your mission', tags: ['ISR', 'Interceptor'] }, { tags: ['ArduPilot', 'PX4'] }]);
    expect(formatTagGroups(g)).toBe('Adapts to your mission: ISR, Interceptor\nArduPilot, PX4');
    const s = parseSpecs('Weight: 320 g\nInterface: Ethernet\n');
    expect(s).toEqual([{ label: 'Weight', value: '320 g' }, { label: 'Interface', value: 'Ethernet' }]);
    expect(formatSpecs(s)).toBe('Weight: 320 g\nInterface: Ethernet');
  });
});

describe('hero chips', () => {
  it('a row of chips under the CTAs, in the split layout and the centered one', () => {
    for (const layout of ['split-right', 'centered'] as const) {
      const { container } = r(<HeroBlock data={{ title: 'Vision', layout, tags: ['01 Interceptor', '02 Deep strike', '03 ISR'], tagsLabel: 'Missions', primaryButton: { text: 'Book', url: '/contact' } }} />);
      const row = container.querySelector('[data-hero-tags]')!;
      expect(row, layout).not.toBeNull();
      expect([...row.querySelectorAll('[data-tag]')].map((e) => e.textContent)).toEqual(['01 Interceptor', '02 Deep strike', '03 ISR']);
      expect(row.textContent).toMatch(/Missions/);
    }
    const plain = r(<HeroBlock data={{ title: 'Vision', layout: 'centered' }} />);
    expect(plain.container.querySelector('[data-hero-tags]')).toBeNull();
  });
});

describe('product cards and chip groups on features; chip groups on text', () => {
  const items: FeatureItem[] = [
    { id: 'a', icon: 'ScanEye', title: 'MOSS One', subtitle: 'Development kit', description: 'Fast integration.', image: '/moss-one.jpg', imageAlt: 'MOSS One', specs: [{ label: 'Weight', value: '320 g' }, { label: 'Interface', value: 'Ethernet' }] },
    { id: 'b', icon: 'ScanEye', title: 'MOSS Light', description: 'Production platform.', inverse: true },
  ];
  it('an item with image is a product card: picture instead of icon, tagline, spec rows; inverse flips that card alone', () => {
    const { container } = r(<FeaturesBlock data={{ features: items, variant: 'cards', columns: 2 }} />);
    const cards = container.querySelectorAll('.group');
    expect(cards.length).toBe(2);
    expect(cards[0].querySelector('[data-feature-image]')!.getAttribute('src')).toBe('/moss-one.jpg');
    expect(cards[0].querySelector('[data-feature-subtitle]')!.textContent).toBe('Development kit');
    expect(cards[0].querySelectorAll('[data-feature-specs] dt').length).toBe(2);
    expect(cards[0].textContent).toMatch(/320 g/);
    expect(cards[0].className).not.toMatch(/surface-inverse/);
    expect(cards[1].className).toMatch(/surface-inverse/);
    expect(cards[1].querySelector('[data-feature-image]')).toBeNull();
  });
  it('tagGroups render under the grid and after a text block', () => {
    const groups = [{ label: 'Adapts to your mission', tags: ['ISR', 'Interceptor'] }, { tags: ['ArduPilot'] }];
    const f = r(<FeaturesBlock data={{ features: items.slice(0, 1), tagGroups: groups }} />);
    expect(f.container.querySelectorAll('[data-tag-groups] [data-tag]').length).toBe(3);
    expect(f.container.querySelector('[data-tag-groups]')!.textContent).toMatch(/Adapts to your mission/);
    const t = r(<TextBlock data={{ content: doc('Body.') as never, tagGroups: groups }} />);
    expect(t.container.querySelectorAll('[data-tag-groups] [data-tag]').length).toBe(3);
    const none = r(<TextBlock data={{ content: doc('Body.') as never }} />);
    expect(none.container.querySelector('[data-tag-groups]')).toBeNull();
  });
});

describe('the inverse of the inverse is the ground', () => {
  it('the stylesheet carries the nested rule for both themes, reading the branding ground and primary', () => {
    const css = readFileSync('src/index.css', 'utf-8');
    expect(css).toMatch(/\.surface-inverse \.surface-inverse \{[^}]*--background: var\(--background-ground, 210 20% 99%\)/);
    expect(css).toMatch(/\.dark \.surface-inverse \.surface-inverse \{[^}]*--background: var\(--background-ground, 220 25% 8%\)/);
    expect(css).toMatch(/\.surface-inverse \.surface-inverse \{[^}]*--primary: var\(--primary-ground, 220 100% 26%\)/);
  });
});

describe('the catalogue', () => {
  it('says where each attribute lives', () => {
    const ref = (t: string) => BLOCK_REFERENCE.find((b) => b.type === t)!;
    const f = (t: string, n: string) => ref(t).fields.find((x) => x.name === n);
    expect(f('hero', 'tags')!.description).toMatch(/mission index/);
    expect(f('hero', 'tagsLabel')).toBeTruthy();
    expect(f('features', 'tagGroups')).toBeTruthy();
    expect(f('text', 'tagGroups')).toBeTruthy();
    expect(f('features', 'features')!.description).toMatch(/PRODUCT CARD/);
    expect(f('features', 'features')!.description).toMatch(/never invented figures/);
    expect(f('form', 'layout')!.options).toEqual(['stack', 'split']);
    expect(f('form', 'intro')).toBeTruthy();
    expect(f('form', 'eyebrow')).toBeTruthy();
  });
});
