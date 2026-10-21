import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PageBlocks } from '@/components/public/PageBlocks';
import { BrandingContext } from '@/providers/BrandingProvider';
import { pagesModule } from '../modules/pages-module';
import type { ContentBlock } from '@/types/cms';

/**
 * Guardrail: the renderer's automatic band alternation is a branding dial.
 * It used to be unconditional — every second plain block got a muted tint
 * with no way off but sectionBackground "none" per block. Synclair's draft
 * changes surface only through its pixel-gradient dividers; the tinted
 * testimonial on its home page was the renderer's, not the design's
 * (2026-10-21).
 */
const root = join(__dirname, '../../..');
// BlockRenderer's scroll animation observes with IntersectionObserver, which jsdom lacks.
beforeAll(() => {
  class IO { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
});
const doc = (t: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const blocks = [
  { id: 'a', type: 'text', data: { content: doc('one') } },
  { id: 'b', type: 'quote', data: { quote: 'Two', author: 'x' } },
  { id: 'c', type: 'text', data: { content: doc('three') } },
  { id: 'd', type: 'quote', data: { quote: 'Four', author: 'y' } },
] as unknown as ContentBlock[];
const mount = (sectionAlternation?: 'auto' | 'none') => render(
  <BrandingContext.Provider value={{ branding: sectionAlternation ? { sectionAlternation } : {}, isLoading: false }}>
    <MemoryRouter><PageBlocks blocks={blocks} /></MemoryRouter>
  </BrandingContext.Provider>,
);

describe('section alternation is a dial', () => {
  it('auto (and unset) tints every second plain block', async () => {
    const { container, findAllByText } = mount();
    await findAllByText(/one|Two|three|Four/);
    expect(container.querySelectorAll('section.bg-muted\\/40').length).toBe(2);
    const explicit = mount('auto');
    await explicit.findAllByText(/one/);
    expect(explicit.container.querySelectorAll('section.bg-muted\\/40').length).toBe(2);
  });
  it('none paints every plain block on the page ground', async () => {
    const { container, findAllByText } = mount('none');
    await findAllByText(/one|Two|three|Four/);
    expect(container.querySelectorAll('section.bg-muted\\/40').length).toBe(0);
  });
  it('the public page reads the same dial, and the skill and admin page carry it', () => {
    const page = readFileSync(join(root, 'src/pages/PublicPage.tsx'), 'utf8');
    expect(page).toMatch(/brandingForBands\?\.sectionAlternation \?\? 'auto'\) !== 'none'/);
    expect(page).toMatch(/alternate && contentIndex % 2 === 1 \? 'muted' : 'none'/);
    const seed = pagesModule.skillSeeds.find((s) => s.name === 'site_branding_update')!;
    const props = (seed.tool_definition as { function: { parameters: { properties: Record<string, { enum?: string[] }> } } }).function.parameters.properties;
    expect(props.section_alternation.enum).toEqual(['auto', 'none']);
    expect(seed.instructions ?? '').toMatch(/section_alternation/);
    const handler = readFileSync(join(root, 'supabase/functions/agent-execute/index.ts'), 'utf8');
    expect(handler).toMatch(/pick\('section_alternation', section_alternation, \['auto', 'none'\]\)/);
    const admin = readFileSync(join(root, 'src/pages/admin/BrandingSettingsPage.tsx'), 'utf8');
    expect(admin).toMatch(/Automatic band alternation/);
  });
});
