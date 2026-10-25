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
  });
  it('never a tag the runtime only pretends to have (it would write US numbers)', () => {
    // de-SE is "supported" but resolves to de; Chrome resolves en-NO to en.
    for (const lang of ['de', 'fr', 'en', 'nb']) {
      const tag = formatLocale(resolveHome({ general: { country: 'NO' } }), lang);
      const resolved = new Intl.NumberFormat(tag).resolvedOptions().locale;
      expect(resolved, `${lang} → ${tag}`).toBe(tag);
    }
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

describe('set_business_home / get_business_home — the agent writes what the card writes', async () => {
  const { handleSetBusinessHome, handleGetBusinessHome, suggestTimeZones } = await import('../../../supabase/functions/_shared/handlers/business-home');

  function fakeDb(initial: Record<string, unknown>) {
    const store: Record<string, unknown> = { ...initial };
    const writes: Array<{ key: string; value: unknown }> = [];
    const db = {
      from: () => ({
        select: () => ({
          in: async (_col: string, keys: string[]) => ({
            data: keys.filter((k) => k in store).map((k) => ({ key: k, value: store[k] })),
            error: null,
          }),
        }),
        upsert: async (rows: Array<{ key: string; value: unknown }>) => {
          for (const r of rows) { store[r.key] = r.value; writes.push(r); }
          return { error: null };
        },
      }),
    };
    // deno-style client type; the handler only calls these three methods.
    return { db: db as unknown as Parameters<typeof handleGetBusinessHome>[0], store, writes };
  }

  it('a mistyped zone is refused with the real one suggested, and nothing is written', async () => {
    const { db, writes } = fakeDb({ general: { country: 'SE' } });
    const r = await handleSetBusinessHome(db, { time_zone: 'Europe/Stockholl' });
    expect(r.success).toBe(false);
    expect(String(r.error)).toContain('"Europe/Stockholm"');
    expect(writes).toEqual([]);
    expect(suggestTimeZones('europe/oslo')[0]).toBe('Europe/Oslo');
  });

  it('a new country brings its currency and clock; general keeps its other fields; no stored locale', async () => {
    const { db, store } = fakeDb({
      general: { country: 'SE', siteUrl: 'https://x.example' },
      platform_locale: { default_locale: 'sv-SE', default_currency: 'SEK', default_timezone: 'Europe/Stockholm', amount_decimals: 0 },
      site_languages: { default: 'en', enabled: ['en'] },
    });
    const r = await handleSetBusinessHome(db, { country: 'no' });
    expect(r.success).toBe(true);
    expect(store.general).toEqual({ country: 'NO', siteUrl: 'https://x.example' });
    expect(store.platform_locale).toEqual({ default_currency: 'NOK', default_timezone: 'Europe/Oslo', amount_decimals: 0 });
    expect((r.home as Record<string, unknown>).format_locale).toBe('en-NO');
    expect((r.sources as Record<string, unknown>).locale).toBe('site language + country');
  });

  it('an explicit currency beats the country\'s', async () => {
    const { db, store } = fakeDb({ general: { country: 'SE' } });
    await handleSetBusinessHome(db, { country: 'DE', currency: 'sek' });
    expect(store.platform_locale).toMatchObject({ default_currency: 'SEK', default_timezone: 'Europe/Berlin' });
  });

  it('get reports where each value came from', async () => {
    const { db } = fakeDb({ general: { country: 'SE' }, accounting_preferences: { currency: 'EUR' } });
    const r = await handleGetBusinessHome(db);
    expect(r.sources).toEqual({ country: 'general.country', locale: 'site language + country', currency: 'accounting_preferences.currency', timeZone: 'country' });
  });
});
