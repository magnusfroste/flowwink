// Cron "next run" calculator — the single source of truth for interpreting a
// 5-field cron expression, shared by the automation dispatcher (scheduling) and
// the cron-health path (staleness detection). Keeping ONE parser is the whole
// point: the July proof-week incidents came from a parser with silent gaps
// ('0 5 1 * *' fell through to +1h → 103 stray runs; '30 6 * * 1-5' parsed as
// Mondays only). A second, drifting copy would reintroduce exactly that risk.

/**
 * Read the cron expression out of an automation's trigger_config.
 *
 * Three writer generations left three key names in the fleet: `expression`,
 * `cron`, and `schedule`. The dispatcher used to read only the first two —
 * a schedule-keyed weekly digest fell through to calculateNextRun(undefined)
 * and its +1h fallback, firing HOURLY for 15 days (observability audit
 * 2026-08-28). Accept all three (Law 4: fail forward); return undefined when
 * none holds a non-blank string, so callers can gate loudly instead of
 * inheriting the fallback.
 */
export function readCronExpression(triggerConfig: unknown): string | undefined {
  const tc = triggerConfig as Record<string, unknown> | null | undefined;
  for (const key of ["expression", "cron", "schedule"]) {
    const v = tc?.[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

/**
 * The clock an automation's cron is read on: its own `trigger_config.timezone`
 * when it names one, else the business's. An automation made in the admin
 * never carried a zone and ran on UTC — "0 8 * * 1-5" fired at 09:00/10:00 in
 * Stockholm.
 */
export function readCronTimeZone(triggerConfig: unknown, businessTimeZone: string): string {
  const tz = (triggerConfig as Record<string, unknown> | null | undefined)?.timezone;
  return typeof tz === "string" && tz.trim() ? tz.trim() : businessTimeZone;
}

/**
 * Next run time (ISO) for a cron expression, from `from` (default now).
 *
 * `timeZone` (IANA) is the clock the expression's hours and days are read on —
 * the automation's own `trigger_config.timezone`, else the business's. Without
 * it (or with 'UTC') the expression is UTC, as it always was. A user's
 * "0 8 * * 1-5" on a Stockholm business used to fire at 09:00 or 10:00 local.
 */
export function calculateNextRun(cronExpr?: string, from?: Date, timeZone?: string): string {
  if (!cronExpr) {
    return new Date(Date.now() + 60 * 60 * 1000).toISOString();
  }

  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 5) {
    return new Date(Date.now() + 60 * 60 * 1000).toISOString();
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const now = from || new Date();

  // Every N minutes: */N * * * *
  if (minute.startsWith("*/") && hour === "*") {
    const interval = parseInt(minute.replace("*/", ""), 10) || 5;
    return new Date(now.getTime() + interval * 60 * 1000).toISOString();
  }

  // Every N hours: 0 */N * * *
  if (hour.startsWith("*/")) {
    const interval = parseInt(hour.replace("*/", ""), 10) || 1;
    return new Date(now.getTime() + interval * 60 * 60 * 1000).toISOString();
  }

  if (timeZone && timeZone !== "UTC" && !minute.includes("*") && !hour.includes("*") && month === "*") {
    const zoned = zonedNextRun(parseInt(minute, 10), parseInt(hour, 10), dayOfMonth, dayOfWeek, now, timeZone);
    if (zoned) return zoned;
  }

  // Daily at specific time: M H * * *
  if (
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*" &&
    !minute.includes("*") &&
    !hour.includes("*")
  ) {
    const nextDate = new Date(now);
    nextDate.setUTCHours(parseInt(hour, 10), parseInt(minute, 10), 0, 0);
    if (nextDate <= now) nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    return nextDate.toISOString();
  }

  // Weekly: M H * * D — D may be a single day, a range ('1-5') or a list
  // ('1,3,5'). parseInt('1-5') silently gave 1 (= Mondays only) on a live
  // instance, skipping Tue–Fri — parse the full set.
  if (
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek !== "*" &&
    !minute.includes("*") &&
    !hour.includes("*")
  ) {
    const dowSet = parseDayOfWeekSet(dayOfWeek);
    if (dowSet.size > 0) {
      for (let offset = 0; offset <= 7; offset++) {
        const cand = new Date(now);
        cand.setUTCDate(cand.getUTCDate() + offset);
        cand.setUTCHours(parseInt(hour, 10), parseInt(minute, 10), 0, 0);
        if (cand > now && dowSet.has(cand.getUTCDay())) return cand.toISOString();
      }
    }
  }

  // Monthly: M H DOM * * (e.g. '0 5 1 * *'). Previously fell through to the
  // hourly fallback — a month-end billing run fired 24×/day on a live instance.
  if (
    /^\d+$/.test(dayOfMonth) &&
    month === "*" &&
    dayOfWeek === "*" &&
    !minute.includes("*") &&
    !hour.includes("*")
  ) {
    const dom = parseInt(dayOfMonth, 10);
    for (let k = 0; k < 24; k++) {
      const cand = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth() + k, dom,
        parseInt(hour, 10), parseInt(minute, 10), 0, 0,
      ));
      if (cand > now && cand.getUTCDate() === dom) return cand.toISOString();
    }
  }

  // Fallback: 1 hour — for expressions this parser doesn't understand. Log it:
  // a silent hourly fallback burned 100+ runs of a monthly automation before
  // anyone noticed. If this shows up in logs, extend the parser.
  console.warn(`calculateNextRun: unsupported cron "${cronExpr}" — falling back to +1h`);
  return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
}

/** Parse a cron day-of-week field into the set of matching JS getUTCDay() values. */
export function parseDayOfWeekSet(field: string): Set<number> {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const range = part.trim().match(/^(\d+)-(\d+)$/);
    if (range) {
      const lo = parseInt(range[1], 10), hi = parseInt(range[2], 10);
      for (let d = lo; d <= hi; d++) out.add(d % 7);
    } else if (/^\d+$/.test(part.trim())) {
      out.add(parseInt(part.trim(), 10) % 7);
    }
  }
  return out;
}

