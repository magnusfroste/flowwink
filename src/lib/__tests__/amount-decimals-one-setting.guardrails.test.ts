/**
 * One decimals setting for every amount. The accounting module had its own
 * (accounting_preferences.decimals) that nothing else read, so a site set to
 * whole kronor still showed öre in deals, quotes and invoices (nordbrygg,
 * 2026-10-25, during a demo recording of the deals view).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { amountDecimalsDefault } from '@/hooks/usePlatformFormat';

describe('amountDecimalsDefault', () => {
  it('auto (or unset) leaves the call site and the currency in charge', () => {
    expect(amountDecimalsDefault('auto')).toEqual({});
    expect(amountDecimalsDefault(undefined, { minimumFractionDigits: 0 })).toEqual({ minimumFractionDigits: 0 });
  });
  it('0 and 2 fill both bounds when the call site set neither', () => {
    expect(amountDecimalsDefault(0)).toEqual({ minimumFractionDigits: 0, maximumFractionDigits: 0 });
    expect(amountDecimalsDefault(2)).toEqual({ minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });
  it('the deal page passes "min 0" — the setting still caps the maximum (whole kronor)', () => {
    expect(amountDecimalsDefault(0, { minimumFractionDigits: 0 })).toEqual({ minimumFractionDigits: 0, maximumFractionDigits: 0 });
  });
  it('a call site that chose its maximum keeps it, and min never exceeds max (Intl would throw)', () => {
    expect(amountDecimalsDefault(2, { maximumFractionDigits: 0 })).toEqual({ minimumFractionDigits: 0, maximumFractionDigits: 0 });
  });
  it('Intl accepts every result', () => {
    for (const setting of ['auto', 0, 2, undefined] as const) {
      for (const opts of [undefined, { minimumFractionDigits: 0 }, { maximumFractionDigits: 0 }, { minimumFractionDigits: 0, maximumFractionDigits: 0 }]) {
        expect(() => new Intl.NumberFormat('sv-SE', { ...amountDecimalsDefault(setting, opts), style: 'currency', currency: 'SEK' }).format(1234.5)).not.toThrow();
      }
    }
  });
});

describe('the formatter and the settings page use it', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
  it('formatCurrency spreads the setting under the caller options and memoises on it', () => {
    const src = read('src/hooks/usePlatformFormat.ts');
    expect(src).toMatch(/\.\.\.shown,\s*style: 'currency'/);
    expect(src).toContain('amountDecimalsDefault(s.amount_decimals, options)');
    expect(src).toContain('s.amount_decimals]');
  });
  it('Site settings offers the choice next to currency and time zone', () => {
    expect(read('src/pages/admin/SiteSettingsPage.tsx')).toContain('home-amount-decimals');
  });
  it('the accounting tabs read the same setting, not accounting_preferences separators (locale-and-formatting.md)', () => {
    const dir = 'src/components/admin/accounting';
    for (const f of readdirSync(join(process.cwd(), dir)).filter((n) => n.endsWith('.tsx'))) {
      const src = read(`${dir}/${f}`);
      expect(src, f).not.toMatch(/decimalSeparator|thousandsSeparator|prefs\?\.decimals/);
    }
  });
});

describe('the deals page formats through the site formatter', () => {
  it('no legacy formatPrice on the deals page (it cannot read the setting)', () => {
    const src = readFileSync(join(process.cwd(), 'src/pages/admin/DealsPage.tsx'), 'utf8');
    expect(src).not.toMatch(/formatPrice\(/);
    expect(src).toMatch(/formatCurrency\(stats\.totalPipeline\)/);
  });
});
