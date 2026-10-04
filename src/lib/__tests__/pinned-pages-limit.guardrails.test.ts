import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_PINS, pinLimitReason, type PinnedPage } from '@/hooks/usePinnedPages';

/**
 * Header pins: the limit says so, and the strip shows what it hides.
 *
 * Eight pins, and the ninth was dropped silently while the sidebar button kept
 * offering "Pin to header". The strip scrolled sideways without a scrollbar,
 * so a pin past the edge was invisible. Raised to 12 (2026-10-04) together
 * with the two things that make a higher number safe: feedback at the limit
 * and a visible edge when the row continues.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const pin = (i: number): PinnedPage => ({ href: `/admin/p${i}`, name: `P${i}`, icon: 'FileText' });

describe('the pin limit', () => {
  it('is twelve and refuses with a reason, never silently', () => {
    expect(MAX_PINS).toBe(12);
    const full = Array.from({ length: MAX_PINS }, (_, i) => pin(i));
    expect(pinLimitReason(full, pin(99))).toBe('full');
    expect(pinLimitReason(full.slice(0, 5), pin(2))).toBe('duplicate');
    expect(pinLimitReason(full.slice(0, 5), pin(99))).toBeNull();
    // duplicate wins over full: re-pinning a pinned page is never "the header is full"
    expect(pinLimitReason(full, pin(3))).toBe('duplicate');
  });

  it('addPin tells the user when the header is full and returns false', () => {
    const hook = read('src/hooks/usePinnedPages.ts');
    expect(hook).toMatch(/pinLimitReason\(pins, page\)/);
    expect(hook).toMatch(/toast\.info\(`Header is full/);
    expect(hook).toMatch(/isFull: pins\.length >= MAX_PINS/);
  });

  it('the sidebar button says so too, on both of its pin sites', () => {
    const sidebar = read('src/components/admin/AdminSidebar.tsx');
    expect(sidebar.match(/title=\{pinTitle\(pinned\)\}/g)?.length).toBe(2);
    expect(sidebar.match(/aria-disabled=\{!pinned && isFull\}/g)?.length).toBe(2);
    expect(sidebar).toMatch(/Header is full \(\$\{maxPins\}\/\$\{maxPins\}\)/);
    expect(sidebar).not.toMatch(/title=\{pinned \? 'Unpin from header' : 'Pin to header'\}/);
  });
});

describe('the strip shows that it continues', () => {
  it('the header mounts the pins inside PinnedScroller, which watches both edges', () => {
    const header = read('src/components/admin/AdminContentHeader.tsx');
    expect(header).toMatch(/<PinnedScroller>\s*<PinnedPagesBar/);
    const scroller = read('src/components/admin/PinnedScroller.tsx');
    expect(scroller).toMatch(/scrollLeft \+ el\.clientWidth < el\.scrollWidth/);
    expect(scroller).toMatch(/ResizeObserver/);
    expect(scroller).toMatch(/MutationObserver/);
    expect(scroller).toMatch(/aria-label="Scroll pinned pages right"/);
    expect(scroller).toMatch(/aria-label="Scroll pinned pages left"/);
    // the fades never swallow the pins' own clicks and drags
    expect(scroller).toMatch(/pointer-events-none absolute inset-y-0 right-0/);
    expect(scroller).toMatch(/pointer-events-none absolute inset-y-0 left-0/);
  });
});