/** Whether this parser has an explicit branch for the expression (vs +1h fallback). */
export function isSupportedCron(cronExpr?: string): boolean {
  if (!cronExpr) return false;
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 5) return false;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  if (minute.startsWith("*/") && hour === "*") return true;
  if (hour.startsWith("*/")) return true;
  const fixedMH = !minute.includes("*") && !hour.includes("*");
  if (dayOfMonth === "*" && month === "*" && dayOfWeek === "*" && fixedMH) return true;
  if (dayOfMonth === "*" && month === "*" && dayOfWeek !== "*" && fixedMH &&
      parseDayOfWeekSet(dayOfWeek).size > 0) return true;
  if (/^\d+$/.test(dayOfMonth) && month === "*" && dayOfWeek === "*" && fixedMH) return true;
  return false;
}

/** Y-M-D of an instant on a zone's calendar (en-CA writes ISO order). */
function zonedYmd(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** The instant a zone's wall clock shows `ymd hh:mm` — the offset of that very day, so DST is honoured. */
function zonedInstant(ymd: string, hh: number, mm: number, timeZone: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const shown = (t: number) => {
    const p = new Intl.DateTimeFormat("en-GB", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(t));
    const g = (k: string) => Number(p.find((x) => x.type === k)?.value ?? 0);
    return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"));
  };
  let t = guess - (shown(guess) - guess);
  t = guess - (shown(t) - t); // second pass settles a DST edge
  return new Date(t);
}

/**
 * The fixed-time branches (daily / weekly / monthly) on a zone's clock. Returns
 * null for an unsupported shape (the caller falls back to the UTC branches) or
 * an invalid zone.
 */
function zonedNextRun(minute: number, hour: number, dayOfMonth: string, dayOfWeek: string, now: Date, timeZone: string): string | null {
  let today: string;
  try { today = zonedYmd(now, timeZone); } catch { return null; }
  const [ty, tm, td] = today.split("-").map(Number);
  const dayAt = (offset: number) => new Date(Date.UTC(ty, tm - 1, td + offset)).toISOString().slice(0, 10);

  if (dayOfMonth === "*") {
    const dowSet = dayOfWeek === "*" ? null : parseDayOfWeekSet(dayOfWeek);
    if (dowSet && dowSet.size === 0) return null;
    for (let offset = 0; offset <= 8; offset++) {
      const ymd = dayAt(offset);
      if (dowSet && !dowSet.has(new Date(`${ymd}T00:00:00Z`).getUTCDay())) continue;
      const at = zonedInstant(ymd, hour, minute, timeZone);
      if (at > now) return at.toISOString();
    }
    return null;
  }
  if (/^\d+$/.test(dayOfMonth) && dayOfWeek === "*") {
    const dom = parseInt(dayOfMonth, 10);
    for (let k = 0; k < 24; k++) {
      const first = new Date(Date.UTC(ty, tm - 1 + k, 1));
      const cand = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), dom));
      if (cand.getUTCDate() !== dom) continue;
      const at = zonedInstant(cand.toISOString().slice(0, 10), hour, minute, timeZone);
      if (at > now) return at.toISOString();
    }
  }
  return null;
}
