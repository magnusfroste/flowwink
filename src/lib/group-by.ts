/**
 * Group rows for a list or table — the "Group by" an Odoo user reaches for
 * before anything else. One helper for leads and deals, so both surfaces
 * order and label groups the same way: alphabetical by label, the group of
 * rows without a value last.
 */
export interface RowGroup<T> {
  key: string;
  label: string;
  rows: T[];
}

export const UNGROUPED_KEY = '__none__';

export function groupRows<T>(
  rows: T[],
  keyOf: (row: T) => string | null | undefined,
  labelOf: (key: string) => string,
  unassignedLabel = 'Unassigned',
): RowGroup<T>[] {
  const byKey = new Map<string, T[]>();
  for (const row of rows) {
    const k = keyOf(row);
    const key = k === null || k === undefined || k === '' ? UNGROUPED_KEY : String(k);
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }
  const groups: RowGroup<T>[] = [];
  for (const [key, list] of byKey) {
    groups.push({ key, label: key === UNGROUPED_KEY ? unassignedLabel : labelOf(key) || key, rows: list });
  }
  groups.sort((a, b) => {
    if (a.key === UNGROUPED_KEY) return 1;
    if (b.key === UNGROUPED_KEY) return -1;
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  });
  return groups;
}
