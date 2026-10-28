import { useMemo } from 'react';
import { useBusinessHome } from '@/hooks/useSiteSettings';
import { FALLBACK_HOME, dateInZone, instantToWallClock, wallClockToInstant } from '../../supabase/functions/_shared/locale/home';
import { businessToday } from '@/lib/platform-fallbacks';

/**
 * The business's calendar and clock, for code that WRITES dates and times —
 * the reading side is usePlatformFormat. Two mistakes this replaces:
 *  - "today" as businessToday(): the UTC day, so a
 *    journal entry or expense made at 00:30 on 1 November in Stockholm was
 *    dated 31 October, in the previous (maybe locked) period;
 *  - a datetime-local value sent raw to a timestamptz column: read as UTC,
 *    shown and reminded 1–2 h late.
 * docs/architecture/locale-and-formatting.md §3b.
 */
export function useBusinessClock() {
  const timeZone = (useBusinessHome().data ?? FALLBACK_HOME).timeZone;
  return useMemo(() => ({
    timeZone,
    /** Today on the business's calendar, YYYY-MM-DD. */
    today: () => dateInZone(timeZone),
    /** A date-only value N days from today on the business's calendar. */
    daysFromToday: (n: number) => {
      const [y, m, d] = dateInZone(timeZone).split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
    },
    /** datetime-local value (business clock) → ISO instant for a timestamptz column. */
    toInstant: (local: string | null | undefined) => wallClockToInstant(local, timeZone),
    /** ISO instant → datetime-local value on the business clock (for editing). */
    toWallClock: (ts: string | Date | null | undefined) => instantToWallClock(ts, timeZone),
  }), [timeZone]);
}
