/**
 * The task card's pure rules — what the UI and the skills both read.
 *
 * A task is a surface, not a row: a brief (description), a checklist of what
 * "done" consists of, dependencies that can block it, and a thread where
 * people and agents write in the same ledger. These helpers derive the two
 * facts the list needs at a glance — progress and blocked — from the data,
 * so a person checking in sees the same state an agent would act on.
 */

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  done_at?: string | null;
  done_by?: string | null;
}

/**
 * The checklist as items, whatever the row holds. The database shapes every
 * write into {id, text, done} (normalize_task_checklist), but a row written
 * before that trigger reached an instance can still hold bare strings — an
 * agent sent ["Fastställ bladstruktur", …] and the card drew 58 blank rows
 * nobody could tick. Read the same way the trigger writes: a string is an
 * unticked item, "[x] …" a ticked one, an empty entry is no item. The id of a
 * string is its position, so ticking it saves a real item in its place.
 */
export function normalizeChecklist(raw: unknown): ChecklistItem[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/\r?\n/) : raw && typeof raw === 'object' ? [raw] : [];
  const seen = new Set<string>();
  const out: ChecklistItem[] = [];
  list.forEach((el, i) => {
    let item: ChecklistItem | null = null;
    if (typeof el === 'string' || typeof el === 'number') {
      const rawText = String(el);
      const text = rawText.replace(/^\s*([-*•]\s*)?(\[[ xX]?\]\s*)?/, '').trim();
      if (text) item = { id: `item-${i}`, text, done: /^\s*([-*•]\s*)?\[[xX]\]/.test(rawText) };
    } else if (el && typeof el === 'object') {
      const o = el as Record<string, unknown>;
      const text = String(o.text ?? o.title ?? o.label ?? o.name ?? '').trim();
      if (text) {
        const done = ['true', 't', 'yes', '1', 'x', 'done'].includes(String(o.done ?? o.checked ?? o.completed ?? 'false').toLowerCase());
        item = { ...(o as Partial<ChecklistItem>), id: String(o.id ?? '').trim() || `item-${i}`, text, done };
      }
    }
    if (!item) return;
    if (seen.has(item.id)) item = { ...item, id: `${item.id}-${i}` };
    seen.add(item.id);
    out.push(item);
  });
  return out;
}

export function checklistProgress(items: unknown): { done: number; total: number } {
  const list = normalizeChecklist(items);
  return { done: list.filter((i) => i.done).length, total: list.length };
}

export function toggleChecklistItem(items: ChecklistItem[], id: string, by?: string | null): ChecklistItem[] {
  return items.map((i) =>
    i.id === id
      ? { ...i, done: !i.done, done_at: !i.done ? new Date().toISOString() : null, done_by: !i.done ? by ?? null : null }
      : i,
  );
}

export function addChecklistItem(items: ChecklistItem[], text: string): ChecklistItem[] {
  const t = text.trim();
  if (!t) return items;
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return [...items, { id, text: t, done: false }];
}

/** Statuses that count as finished for dependency purposes. */
export const DONE_STATUSES = new Set(['done', 'completed', 'closed']);

/**
 * The order a board column reads in: urgent, high, medium, low — the team's
 * own scale (project_priority_guide). Within one priority the manual order
 * (sort_order) holds, so a column is never reshuffled by a refetch. Peter's
 * backlog (optic, 2026-09-24): "highest priority at the top of the column, as
 * on a classic agile board". A task without a priority sits with medium.
 */
export const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function sortByPriority<T extends { priority?: string | null }>(tasks: T[]): T[] {
  const rank = (t: T) => PRIORITY_RANK[t.priority ?? 'medium'] ?? PRIORITY_RANK.medium;
  return tasks
    .map((t, i) => ({ t, i }))
    .sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i)
    .map((x) => x.t);
}

/** Today as YYYY-MM-DD on the viewer's clock — a due date is a calendar day, not a UTC instant. */
export function localDay(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Late = the due date has passed and the task is still open. ONE definition for
 * the board and the list. It says "late", nothing else: blocked (an unfinished
 * dependency) and urgent (the priority) are separate signals with their own
 * marks, and a late task is neither by being late (Peter's backlog, 2026-09-29).
 */
export function isLate(task: { due_date?: string | null; status?: string | null }, today: string = localDay()): boolean {
  if (!task.due_date) return false;
  const status = String(task.status ?? '');
  if (DONE_STATUSES.has(status) || status === 'cancelled') return false;
  return task.due_date.slice(0, 10) < today;
}

/**
 * A task is blocked when any task it depends on is not done. Unknown ids
 * (a dependency on a deleted task) do not block — a ghost must not freeze a
 * board.
 */
export function blockedBy(
  dependsOn: string[] | null | undefined,
  statusById: Map<string, string> | Record<string, string>,
): string[] {
  const get = (id: string) => (statusById instanceof Map ? statusById.get(id) : statusById[id]);
  return (dependsOn ?? []).filter((id) => {
    const s = get(id);
    return s !== undefined && !DONE_STATUSES.has(s);
  });
}

/** The thread entry's voice, for the label a reader sees. */
export function commentVoice(c: { author_type?: string | null; author_name?: string | null; kind?: string | null }): string {
  const who = c.author_type === 'flowpilot' ? 'FlowPilot' : c.author_type === 'agent' ? (c.author_name || 'Agent') : (c.author_name || 'You');
  const kind = c.kind === 'step' ? 'did' : c.kind === 'question' ? 'asks' : c.kind === 'decision' ? 'decided' : 'wrote';
  return `${who} ${kind}`;
}
