import { differenceInDays } from 'date-fns';

/**
 * Active, but silent for this long: a key nobody uses is a key nobody misses
 * when it leaks. The Agents table flags these; fleet:status counts them per
 * instance with the same threshold.
 */
export const IDLE_AFTER_DAYS = 30;

export interface IdleCandidate {
  status: string;
  last_used_at: string | null;
  last_seen_at: string | null;
  created_at: string;
}

/** Days since the agent last did anything, when that is 30+ and it is still active; otherwise null. */
export function idleDays(a: IdleCandidate, now = new Date()): number | null {
  if (a.status !== 'active') return null;
  const t = a.last_used_at ?? a.last_seen_at ?? a.created_at;
  const d = differenceInDays(now, new Date(t));
  return d >= IDLE_AFTER_DAYS ? d : null;
}
