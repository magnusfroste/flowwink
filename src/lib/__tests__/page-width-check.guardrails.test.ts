import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CHECK_WIDTHS, measureWidth, verdictOf, SQUEEZED_BELOW_PX } from '../page-width-check';

/**
 * A page measured at the widths people read it in (#940). The measurement is
 * taken in the editor's browser; an agent reads it. Three ways it lied while
 * it was being built are pinned here, each one a "Fits." that was not true:
 * a frame measured after it was removed, a page measured before its blocks had
 * drawn, and a page that clips its own overflow so nothing ever "scrolls".
 */

type Box = { left: number; right: number; width: number; height: number };
interface FakeEl {
  tagName: string;
  textContent: string;
  childElementCount: number;
  scrollWidth: number;
  clientWidth: number;
  parentElement: FakeEl | null;
  ownerDocument: unknown;
  style: Record<string, string>;
  block: string | null;
  getBoundingClientRect(): Box;
  closest(selector: string): { id: string } | null;
}

function el(tag: string, box: Partial<Box>, over: Partial<FakeEl> = {}): FakeEl {
  const rect: Box = { left: 0, right: 100, width: 100, height: 20, ...box };
  const self: FakeEl = {
    tagName: tag.toUpperCase(),
    textContent: '',
    childElementCount: 0,
    scrollWidth: rect.width,
    clientWidth: rect.width,
    parentElement: null,
    ownerDocument: null,
    style: { display: 'block', visibility: 'visible', position: 'static', overflowX: 'visible', textOverflow: 'clip' },
    block: 'block-1',
    getBoundingClientRect: () => rect,
    closest(selector: string) {
      if (selector.startsWith('main') && self.block && !['navigation', 'footer'].includes(self.block)) return { id: self.block };
      if (selector === 'header, nav' && self.block === 'navigation') return { id: '' };
      if (selector === 'footer' && self.block === 'footer') return { id: '' };
      return null;
    },
    ...over,
  };
  if (over.style) self.style = { display: 'block', visibility: 'visible', position: 'static', overflowX: 'visible', textOverflow: 'clip', ...over.style };
  return self;
}

function page(screen: number, els: FakeEl[], scrollWidth = screen): Document {
  const body = { querySelectorAll: () => els };
  const doc = {
    documentElement: { clientWidth: screen, scrollWidth },
    body,
    defaultView: { getComputedStyle: (e: FakeEl) => e.style },
  };
  for (const e of els) e.ownerDocument = doc;
  return doc as unknown as Document;
}

describe('measuring one width', () => {
  it('a page where everything is inside the screen fits', () => {
    const m = measureWidth(page(390, [el('p', { right: 380, width: 300 }, { textContent: 'Hello there' })]), 390);
    expect(m).toEqual({ width: 390, overflow_px: 0, wider_than_screen: [], cut_off: [], squeezed: [] });
    expect(verdictOf(m)).toEqual({ ok: true, line: 'Fits.' });
  });

  it('judges the right edge — a site that clips its overflow never scrolls sideways', () => {
    // scrollWidth equals the screen (overflow-x: clip on the root), yet a block reaches 60 px past it.
    const m = measureWidth(page(390, [el('div', { right: 450, width: 450 }, { textContent: 'A wide table', block: 'pricing' })]), 390);
    expect(m.overflow_px).toBe(60);
    expect(m.wider_than_screen).toEqual([{ block: 'pricing', tag: 'div', text: 'A wide table', over_px: 60 }]);
    expect(verdictOf(m).ok).toBe(false);
  });

  it('names the outermost thing that sticks out, once', () => {
    const outer = el('div', { right: 500, width: 500 }, { childElementCount: 1, block: 'gallery' });
    const inner = el('img', { right: 500, width: 480 }, { parentElement: outer, block: 'gallery' });
    const m = measureWidth(page(390, [outer, inner]), 390);
    expect(m.wider_than_screen.map((f) => f.tag)).toEqual(['div']);
  });

  it("the site's own menu and footer are named as such", () => {
    const m = measureWidth(page(768, [el('nav', { right: 913, width: 740 }, { block: 'navigation', textContent: 'Home Platform' })]), 768);
    expect(m.wider_than_screen[0]).toMatchObject({ block: 'navigation', over_px: 145 });
  });

  it('leaves alone what scrolls in its own box, and what is placed by itself', () => {
    const scroller = el('div', { right: 380, width: 360 }, { childElementCount: 1, style: { overflowX: 'auto' } });
    const wideTable = el('table', { right: 900, width: 880 }, { parentElement: scroller });
    const drawer = el('aside', { right: 700, width: 300 }, { style: { position: 'fixed' } });
    const m = measureWidth(page(390, [scroller, wideTable, drawer]), 390);
    expect(m.wider_than_screen).toEqual([]);
    expect(m.overflow_px).toBe(0);
  });

  it('text clipped by its own box is cut off — unless the ellipsis says it is meant', () => {
    const clipped = el('span', { right: 200, width: 100 }, { textContent: 'A long label that does not fit', scrollWidth: 240, clientWidth: 100, style: { overflowX: 'hidden' } });
    const truncated = el('span', { right: 200, width: 100 }, { textContent: 'Another long label', scrollWidth: 240, clientWidth: 100, style: { overflowX: 'hidden', textOverflow: 'ellipsis' } });
    const m = measureWidth(page(390, [clipped, truncated]), 390);
    expect(m.cut_off.map((f) => f.text)).toEqual(['A long label that does not fit']);
  });

  it('six columns on a phone "fit" — and are squeezed', () => {
    const narrow = (text: string) => el('h3', { right: 60, width: 28 }, { textContent: text, block: 'six' });
    const m = measureWidth(page(390, [narrow('One'), narrow('Three'), narrow('Responsibilities')]), 390);
    expect(m.overflow_px).toBe(0);
    expect(m.squeezed.map((f) => f.text)).toEqual(['Three', 'Responsibilities']);
    expect(m.squeezed[0]).toMatchObject({ block: 'six', over_px: 28 });
    expect(28).toBeLessThan(SQUEEZED_BELOW_PX);
    expect(verdictOf(m)).toEqual({ ok: false, line: '2 texts squeezed.' });
  });

  it('what is not shown is not measured', () => {
    const hidden = el('div', { right: 900, width: 900 }, { style: { display: 'none' } });
    const label = el('span', { right: 900, width: 1, height: 1 }, { textContent: 'Skip to content' });
    expect(measureWidth(page(390, [hidden, label]), 390).wider_than_screen).toEqual([]);
  });

  it('measures at phone, tablet and desktop width', () => {
    expect([...CHECK_WIDTHS]).toEqual([390, 768, 1280]);
  });
});

