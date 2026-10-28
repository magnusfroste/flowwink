import { useEffect } from 'react';
import { useBusinessHome } from '@/hooks/useSiteSettings';
import { applyDateFnsLocale } from '@/lib/date-fns-locale';
import { setHomeCurrency, setHomeTimeZone } from '@/lib/platform-fallbacks';
import { setLiveHome } from '@/lib/live-format';

/**
 * Renders nothing; syncs date-fns' default locale to the platform setting.
 *
 * Mounted once at the app root so relative time ("3 dagar sedan") matches the
 * absolute dates that `usePlatformFormat()` renders. Without it the two would
 * disagree on the same screen — a localized date next to an English "3 days ago".
 *
 * Sets the locale on every settings change, and once on mount before the
 * settings resolve, so the very first paint is not English on a Swedish
 * instance (the hook's default is sv-SE).
 */
export function DateFnsLocaleSync() {
  // The same locale usePlatformFormat writes with — and the home currency for
  // forms' initial values (homeCurrency() in platform-fallbacks).
  const home = useBusinessHome().data;
  const locale = home?.locale;
  setHomeCurrency(home?.currency);
  setHomeTimeZone(home?.timeZone);
  setLiveHome(home);

  useEffect(() => {
    applyDateFnsLocale(locale);
  }, [locale]);

  return null;
}
