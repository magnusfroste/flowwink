import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolveHome, formatLocale, homeFormat, FALLBACK_HOME,
} from '../../../supabase/functions/_shared/locale/home';

const nbsp = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

describe('resolveHome — the business\'s home, from the settings that exist today', () => {
  it('nothing set: the platform fallback', () => {
    expect(resolveHome({})).toEqual(FALLBACK_HOME);
  });

  it('the Locale & formatting card wins', () => {
    const h = resolveHome({
      platform_locale: { default_locale: 'sv-SE', default_currency: 'SEK', default_timezone: 'Europe/Stockholm', amount_decimals: 0 },
      general: { country: 'NO' },
      accounting_preferences: { currency: 'EUR' },
    });
    expect(h).toEqual({ country: 'NO', locale: 'sv-SE', currency: 'SEK', timeZone: 'Europe/Stockholm', amountDecimals: 0 });
  });

  it('a typo in the free-text time zone falls back instead of breaking every mail', () => {
    const h = resolveHome({ platform_locale: { default_timezone: 'Europe/Stockholl' }, general: { country: 'NO' } });
    expect(h.timeZone).toBe('Europe/Oslo');
    expect(resolveHome({ platform_locale: { default_timezone: 'Europe/Stockholl' } }).timeZone).toBe('Europe/Stockholm');
  });

  it('only a country (LiteIT today): its currency, its clock, the site language in its region', () => {
    const h = resolveHome({ general: { country: 'DE' }, site_languages: { default: 'en', enabled: ['en'] } });
    expect(h).toMatchObject({ country: 'DE', locale: 'en-DE', currency: 'EUR', timeZone: 'Europe/Berlin' });
  });

  it('the old accounting currency still counts when the card says nothing', () => {
    expect(resolveHome({ accounting_preferences: { currency: 'nok' } }).currency).toBe('NOK');
  });

  it('a junk currency is not a currency', () => {
    expect(resolveHome({ platform_locale: { default_currency: 'KRONOR' } }).currency).toBe('SEK');
  });
});

describe('formatLocale — the reader\'s language, the business\'s region', () => {
  const se = resolveHome({ platform_locale: { default_locale: 'sv-SE' } });
  it('same language: the home locale', () => {
    expect(formatLocale(se, 'sv')).toBe('sv-SE');
    expect(formatLocale(se, null)).toBe('sv-SE');
  });
  it('another language keeps the region', () => {
    expect(formatLocale(se, 'en')).toBe('en-SE');
    expect(formatLocale(se, 'de-AT')).toBe('de-SE');
  });
});

describe('homeFormat — what a mail says', () => {
  const se = resolveHome({ platform_locale: { default_locale: 'sv-SE', default_currency: 'SEK', default_timezone: 'Europe/Stockholm', amount_decimals: 0 } });

  it('a 10:00 Stockholm booking says 10:00, not 08:00 AM (the edge runtime is UTC)', () => {
    const f = homeFormat(se, 'en');
    expect(f.time('2026-07-03T08:00:00Z')).toBe('10:00');
    expect(f.dateTime('2026-07-03T08:00:00Z', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })).toBe('Friday, 3 July 2026');
  });

  it('English words, Swedish money', () => {
    expect(nbsp(homeFormat(se, 'en').money(123450))).toBe('1 234,50 kr');
    expect(nbsp(homeFormat(se, 'sv').money(123450, 'EUR'))).toBe('1 234,50 €');
  });

  it('a customer always gets the exact amount; whole units are the admin\'s reading aid', () => {
    expect(nbsp(homeFormat(se, 'sv').money(123450))).toBe('1 234,50 kr');
    expect(nbsp(homeFormat(se, 'sv', { audience: 'admin' }).money(123450))).toBe('1 235 kr');
  });

  it('a date-only value does not move a day', () => {
    const us = resolveHome({ platform_locale: { default_locale: 'en-US', default_timezone: 'America/Los_Angeles' } });
    expect(homeFormat(us).date('2026-07-03', { year: 'numeric', month: '2-digit', day: '2-digit' })).toBe('07/03/2026');
  });

  it('empty values are empty, not "Invalid Date"', () => {
    const f = homeFormat(se);
    expect(f.date(null)).toBe('');
    expect(f.dateTime('nope')).toBe('');
    expect(f.money(null)).toBe('—');
  });
});

/**
 * Guard (discover, don't enumerate): formatting with a hard-coded locale in
 * edge code is how invoices came out sv-SE and bookings en-US whatever the
 * site said. Every edge file is scanned; the count may only shrink. What
 * remains is zone arithmetic (en-US/en-CA parts with an explicit timeZone)
 * and a few admin/model-facing lines not yet moved — write new ones through
 * _shared/locale/home.ts.
 */
describe('no new hard-coded locale in edge formatting', () => {
  const CEILING = 11;
  const SHAPE = /(toLocale(Date|Time)?String|Intl\.(NumberFormat|DateTimeFormat))\(\s*['"][a-z]{2}(-[A-Z]{2})?['"]/g;
  const root = join(process.cwd(), 'supabase/functions');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.ts') && !/\.test\.ts$|_test\.ts$/.test(p) && !p.endsWith('_shared/locale/home.ts')) files.push(p);
    }
  };
  walk(root);

  it(`at most ${CEILING} sites`, () => {
    const hits = files.flatMap((f) => (readFileSync(f, 'utf8').match(SHAPE) ?? []).map((m) => `${f.slice(root.length + 1)}: ${m}`));
    expect(hits.length, hits.join('\n')).toBeLessThanOrEqual(CEILING);
  });
});
