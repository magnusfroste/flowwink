/**
 * The choices the "Where the business is" card offers — from Intl, so the
 * lists are exactly what the formatter can write. Nothing here is typed by
 * hand, which is the point: a free-text field saved "Europe/Stockholl".
 */
import { COUNTRY_DEFAULTS } from '../../supabase/functions/_shared/locale/home';

type IntlWithValues = typeof Intl & { supportedValuesOf?: (key: string) => string[] };

const FALLBACK_CURRENCIES = ['SEK', 'NOK', 'DKK', 'ISK', 'EUR', 'GBP', 'USD', 'CHF', 'PLN', 'CAD', 'AUD'];

function supported(key: 'timeZone' | 'currency'): string[] {
  try {
    return (Intl as IntlWithValues).supportedValuesOf?.(key) ?? [];
  } catch {
    return [];
  }
}

/** Zones of `country` first (where the browser knows them), then every other. */
export function listTimeZones(country?: string | null): string[] {
  const all = supported('timeZone');
  const own: string[] = [];
  if (country) {
    try {
      const loc = new Intl.Locale(`und-${country}`) as Intl.Locale & { getTimeZones?: () => string[]; timeZones?: string[] };
      own.push(...(loc.getTimeZones?.() ?? loc.timeZones ?? []));
    } catch {
      // An unknown region has no zones of its own; the full list follows.
    }
    const byCountry = COUNTRY_DEFAULTS[country.toUpperCase()]?.timeZone;
    if (byCountry && !own.includes(byCountry)) own.unshift(byCountry);
  }
  const rest = all.filter((z) => !own.includes(z));
  return [...own, ...(rest.length ? rest : ['UTC'])];
}

export function listCurrencies(): Array<{ code: string; name: string }> {
  const codes = supported('currency');
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(['en'], { type: 'currency' });
  } catch {
    names = null;
  }
  return (codes.length ? codes : FALLBACK_CURRENCIES).map((code) => ({ code, name: names?.of(code) ?? code }));
}

/** What choosing a country implies, when the country is one we know. */
export function countryDefaults(country: string | null | undefined): { currency: string; timeZone: string } | null {
  const d = country ? COUNTRY_DEFAULTS[country.toUpperCase()] : undefined;
  return d ? { currency: d.currency, timeZone: d.timeZone } : null;
}