describe('the three ways it said "Fits." and was wrong', () => {
  const component = readFileSync('src/components/admin/PageWidthCheck.tsx', 'utf8');

  it('measures while the frame is still in the page', () => {
    const measure = component.indexOf('measured = measureWidth(doc, width)');
    const settled = component.indexOf('done(() => resolve(measured))');
    expect(measure).toBeGreaterThan(-1);
    expect(settled).toBeGreaterThan(measure);
    // The old shape: done() removes the frame, THEN the callback measured a document with no layout.
    expect(component).not.toMatch(/done\(\(\) => resolve\(measureWidth\(/);
  });

  it('waits until the page has stopped changing — blocks arrive one by one', () => {
    expect(component).toMatch(/new MutationObserver\(\(\) => \{ lastChange = Date\.now\(\); \}\)/);
    expect(component).toMatch(/const quiet = Date\.now\(\) - lastChange >= QUIET_MS;/);
  });

  it('a frame that drew no blocks is a failure to measure, never a pass', () => {
    expect(component).toMatch(/if \(!drawn\) return done\(\(\) => reject\(new Error\(`The preview drew no blocks/);
  });

  it('the frame is off screen but not hidden with visibility', () => {
    const style = component.slice(component.indexOf('frame.style.cssText'), component.indexOf('frame.style.cssText') + 200);
    expect(style).toContain('opacity:0');
    expect(style).not.toContain('visibility:hidden');
  });
});

describe('where the measurement goes', () => {
  const migration = readFileSync('supabase/migrations/20261120150000_sidans-bredder-matta.sql', 'utf8');
  const sensor = readFileSync('supabase/functions/_shared/handlers/inspect-rendered-page.ts', 'utf8');

  it('its own table — recording a measurement is not an edit of the page', () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.page_width_checks/);
    expect(migration).not.toMatch(/ALTER TABLE public\.pages\b/);
  });

  it('written by someone with access to Pages, never by a visitor', () => {
    expect(migration).toMatch(/auth\.role\(\) = 'service_role' OR public\.can_access_module\(auth\.uid\(\), 'pages'\)/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.record_page_width_check\(uuid, jsonb, boolean\) FROM PUBLIC, anon;/);
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.page_width_checks FROM anon;/);
  });

  it('a measurement from a browser is capped and shaped before it is kept', () => {
    expect(migration).toMatch(/length\(p_widths::text\) > 40000/);
    expect(migration).toMatch(/v_width < 240 OR v_width > 4000/);
  });

  it('the agent reads it through the page sensor, and is told when it is old or missing', () => {
    expect(sensor).toMatch(/width_check: await loadWidthCheck\(supabase, page\)/);
    expect(sensor).toMatch(/status: 'never_checked'/);
    expect(sensor).toMatch(/An agent cannot take the measurement/);
    expect(sensor).toMatch(/const stale = new Date\(page\.updated_at\)\.getTime\(\) > new Date\(row\.checked_at\)\.getTime\(\) \+ 1000;/);
  });
});
