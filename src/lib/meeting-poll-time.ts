/**
 * Slot times for meeting polls — in the ORGANIZER's zone, in the READER's language.
 *
 * A poll's times are anchored to the organizer's timezone (the timeslot model:
 * "tidszon på skaparen"): everyone answering sees the same wall-clock times, so
 * `usePlatformFormat().formatDateTime`, which applies the PLATFORM timezone, is
 * the wrong tool here — the poll's zone is data on the row, not a setting.
 *
 * The locale is the caller's to choose: the visitor's language on the public
 * face (`useUiTextLanguage().lang`), the platform locale in admin
 * (`usePlatformFormat().settings.default_locale`). Weekday and month names are
 * language, not format (see visitor-date.ts).
 */

export interface SlotLike {
  starts_at: string;
  duration_min: number;
}

/** The zone if Intl knows it, else UTC — a typo in a timezone must not blank a page. */
export function safeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

export interface SlotFormatter {
  /** The zone actually used (UTC when the poll's zone was unknown). */
  zone: string;
  /** "Tue 6 Oct" */
  day: (iso: string) => string;
  /** "Tue 6 Oct 2026" */
  dayWithYear: (iso: string) => string;
  /** "09:00–10:00" */
  range: (iso: string, minutes: number) => string;
  /** "Tue 6 Oct 2026 · 09:00–10:00" */
  full: (slot: SlotLike) => string;
}

export function makeSlotFormatter(locale: string | undefined, timeZone: string | null | undefined): SlotFormatter {
  const zone = safeTimeZone(timeZone);
  const loc = locale || undefined;
  const day = new Intl.DateTimeFormat(loc, { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short' });
  const dayYear = new Intl.DateTimeFormat(loc, { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const time = new Intl.DateTimeFormat(loc, { timeZone: zone, hour: '2-digit', minute: '2-digit' });
  const range = (iso: string, minutes: number) => {
    const start = new Date(iso);
    const end = new Date(start.getTime() + minutes * 60_000);
    return `${time.format(start)}–${time.format(end)}`;
  };
  return {
    zone,
    day: (iso) => day.format(new Date(iso)),
    dayWithYear: (iso) => dayYear.format(new Date(iso)),
    range,
    full: (slot) => `${dayYear.format(new Date(slot.starts_at))} · ${range(slot.starts_at, slot.duration_min)}`,
  };
}
