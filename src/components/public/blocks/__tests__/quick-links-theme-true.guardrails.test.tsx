import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { QuickLinksBlock } from '../QuickLinksBlock';
import { BLOCK_REFERENCE } from '@/lib/block-reference';

/**
 * Guardrail: a quick-links row follows the site, not a light-theme
 * assumption. "dark" was bg-foreground / text-background — a white slab with
 * black text on a dark site; the buttons were hard-coded pills while the
 * site's radius dial said sharp; the heading was a serif <p> outside the
 * heading dials; a link's "primary" variant was advertised and never drawn
 * (synclair's three rows, 2026-10-21).
 */
const links = [{ id: 'a', label: 'Boka', url: '/boka', variant: 'primary' as const }, { id: 'b', label: 'Material', url: '/material' }];

describe('quick-links follows the site', () => {
  it('"dark" is a dark panel on both themes: the card surface under dark:, never an inverted slab', () => {
    const { container } = render(<QuickLinksBlock data={{ heading: 'Hej', links, variant: 'dark' }} />);
    const layer = container.querySelector('div[aria-hidden]')!;
    expect(layer.className).toMatch(/\bbg-foreground\b/);
    expect(layer.className).toMatch(/dark:bg-card/);
    expect(container.querySelector('section')!.className).toMatch(/radius-block/);
  });
  it('"ground" paints nothing and carries no panel shell', () => {
    const { container } = render(<QuickLinksBlock data={{ heading: 'Hej', links, variant: 'ground' }} />);
    expect(container.querySelector('div[aria-hidden]')).toBeNull();
    expect(container.querySelector('section')!.className).not.toMatch(/radius-block|px-6/);
    expect(container.querySelector('section')!.getAttribute('data-quick-links')).toBe('ground');
  });
  it('the heading is an h2 (the heading dials apply), links take the control radius, and a primary link is the brand button', () => {
    const { container } = render(<QuickLinksBlock data={{ heading: 'Hej', links, variant: 'muted' }} />);
    expect(container.querySelector('h2')!.textContent).toBe('Hej');
    expect(container.querySelector('h2')!.className).not.toMatch(/font-serif/);
    const [primary, secondary] = [...container.querySelectorAll('a')];
    expect(primary.className).toMatch(/rounded-\[var\(--radius\)\]/);
    expect(primary.className).not.toMatch(/rounded-full/);
    expect(primary.className).toMatch(/bg-primary/);
    expect(primary.getAttribute('data-link-variant')).toBe('primary');
    expect(secondary.className).not.toMatch(/bg-primary/);
    expect(secondary.getAttribute('data-link-variant')).toBe('secondary');
  });
  it('the catalogue says so', () => {
    const ref = BLOCK_REFERENCE.find((b) => b.type === 'quick-links')!;
    expect(ref.fields.find((f) => f.name === 'variant')!.options).toEqual(['dark', 'primary', 'muted', 'ground']);
    expect(ref.fields.find((f) => f.name === 'links')!.description).toMatch(/filled brand button/);
  });
});
