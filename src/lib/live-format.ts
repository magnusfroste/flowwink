import { makePlatformFormat, type PlatformFormat } from '@/hooks/usePlatformFormat';
import { FALLBACK_HOME, homeFormat, type Home } from '../../supabase/functions/_shared/locale/home';

/**
 * The admin formatter for code outside a component — a module-level helper a
 * list calls per row. Same rules as usePlatformFormat; the business's home is
 * the one <DateFnsLocaleSync /> last read (the platform fallback before the
 * settings load). Those helpers wrote 'en-US', 'sv-SE' or the browser's locale
 * and zone (2026-10-26).
 */
let liveHome: Home = FALLBACK_HOME;
export function setLiveHome(home: Home | null | undefined): void {
  if (home) liveHome = home;
}
export function liveFormat(): PlatformFormat {
  return makePlatformFormat({
    default_locale: liveHome.locale,
    default_currency: liveHome.currency,
    default_timezone: liveHome.timeZone,
    amount_decimals: liveHome.amountDecimals,
  });
}

/** A customer-facing amount outside a component (an e-mail preview): exact, the business's way. */
export function liveCustomerMoney(cents: number | null | undefined, currency?: string | null): string {
  return homeFormat(liveHome, 'en').money(cents, currency);
}
