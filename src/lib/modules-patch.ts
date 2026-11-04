/**
 * Saving site_settings.modules from the browser — write the change, not the copy.
 *
 * Every admin save used to write the WHOLE modules object from the tab's
 * cache. A tab loaded before an agent's approved manage_modules (or another
 * admin's save) still holds the old switches, so the next unrelated toggle
 * wrote them back: liteit 2026-11-04 — siteMigration switched off in a tab
 * from the day before turned forms and salesIntelligence back on, undoing a
 * decision approved under /admin/approvals the afternoon before.
 *
 * The rule: the fields the caller changed (edited vs. the baseline the tab
 * read) are applied onto the row as it is NOW. Nothing else is written.
 * Pure — useUpdateModules reads the row and writes the result.
 */

type Entry = Record<string, unknown>;
type ModulesValue = Record<string, Entry | undefined>;

export interface ModulesPatch {
  /** The row to write: the stored row with the caller's changed fields on top. */
  value: Record<string, Entry>;
  /** Modules whose `enabled` this write actually flips against the stored row. */
  enabledChanges: Array<{ id: string; enabled: boolean }>;
  /** Module ids the caller changed anything on. */
  touched: string[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function patchModulesRow(
  stored: ModulesValue,
  baseline: ModulesValue | undefined,
  edited: ModulesValue,
): ModulesPatch {
  const value: Record<string, Entry> = {};
  for (const [id, entry] of Object.entries(stored ?? {})) if (entry) value[id] = entry;
  const enabledChanges: ModulesPatch['enabledChanges'] = [];
  const touched: string[] = [];

  for (const [id, next] of Object.entries(edited ?? {})) {
    if (!next) continue;
    const before = baseline?.[id];
    const changed: Entry = {};
    // No baseline for this module (cache not loaded, a new module): every
    // field the caller sends is its intent — the old whole-object behaviour,
    // but still merged onto the current row rather than replacing it.
    for (const [k, v] of Object.entries(next)) {
      if (!before || !same(before[k], v)) changed[k] = v;
    }
    if (!Object.keys(changed).length) continue;
    touched.push(id);
    const current = value[id] ?? {};
    if ('enabled' in changed && (current.enabled === true) !== (changed.enabled === true)) {
      enabledChanges.push({ id, enabled: changed.enabled === true });
    }
    // The caller's whole entry fills the fields the row lacks: a toggle on a
    // birth-seeded {enabled} row leaves the full shape, which is how the
    // readiness checklist tells a person's module choice from a default
    // (modulesChosen). Fields the row has keep its value unless changed.
    value[id] = { ...next, ...current, ...changed };
  }
  return { value, enabledChanges, touched };
}
