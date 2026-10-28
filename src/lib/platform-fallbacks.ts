/**
 * The platform-wide LAST-RESORT formatting fallbacks.
 *
 * These mirror the defaults in usePlatformLocaleSettings — the values that
 * apply when site_settings.platform_locale has not been configured. They exist
 * so plain functions (email templates, Slack notifications, exports) that
 * cannot call hooks still fall back to the SAME convention as the rest of the
 * platform, instead of each inventing its own.
 *
 * The class this replaces: a dozen scattered `|| 'USD'` fallbacks that let a
 * Swedish instance give birth to dollar rows. Deals showed US$ against a
 * site-wide SEK setting because a client-side `|| 'USD'` overrode the
 * database's own SEK column default at insert.
 *
 * Rules:
 * - When WRITING a row: omit the currency field entirely when the user made no
 *   choice — every money table has a per-instance column default, and the
 *   database is the authority on the instance's currency. Do not import these
 *   constants into insert payloads.
 * - When FORMATTING for display: prefer usePlatformFormat (it reads the actual
 *   setting). Reach for these constants only where hooks cannot go.
 */
import { dateInZone } from '../../supabase/functions/_shared/locale/home';

export const FALLBACK_LOCALE = 'sv-SE';
export const FALLBACK_CURRENCY = 'SEK';
export const FALLBACK_TIMEZONE = 'Europe/Stockholm';

/**
 * The business's currency as last read — for a form's initial value, which is
 * built outside React's data flow (a blank editor state, a reset). Kept in
 * step with useBusinessHome by <DateFnsLocaleSync /> at the app root; before
 * the settings load it is the platform fallback. A write that has no currency
 * from the user should OMIT the field instead: the column default is the
 * business's (locale-and-formatting.md §3b).
 */
let liveHomeCurrency: string = FALLBACK_CURRENCY;
export function homeCurrency(): string {
  return liveHomeCurrency;
}
export function setHomeCurrency(code: string | null | undefined): void {
  if (code) liveHomeCurrency = code;
}

/**
 * Today on the business's calendar (YYYY-MM-DD), for a document's default
 * date outside React's data flow (a blank form, a mutation's fallback). The
 * zone is kept in step with useBusinessHome by <DateFnsLocaleSync />.
 * new Date().toISOString().slice(0, 10) is the UTC day: at 00:30 on
 * 1 November in Stockholm it said 31 October, and a journal entry, expense or
 * purchase order defaulted into the previous — maybe locked — period.
 */
let liveHomeTimeZone: string = FALLBACK_TIMEZONE;
export function setHomeTimeZone(tz: string | null | undefined): void {
  if (tz) liveHomeTimeZone = tz;
}
export function businessToday(): string {
  return dateInZone(liveHomeTimeZone);
}

/** The business's zone as last read (see setHomeTimeZone) — for module-level helpers. */
export function homeTimeZone(): string {
  return liveHomeTimeZone;
}
