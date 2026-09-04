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

export function checklistProgress(items: ChecklistItem[] | null | undefined): { done: number; total: number } {
  const list = Array.isArray(items) ? items : [];
  return { done: list.filter((i) => i && i.done).length, total: list.length };
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
