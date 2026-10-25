/**
 * get_business_home / set_business_home — the agent's half of the "Where the
 * business is" card: the same three facts (country, currency, time zone) and
 * the one admin display preference, validated against Intl so an agent cannot
 * save "Europe/Stockholl" any more than the card can.
 *
 * Writes exactly what the card writes: `general.country` (merged — every other
 * general field survives) and `platform_locale` WITHOUT a stored format locale,
 * so the locale follows the site's language and the country.
 * docs/architecture/locale-and-formatting.md.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  COUNTRY_DEFAULTS, HOME_SETTING_KEYS, homeFormat, isCurrency, isTimeZone, resolveHomeWithSources,
  type AmountDecimals, type HomeSettingRows,
} from '../locale/home.ts';

export interface SetBusinessHomeArgs {
  country?: string;
  currency?: string;
  time_zone?: string;
  amount_decimals?: AmountDecimals | '0' | '2';
}

async function readRows(supabase: SupabaseClient): Promise<{ rows: HomeSettingRows; error?: string }> {
  const { data, error } = await supabase.from('site_settings').select('key, value').in('key', [...HOME_SETTING_KEYS]);
  const rows: HomeSettingRows = {};
  for (const r of (data ?? []) as Array<{ key: string; value: unknown }>) (rows as Record<string, unknown>)[r.key] = r.value;
  return { rows, error: error?.message };
}

function describe(rows: HomeSettingRows) {
  const { home, sources } = resolveHomeWithSources(rows);
  const now = new Date();
  const admin = homeFormat(home, null, { audience: 'admin' });
  const mail = homeFormat(home, 'en');
  return {
    home: {
      country: home.country,
      currency: home.currency,
      time_zone: home.timeZone,
      format_locale: home.locale,
      amount_decimals: home.amountDecimals,
    },
    sources,
    examples: {
      admin: { locale: admin.locale, amount: admin.money(123450), date: admin.date('2026-07-08'), now: admin.dateTime(now) },
      english_email: { locale: mail.locale, amount: mail.money(123450), now: mail.dateTime(now) },
    },
  };
}

export async function handleGetBusinessHome(supabase: SupabaseClient): Promise<Record<string, unknown>> {
  const { rows, error } = await readRows(supabase);
  if (error) return { success: false, error: `Could not read the settings: ${error}` };
  return { success: true, ...describe(rows) };
}

type IntlWithValues = typeof Intl & { supportedValuesOf?: (key: string) => string[] };

/** The closest real zones to a mistyped one — "Europe/Stockholl" → Europe/Stockholm. */
export function suggestTimeZones(input: string, limit = 3): string[] {
  let all: string[] = [];
  try {
    all = (Intl as IntlWithValues).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    all = [];
  }
  const want = input.trim().toLowerCase();
  const dist = (a: string, b: string) => {
    const m = a.length, n = b.length;
    const row = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      let prev = row[0];
      row[0] = i;
      for (let j = 1; j <= n; j++) {
        const tmp = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return row[n];
  };
  return all
    .map((z) => ({ z, d: dist(want, z.toLowerCase()) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((x) => x.z);
}

function isCountry(code: string): boolean {
  if (!/^[A-Z]{2}$/.test(code)) return false;
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(code);
    return !!name && name !== code;
  } catch {
    return /^[A-Z]{2}$/.test(code);
  }
}

export async function handleSetBusinessHome(supabase: SupabaseClient, args: SetBusinessHomeArgs): Promise<Record<string, unknown>> {
  const { rows, error: readErr } = await readRows(supabase);
  if (readErr) return { success: false, error: `Could not read the settings: ${readErr}` };
  const current = resolveHomeWithSources(rows).home;

  const errors: string[] = [];
  const country = args.country === undefined ? current.country ?? '' : String(args.country).trim().toUpperCase();
  if (country && !isCountry(country)) errors.push(`country "${args.country}" is not an ISO 3166-1 alpha-2 code — e.g. "SE", "NO", "DE", "GB", "US".`);

  // A new country brings its own currency and clock unless the call names them.
  const countryChanged = args.country !== undefined && country !== (current.country ?? '');
  const implied = countryChanged ? COUNTRY_DEFAULTS[country] : undefined;

  const currency = args.currency !== undefined ? String(args.currency).trim().toUpperCase() : implied?.currency ?? current.currency;
  if (!isCurrency(currency)) errors.push(`currency "${args.currency}" is not an ISO 4217 code — e.g. "SEK", "EUR", "USD".`);

  const timeZone = args.time_zone !== undefined ? String(args.time_zone).trim() : implied?.timeZone ?? current.timeZone;
  if (!isTimeZone(timeZone)) {
    const near = suggestTimeZones(timeZone);
    errors.push(`time_zone "${args.time_zone}" is not an IANA zone${near.length ? ` — did you mean ${near.map((z) => `"${z}"`).join(', ')}?` : ' — e.g. "Europe/Stockholm".'}`);
  }

  const rawDecimals = args.amount_decimals;
  const amountDecimals: AmountDecimals | null = rawDecimals === undefined ? current.amountDecimals
    : rawDecimals === 'auto' ? 'auto'
    : Number(rawDecimals) === 0 ? 0
    : Number(rawDecimals) === 2 ? 2
    : null;
  if (amountDecimals === null) errors.push(`amount_decimals must be "auto", 0 or 2.`);

  if (errors.length) return { success: false, error: errors.join(' '), errors };

  const general = { ...((rows.general ?? {}) as Record<string, unknown>), country };
  const platformLocale = { default_currency: currency, default_timezone: timeZone, amount_decimals: amountDecimals };
  const { error: writeErr } = await supabase.from('site_settings').upsert(
    [
      { key: 'general', value: general },
      { key: 'platform_locale', value: platformLocale },
    ],
    { onConflict: 'key' },
  );
  if (writeErr) return { success: false, error: `Could not save: ${writeErr.message}` };

  const after = { ...rows, general, platform_locale: platformLocale };
  return {
    success: true,
    ...describe(after),
    ...(implied ? { note: `Currency and time zone followed the new country (${country}): ${implied.currency}, ${implied.timeZone}. Pass them to choose others.` } : {}),
  };
}
