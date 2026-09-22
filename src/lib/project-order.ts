/**
 * How the project rail orders and explains projects.
 *
 * Two different things live here and must not be confused:
 *   - the TEAM ORDER (projects.sort_order) is shared data — it is the agenda,
 *     everyone sees the same, and it is changed by dragging (reorder_projects);
 *   - the SORT MODE is a personal view preference — remembered per viewer, never
 *     written to the database, so one person's sort cannot flip the list for all.
 *
 * The attention verdict is not computed here. It comes from the database
 * (project_attention → project_attention_verdict), the same rule the agent's
 * project_portfolio_brief carries — this file only orders by it and words it.
 */

export type ProjectSortMode = 'team' | 'attention' | 'activity' | 'name' | 'newest';

export const PROJECT_SORT_LABELS: Record<ProjectSortMode, string> = {
  team: 'Team order',
  attention: 'Needs attention first',
  activity: 'Recently active',
  name: 'Name',
  newest: 'Newest',
};

export type AttentionReason = { kind: 'urgent' | 'overdue' | 'blocked' | 'stalled' | 'deadline_passed'; count: number };

export interface SortableProject {
  id: string;
  name: string;
  created_at: string;
  sort_order?: number | null;
}

export interface ProjectAttention {
  needsAttention: boolean;
  weight: number;
  reasons: AttentionReason[];
  lastActivityAt: string | null;
}

const byTeamOrder = (a: SortableProject, b: SortableProject) =>
  (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER)
  || b.created_at.localeCompare(a.created_at)
  || a.id.localeCompare(b.id);

export function sortProjects<P extends SortableProject>(
  projects: P[],
  attention: Map<string, ProjectAttention> | undefined,
  mode: ProjectSortMode,
): P[] {
  const list = [...projects];
  const at = (p: P) => attention?.get(p.id);
  switch (mode) {
    case 'attention':
      // Most-needing first; among equals, the team's own order — never a coin toss.
      return list.sort((a, b) => (at(b)?.weight ?? 0) - (at(a)?.weight ?? 0) || byTeamOrder(a, b));
    case 'activity':
      return list.sort((a, b) =>
        (at(b)?.lastActivityAt ?? b.created_at).localeCompare(at(a)?.lastActivityAt ?? a.created_at) || byTeamOrder(a, b));
    case 'name':
      return list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || byTeamOrder(a, b));
    case 'newest':
      return list.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
    case 'team':
    default:
      return list.sort(byTeamOrder);
  }
}

const REASON_WORDS: Record<AttentionReason['kind'], [string, string]> = {
  urgent: ['urgent', 'urgent'],
  overdue: ['overdue', 'overdue'],
  blocked: ['blocked', 'blocked'],
  stalled: ['stalled', 'stalled'],
  deadline_passed: ['deadline passed', 'deadline passed'],
};

/** "2 blocked · 1 urgent" — the why, in the order the verdict gave it. */
export function attentionLabel(reasons: AttentionReason[] | undefined): string {
  if (!reasons?.length) return '';
  return reasons
    .map((r) => (r.kind === 'deadline_passed' ? REASON_WORDS[r.kind][0] : `${r.count} ${REASON_WORDS[r.kind][r.count === 1 ? 0 : 1]}`))
    .join(' · ');
}

const STORAGE_KEY = 'flowwink.projects.sort';

/** The viewer's own choice. Storage can be missing or refuse — the view still works. */
export function readSortMode(): ProjectSortMode {
  try {
    const v = globalThis.localStorage?.getItem(STORAGE_KEY);
    return v && v in PROJECT_SORT_LABELS ? (v as ProjectSortMode) : 'team';
  } catch {
    return 'team';
  }
}

export function writeSortMode(mode: ProjectSortMode): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, mode);
  } catch {
    /* a private window: the choice lasts for this visit only */
  }
}
