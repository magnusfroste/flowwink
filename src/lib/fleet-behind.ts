/**
 * Which instances run old code (2026-11-25).
 *
 * The fleet list under Feedback showed each instance's schema head as a bare
 * number. synclairvision ran 20261110120000 two weeks after the rest had
 * moved on, and kept filing a false "never ran" report the platform had fixed
 * on 11-10; liteit's own deploy stood still too. Nothing said so. A schema
 * head is a timestamp, so how far behind an instance is reads straight off it:
 * days between its head and the newest head among instances seen this week.
 */

export const BEHIND_AFTER_DAYS = 2;

/** `YYYYMMDDHHMMSS` → epoch ms, or null. */
export function migrationHeadTime(head: string | null | undefined): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(head ?? '').trim());
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isFinite(t) ? t : null;
}

export interface FleetRow { instance_id: string; migration_head: string | null; last_seen_at: string }

/** Days each instance's schema is behind the newest one seen in the last 7 days; only those behind by more than BEHIND_AFTER_DAYS. */
export function daysBehind(rows: readonly FleetRow[], now: Date = new Date()): Map<string, number> {
  const weekAgo = now.getTime() - 7 * 86_400_000;
  let newest: number | null = null;
  for (const r of rows) {
    const t = migrationHeadTime(r.migration_head);
    if (t !== null && Date.parse(r.last_seen_at) >= weekAgo && (newest === null || t > newest)) newest = t;
  }
  const out = new Map<string, number>();
  if (newest === null) return out;
  for (const r of rows) {
    const t = migrationHeadTime(r.migration_head);
    if (t === null) continue;
    const days = Math.floor((newest - t) / 86_400_000);
    if (days > BEHIND_AFTER_DAYS) out.set(r.instance_id, days);
  }
  return out;
}
