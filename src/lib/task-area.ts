/**
 * The task's area — one level of grouping in the project view, derived,
 * never maintained (Peter's backlog, optic, 2026-11-05).
 *
 * The field `project_tasks.area` is the truth when it is set. When it is
 * empty, the title's prefix before " – " (or " — ", " - ", ": ") is the
 * area: Österrunda 1.0 already names its work that way ("DDC 1.0 – Kyla och
 * brandskydd", "Stokab – Korskoppling i noden"), so the view groups without
 * anyone editing 31 tasks. The prefix is never written back — a renamed
 * title moves the task, nothing goes stale. A task with neither sits under
 * OTHER_AREA, never loose and never behind an invented epic.
 *
 * Same rule for the skill and the screen: an agent that passes `area` sets
 * it, one that reads `list` sees the column as it is.
 */
import { DONE_STATUSES } from '@/lib/task-card';

export const OTHER_AREA = 'Other';

/** A prefix longer than this is a sentence, not a label. */
const MAX_PREFIX = 40;
const PREFIX_SEPARATOR = /\s+[–—-]\s+|:\s+/;

export function areaFromTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  const m = PREFIX_SEPARATOR.exec(title);
  if (!m || m.index === 0) return null;
  const prefix = title.slice(0, m.index).trim();
  if (!prefix || prefix.length > MAX_PREFIX || /\n/.test(prefix)) return null;
  return prefix;
}

export function taskArea(task: { area?: string | null; title?: string | null }): string | null {
  const explicit = (task.area ?? '').trim();
  if (explicit) return explicit;
  return areaFromTitle(task.title);
}

export interface AreaSection<T> {
  /** The area's name, or OTHER_AREA. */
  name: string;
  /** True for the section that holds tasks without an area. */
  other: boolean;
  /** Top-level tasks, by sort_order then created_at — status never reorders them. */
  tasks: T[];
  done: number;
  total: number;
}

type AreaTask = {
  id: string;
  title: string;
  area?: string | null;
  status?: string | null;
  completed_at?: string | null;
  parent_task_id?: string | null;
  sort_order?: number | null;
  created_at?: string | null;
};

function isDone(t: { status?: string | null; completed_at?: string | null }): boolean {
  return DONE_STATUSES.has(String(t.status ?? '')) || !!t.completed_at;
}

function byStableOrder<T extends AreaTask>(a: T, b: T): number {
  const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
  if (so !== 0) return so;
  return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
}

/**
 * Sections in the order the project's own sequence gives them: an area sits
 * where its first task sits (lowest sort_order), "Other" last. Sub-tasks
 * follow their parent and are not counted — the section counts the work
 * items a person planned, not the pieces of one.
 */
export function groupTasksByArea<T extends AreaTask>(tasks: T[]): AreaSection<T>[] {
  const top = tasks.filter((t) => !t.parent_task_id).sort(byStableOrder);
  const sections = new Map<string, AreaSection<T>>();
  for (const t of top) {
    const area = taskArea(t);
    const key = area ?? OTHER_AREA;
    let s = sections.get(key);
    if (!s) {
      s = { name: key, other: area === null, tasks: [], done: 0, total: 0 };
      sections.set(key, s);
    }
    s.tasks.push(t);
    s.total += 1;
    if (isDone(t)) s.done += 1;
  }
  const list = [...sections.values()];
  const named = list.filter((s) => !s.other);
  const other = list.filter((s) => s.other);
  return [...named, ...other];
}

/** The areas a project already uses — what the edit field suggests. */
export function knownAreas(tasks: Array<{ area?: string | null; title?: string | null }>): string[] {
  const seen = new Set<string>();
  for (const t of tasks) {
    const a = taskArea(t);
    if (a) seen.add(a);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}
