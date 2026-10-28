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

describe('money is hundredths in every currency; Stripe gets its own unit (§3b)', async () => {
  const { toStripeAmount, fromStripeAmount, dateInZone } = await import('../../../supabase/functions/_shared/locale/home');
  const us = resolveHome({ platform_locale: { default_locale: 'en-US', default_currency: 'USD' } });

  it('1 000 JPY is stored as 100000 and shown as ¥1,000 — not ¥100,000', () => {
    expect(homeFormat(us).money(100000, 'JPY')).toBe('¥1,000');
    expect(homeFormat(us).money(123450, 'USD')).toBe('$1,234.50');
  });

  it('Stripe: zero-decimal currencies in whole units; ISK stays two-decimal, as Stripe says', () => {
    expect(toStripeAmount(100000, 'JPY')).toBe(1000);
    expect(fromStripeAmount(1000, 'jpy')).toBe(100000);
    expect(toStripeAmount(50000, 'ISK')).toBe(50000);
    expect(toStripeAmount(123450, 'SEK')).toBe(123450);
  });

  it('"today" is the business\'s date: 00:30 on 1 November in Stockholm is 1 November', () => {
    const at = new Date('2026-10-31T23:30:00Z');
    expect(at.toISOString().slice(0, 10)).toBe('2026-10-31');
    expect(dateInZone('Europe/Stockholm', at)).toBe('2026-11-01');
    expect(dateInZone('Europe/Stockholl', at)).toBe('2026-10-31'); // an invalid zone reads UTC, never throws
  });
});

/**
 * The SQL twin (business_currency / business_timezone / format_business_amount)
 * reads a country table generated from COUNTRY_DEFAULTS. One fact, two
 * runtimes: they must not drift, and the separators must be what Intl writes.
 */
describe('the database knows the same countries as resolveHome', async () => {
  const { COUNTRY_DEFAULTS } = await import('../../../supabase/functions/_shared/locale/home');
  const migDir = join(process.cwd(), 'supabase/migrations');
  const mig = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort()
    .filter((f) => readFileSync(join(migDir, f), 'utf8').includes('FUNCTION public.business_country_defaults')).pop()!;
  const sql = readFileSync(join(migDir, mig), 'utf8');
  const unescape = (lit: string) => lit.startsWith("U&'") ? String.fromCodePoint(parseInt(lit.slice(4, -1), 16)) : lit.slice(1, -1).replace(/''/g, "'");
  const rows = new Map([...sql.matchAll(/\('([A-Z]{2})', '([A-Z]{3})', '([^']+)', (U&'\\[0-9A-F]{4}'|'(?:[^']|'')*'), (U&'\\[0-9A-F]{4}'|'(?:[^']|'')*')\)/g)]
    .map((m) => [m[1], { currency: m[2], timeZone: m[3], group: unescape(m[4]), decimal: unescape(m[5]) }]));

  it('same countries, currencies and zones', () => {
    expect([...rows.keys()].sort()).toEqual(Object.keys(COUNTRY_DEFAULTS).sort());
    for (const [c, d] of Object.entries(COUNTRY_DEFAULTS)) {
      expect(rows.get(c), c).toMatchObject({ currency: d.currency, timeZone: d.timeZone });
    }
  });

  it('separators are the ones Intl writes for the country', () => {
    // ICU versions differ in the glyph, not the kind: CH groups with ’ in one
    // and ' in the next, FR with a no-break or a narrow no-break space. Compare
    // the kind, or the test reports the CI runner's Node instead of drift.
    const kind = (ch: string | undefined) => (ch ?? '')
      .replace(/[\u00a0\u202f\u2009 ]/g, 'space')
      .replace(/[\u2019']/g, 'apostrophe');
    for (const [c, d] of Object.entries(COUNTRY_DEFAULTS)) {
      const parts = new Intl.NumberFormat(`${d.language}-${c}`, { minimumFractionDigits: 2 }).formatToParts(1234567.5);
      expect(kind(rows.get(c)?.group), c).toBe(kind(parts.find((p) => p.type === 'group')?.value));
      expect(kind(rows.get(c)?.decimal), c).toBe(kind(parts.find((p) => p.type === 'decimal')?.value));
    }
  });
});

/**
 * Guard (discover, don't enumerate): a literal SEK where the business's
 * currency belongs wrote crowns into a Norwegian business's rows. Code: the
 * count of SEK fallbacks may only shrink. SQL: no migration after the one
 * that moved currency into the database may carry a 'SEK' literal.
 */
describe('no new literal SEK in place of the business\'s currency', () => {
  const SHAPE = /(\|\||\?\?)\s*['"]SEK['"]|currency\s*(:|=)\s*['"]SEK['"]/g;
  // Today's honest remainder: platform defaults, the country table, SIE (Swedish
  // by definition), three blank forms that are overwritten at open time, and
  // POS's local formatter (step 4d).
  const CEILING = 11;
  const roots = ['src', 'supabase/functions', 'api'].map((r) => join(process.cwd(), r));
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (!/__tests__|data[\\/]templates/.test(p)) walk(p); continue; }
      if (!/\.(ts|tsx)$/.test(p) || /\.test\.|_test\.ts$/.test(p)) continue;
      readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        if (/^\s*(\/\/|\*)/.test(line)) return;
        if (line.match(SHAPE)) hits.push(`${p.slice(process.cwd().length + 1)}:${i + 1}`);
      });
    }
  };
  roots.forEach(walk);

  it(`code: at most ${CEILING}`, () => {
    expect(hits.length, hits.join('\n')).toBeLessThanOrEqual(CEILING);
  });

  it('SQL: no later migration writes a SEK literal', () => {
    const dir = join(process.cwd(), 'supabase/migrations');
    const FLOOR = '20261025040000';
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith('.sql') && f.slice(0, 14) > FLOOR)
      .filter((f) => /'SEK'/.test(readFileSync(join(dir, f), 'utf8').replace(/--[^\n]*/g, '')));
    expect(offenders, 'use public.business_currency() instead').toEqual([]);
  });
});
