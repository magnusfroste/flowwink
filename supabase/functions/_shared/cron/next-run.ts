// Cron "next run" calculator — the single source of truth for interpreting a
// 5-field cron expression, shared by the automation dispatcher (scheduling) and
// the cron-health path (staleness detection). Keeping ONE parser is the whole
// point: the July proof-week incidents came from a parser with silent gaps
// ('0 5 1 * *' fell through to +1h → 103 stray runs; '30 6 * * 1-5' parsed as
// Mondays only). A second, drifting copy would reintroduce exactly that risk.

/** Next run time (ISO) for a cron expression, from `from` (default now). */
export function calculateNextRun(cronExpr?: string, from?: Date): string {
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
