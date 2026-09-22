/**
 * "What changed since last Tuesday?" — the window a status meeting reads.
 *
 * The digest itself comes from the database (project_changes: the task
 * ledger every writer feeds). This file owns the part that is the viewer's:
 * which "since" they mean, remembered per browser like the sort choice.
 */

export type SincePreset =
  | 'yesterday' | '7d' | '14d' | '30d'
  | 'weekday:1' | 'weekday:2' | 'weekday:3' | 'weekday:4' | 'weekday:5';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const SINCE_PRESETS: { value: SincePreset; label: string }[] = [
  { value: 'yesterday', label: 'Since yesterday' },
  { value: 'weekday:1', label: 'Since last Monday' },
  { value: 'weekday:2', label: 'Since last Tuesday' },
  { value: 'weekday:3', label: 'Since last Wednesday' },
  { value: 'weekday:4', label: 'Since last Thursday' },
  { value: 'weekday:5', label: 'Since last Friday' },
  { value: '7d', label: 'Last 7 days' },
  { value: '14d', label: 'Last 14 days' },
  { value: '30d', label: 'Last 30 days' },
];

const SINCE_KEY = 'flowwink.projects.since';
const DEFAULT_PRESET: SincePreset = '7d';

/** Local midnight of the day `daysBack` days before `now`. */
function midnightDaysBack(now: Date, daysBack: number): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - daysBack);
  return d;
}

/**
 * The most recent `weekday` (0 = Sunday … 6 = Saturday) strictly before today,
 * at local midnight. On a Tuesday, "since last Tuesday" is a week ago — the
 * meeting that just started is not the one being reported on.
 */
export function lastWeekday(weekday: number, now: Date): Date {
  const back = ((now.getDay() - weekday + 7) % 7) || 7;
  return midnightDaysBack(now, back);
}

export function sinceFor(preset: SincePreset, now: Date = new Date()): Date {
  switch (preset) {
    case 'yesterday': return midnightDaysBack(now, 1);
    case '7d': return midnightDaysBack(now, 7);
    case '14d': return midnightDaysBack(now, 14);
    case '30d': return midnightDaysBack(now, 30);
    default: return lastWeekday(Number(preset.slice('weekday:'.length)), now);
  }
}

export function weekdayName(weekday: number): string {
  return WEEKDAY_NAMES[weekday] ?? '';
}

export function readSincePreset(): SincePreset {
  try {
    const v = localStorage.getItem(SINCE_KEY);
    return SINCE_PRESETS.some((p) => p.value === v) ? (v as SincePreset) : DEFAULT_PRESET;
  } catch {
    return DEFAULT_PRESET;
  }
}

export function writeSincePreset(preset: SincePreset): void {
  try { localStorage.setItem(SINCE_KEY, preset); } catch { /* private mode: the choice just does not stick */ }
}

// ── The digest, as project_changes returns it ─────────────────────────────

export type ChangeEntry = { task_id?: string | null; title?: string | null; at: string; by: string; from?: string | null; to?: string | null; was?: string | null; change?: string; on?: string; name?: string };
export type ChangeComment = { task_id: string | null; title: string | null; kind: 'comment' | 'step' | 'question' | 'decision'; author_type: 'person' | 'flowpilot' | 'agent'; author: string; body: string; at: string };
export type ProjectChangeCounts = {
  created: number; completed: number; reopened: number; moved: number; reprioritised: number; reassigned: number;
  rescheduled: number; renamed: number; progressed: number; deleted: number; dependencies: number; milestones: number;
  comments: number; hours: number;
};
export type ProjectChanges = {
  project_id: string; name: string; sort_order: number | null; is_active: boolean | null;
  history_from: string; coverage: 'full' | 'partial';
  counts: ProjectChangeCounts;
  created: ChangeEntry[]; completed: ChangeEntry[]; reopened: ChangeEntry[]; moved: ChangeEntry[];
  reprioritised: ChangeEntry[]; reassigned: ChangeEntry[]; rescheduled: ChangeEntry[]; renamed: ChangeEntry[];
  progressed: ChangeEntry[]; deleted: ChangeEntry[]; dependencies: ChangeEntry[]; milestones: ChangeEntry[];
  comments: ChangeComment[];
  hours: { total: number; by_person: { name: string; hours: number }[] };
};
export type ChangesDigest = {
  success: boolean; since: string; until: string; ledger_started_at: string | null;
  projects: ProjectChanges[]; quiet: { project_id: string; name: string }[]; note: string;
};

/** One line for a project: "2 completed · 1 moved · 3 comments", nothing for a quiet one. */
export function countsLabel(c: ProjectChangeCounts): string {
  const parts: string[] = [];
  const say = (n: number, word: string) => { if (n) parts.push(`${n} ${word}`); };
  say(c.completed, 'completed');
  say(c.created, 'created');
  say(c.reopened, 'reopened');
  say(c.moved, 'moved');
  say(c.reprioritised, 'reprioritised');
  say(c.reassigned, 'reassigned');
  say(c.rescheduled, 'rescheduled');
  say(c.deleted, 'deleted');
  say(c.dependencies, 'dependencies');
  say(c.milestones, 'milestones');
  say(c.comments, 'comments');
  if (c.hours) parts.push(`${c.hours} h logged`);
  return parts.join(' · ');
}
