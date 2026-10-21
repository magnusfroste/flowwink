import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TwoColumnBlock } from '../TwoColumnBlock';
import { BLOCK_REFERENCE } from '@/lib/block-reference';
import type { TwoColumnBlockData } from '@/types/cms';

/**
 * Guardrail: a spec row is a row, not a sentence.
 *
 * Every section of synclair's design reference is "image + title + label /
 * value rows + link" (GNSS-FREE NAVIGATION · Visual-inertial, TARGET
 * ACQUISITION · < 2 s). two-column had everything but the rows, so the agent
 * wrote them into the prose — and prose is where a model invents a number.
 * `specs` on two-column is the row; the catalogue says a figure belongs there.
 */
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const base: TwoColumnBlockData = { title: 'Interceptor', content: doc('Onboard vision for intercept.') as never, imageSrc: '/i.jpg', imageAlt: 'Interceptor', imagePosition: 'right' };
const mount = (data: TwoColumnBlockData) => render(<MemoryRouter><TwoColumnBlock data={data} /></MemoryRouter>);

describe('two-column spec rows', () => {
  it('renders label / value rows as a definition list under the text, in order, verbatim', () => {
    const { container } = mount({ ...base, specsTitle: 'Key figures', specs: [
      { label: 'GNSS-FREE NAVIGATION', value: 'Visual-inertial' },
      { label: 'TARGET ACQUISITION', value: '< 2 s' },
    ] });
    const dl = container.querySelector('dl[data-spec-rows]')!;
    expect(dl).not.toBeNull();
    expect(dl.textContent).toMatch(/Key figures/);
    const labels = Array.from(dl.querySelectorAll('dt')).map((d) => d.textContent);
    const values = Array.from(dl.querySelectorAll('dd')).map((d) => d.textContent);
    expect(labels).toEqual(['GNSS-FREE NAVIGATION', 'TARGET ACQUISITION']);
    expect(values).toEqual(['Visual-inertial', '< 2 s']);
  });

  it('no rows, or only empty rows, renders no list — and the two-text layout carries the rows too', () => {
    expect(mount(base).container.querySelector('dl[data-spec-rows]')).toBeNull();
    expect(mount({ ...base, specs: [{ label: '', value: '' }] }).container.querySelector('dl[data-spec-rows]')).toBeNull();
    const twoText = mount({ ...base, layout: 'text-text', leftColumn: doc('L') as never, rightColumn: doc('R') as never, specs: [{ label: 'RANGE', value: '412 km' }] });
    expect(twoText.container.querySelector('dl[data-spec-rows]')!.textContent).toMatch(/RANGE412 km/);
  });

  it('the catalogue an agent reads carries the rows, typed, with the rule about figures', () => {
    const ref = BLOCK_REFERENCE.find((b) => b.type === 'two-column')!;
    const specs = ref.fields.find((f) => f.name === 'specs')!;
    expect(specs.type).toBe('array');
    expect(specs.itemFields!.map((f) => f.name)).toEqual(['label', 'value']);
    expect(specs.itemFields!.every((f) => f.required)).toBe(true);
    expect(specs.description).toMatch(/not in the prose/);
    expect(ref.fields.find((f) => f.name === 'specsTitle')).toBeTruthy();
    expect(ref.description).toMatch(/spec rows/);
  });
});
