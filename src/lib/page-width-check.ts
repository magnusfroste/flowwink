/**
 * Measuring a page at the widths people read it in (#940).
 *
 * The edge runtime has no browser; the page editor does — the browser of the
 * person using it. `measureWidth` runs INSIDE a frame that has drawn the page
 * at one width and answers two questions a static check cannot:
 *
 *   wider_than_screen — what sticks out past the right edge (the page scrolls
 *                       sideways on a phone),
 *   cut_off           — text that is clipped by its own box without the
 *                       ellipsis that would make the clipping deliberate,
 *   squeezed          — text in a box too narrow to read it in.
 *
 * Each finding names the BLOCK it sits in (the section's id is the block's id
 * or its anchor), so an agent reading the result knows which block to change.
 */

export const CHECK_WIDTHS = [390, 768, 1280] as const;
const MAX_FINDINGS = 8;

export interface WidthFinding {
  /** The block's id or anchor; 'navigation' / 'footer' for the site's own chrome; null when outside any. */
  block: string | null;
  tag: string;
  text: string;
  over_px?: number;
}

export interface WidthMeasurement {
  width: number;
  /** How far the widest thing reaches past the right edge. 0 = everything is inside. */
  overflow_px: number;
  wider_than_screen: WidthFinding[];
  cut_off: WidthFinding[];
  /** Text in a box too narrow to read it in — six columns on a phone "fit", one letter per line. */
  squeezed: WidthFinding[];
}

/** Narrower than this, a box of text breaks words letter by letter. */
export const SQUEEZED_BELOW_PX = 44;

const snippet = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 70);

function blockOf(el: Element): string | null {
  const section = el.closest('main section[id], main div[id]');
  if (section?.id) return section.id;
  if (el.closest('header, nav')) return 'navigation';
  if (el.closest('footer')) return 'footer';
  return null;
}

/** Does the page scroll this element sideways on purpose (a carousel, a wide table in its own scroller)? */
function insideOwnScroller(el: Element, view: Window): boolean {
  for (let p = el.parentElement; p && p !== el.ownerDocument.body; p = p.parentElement) {
    const style = view.getComputedStyle(p);
    if (style.overflowX === 'auto' || style.overflowX === 'scroll') return true;
    // A drawer or an overlay is placed by itself, not by the page's width.
    if (style.position === 'fixed') return true;
  }
  return false;
}

/**
 * Measure the document a frame has drawn. Reads layout only; changes nothing.
 *
 * The right EDGE of every element is what is judged, not whether the page
 * scrolls sideways: a site that clips its own overflow (this one does) never
 * scrolls — what sticks out is simply not shown, which is the worse failure.
 */
export function measureWidth(doc: Document, width: number): WidthMeasurement {
  const view = doc.defaultView;
  const root = doc.documentElement;
  const screen = root.clientWidth;
  const wider: WidthFinding[] = [];
  const cut: WidthFinding[] = [];
  const squeezed: WidthFinding[] = [];
  let reach = Math.max(0, root.scrollWidth - screen);
  if (!view) return { width, overflow_px: Math.round(reach), wider_than_screen: wider, cut_off: cut, squeezed };

  const sticking = new Set<Element>();
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    const style = view.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.position === 'fixed') continue;
    const rect = el.getBoundingClientRect();
    // A one-pixel box is a screen-reader label, not something to read.
    if (rect.width <= 1 || rect.height <= 1) continue;
    const leafText = el.childElementCount === 0 ? (el.textContent ?? '').trim() : '';

    // Sticks out to the right — and no ancestor already reported for the same reason.
    if (rect.right > screen + 1) {
      let inside = false;
      for (let p = el.parentElement; p; p = p.parentElement) if (sticking.has(p)) { inside = true; break; }
      if (!inside && insideOwnScroller(el, view)) { sticking.add(el); continue; }
      sticking.add(el);
      if (!inside) {
        reach = Math.max(reach, rect.right - screen);
        if (wider.length < MAX_FINDINGS) {
          wider.push({ block: blockOf(el), tag: el.tagName.toLowerCase(), text: snippet(el), over_px: Math.round(rect.right - screen) });
        }
      }
    }

    if (!leafText) continue;

    // Clipped by its own box, with no ellipsis to say it is meant.
    if (el.scrollWidth > el.clientWidth + 1
        && (style.overflowX === 'hidden' || style.overflowX === 'clip')
        && style.textOverflow !== 'ellipsis'
        && cut.length < MAX_FINDINGS) {
      cut.push({ block: blockOf(el), tag: el.tagName.toLowerCase(), text: snippet(el) });
    }

    // A box too narrow for its own words.
    const longestWord = leafText.split(/\s+/).reduce((a, w) => Math.max(a, w.length), 0);
    if (rect.width < SQUEEZED_BELOW_PX && longestWord >= 4 && style.display !== 'inline' && squeezed.length < MAX_FINDINGS) {
      squeezed.push({ block: blockOf(el), tag: el.tagName.toLowerCase(), text: snippet(el), over_px: Math.round(rect.width) });
    }
  }
  return { width, overflow_px: Math.round(reach), wider_than_screen: wider, cut_off: cut, squeezed };
}

/** One sentence per width, for the person who pressed the button. */
export function verdictOf(m: WidthMeasurement): { ok: boolean; line: string } {
  const parts: string[] = [];
  if (m.overflow_px > 0) parts.push(`${m.overflow_px} px sticks out past the screen`);
  if (m.cut_off.length) parts.push(`${m.cut_off.length} text${m.cut_off.length === 1 ? '' : 's'} cut off`);
  if (m.squeezed.length) parts.push(`${m.squeezed.length} text${m.squeezed.length === 1 ? '' : 's'} squeezed`);
  return parts.length ? { ok: false, line: parts.join(', ') + '.' } : { ok: true, line: 'Fits.' };
}
