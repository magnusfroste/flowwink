import { describe, it, expect } from 'vitest';
import { movePin, sameSet, type PinnedPage } from '../usePinnedPages';

const pin = (href: string): PinnedPage => ({ href, name: href, icon: 'FileText' });
const pins = ['/admin/pages', '/admin/leads', '/admin/quotes', '/admin/invoices'].map(pin);

describe('header pins reorder by drag — order is the array', () => {
  it('moves an item forward and backward without losing any', () => {
    expect(movePin(pins, 0, 2).map((p) => p.href)).toEqual(['/admin/leads', '/admin/quotes', '/admin/pages', '/admin/invoices']);
    expect(movePin(pins, 3, 0).map((p) => p.href)).toEqual(['/admin/invoices', '/admin/pages', '/admin/leads', '/admin/quotes']);
  });
  it('is a no-op for the same spot or an index off the list', () => {
    expect(movePin(pins, 1, 1)).toBe(pins);
    expect(movePin(pins, -1, 2)).toBe(pins);
    expect(movePin(pins, 1, 9)).toBe(pins);
  });
  it('a reorder may never add or drop a pin — a stale drag after an unpin is refused', () => {
    expect(sameSet(pins, movePin(pins, 0, 3))).toBe(true);
    expect(sameSet(pins, pins.slice(1))).toBe(false);
    expect(sameSet(pins, [...pins.slice(1), pin('/admin/other')])).toBe(false);
  });
});
