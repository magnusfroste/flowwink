/**
 * Module Data Ownership
 *
 * Reads `data.tables` / `data.storageBuckets` / `data.settingsKeys` from each
 * module's unified manifest. Used by:
 *  - ResetSiteDialog — dynamic wipe per module (replaces hardcoded list)
 *  - Orphan detector — finds rows in tables owned by disabled modules
 *  - Doc-drift CI — flags tables without any owning module
 *
 * Modules that have NOT yet declared `data.tables` fall through to the
 * legacy hardcoded sections in ResetSiteDialog (incremental rollout).
 */

import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { getAllUnifiedModules, getUnifiedModule } from '@/lib/module-def';
import type { ModulesSettings } from '@/hooks/useModules';

/**
 * Tables that must NEVER be wiped by reset (would brick the site).
 * Modules MUST NOT declare these in `data.tables`.
 */
export const PROTECTED_TABLES: ReadonlySet<string> = new Set([
  'profiles',
  'user_roles',
  'role_module_access',
  'role_module_access_defaults',
  'agent_skills',
  'agent_skill_packs',
  // site_settings is selectively reset via `settingsKeys`, never wholesale
  'site_settings',
]);

export interface ModuleOwnership {
  moduleId: string;
  moduleName: string;
  tables: string[];
  storageBuckets: string[];
  settingsKeys: string[];
}

/** Get ownership for one module (empty arrays if module hasn't declared yet). */
export function getModuleOwnership(moduleId: keyof ModulesSettings): ModuleOwnership | null {
  const mod = getUnifiedModule(moduleId as string);
  if (!mod) return null;
  return {
    moduleId: mod.id as string,
    moduleName: mod.name,
    tables: (mod.data?.tables ?? []).filter(t => !PROTECTED_TABLES.has(t)),
    storageBuckets: mod.data?.storageBuckets ?? [],
    settingsKeys: mod.data?.settingsKeys ?? [],
  };
}

/** Get ownership for every registered module (skips modules with nothing declared). */
export function getAllModuleOwnership(): ModuleOwnership[] {
  return getAllUnifiedModules()
    .map(m => getModuleOwnership(m.id as keyof ModulesSettings))
    .filter((o): o is ModuleOwnership => {
      if (!o) return false;
      return o.tables.length > 0 || o.storageBuckets.length > 0 || o.settingsKeys.length > 0;
    });
}

async function detachJournalEntryReferences() {
  const client = supabase as any;
  await client.from('expense_reports').update({ journal_entry_id: null }).not('journal_entry_id', 'is', null);
  await client.from('expense_payments').update({ journal_entry_id: null }).not('journal_entry_id', 'is', null);
  await client.from('payroll_runs').update({ approval_journal_id: null }).not('approval_journal_id', 'is', null);
  await client.from('payroll_runs').update({ payment_journal_id: null }).not('payment_journal_id', 'is', null);
  await client.from('payment_reconciliations').update({ journal_entry_id: null }).not('journal_entry_id', 'is', null);
  await client.from('payment_reconciliations').update({ reversal_journal_entry_id: null }).not('reversal_journal_entry_id', 'is', null);
}

/** Delete every row from one table. Returns null on success, error message on failure. */
async function wipeTable(table: string): Promise<string | null> {
  const client = supabase as any;
  if (table === 'journal_entries') {
    await detachJournalEntryReferences();
  }
  let { error } = await client.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error && /column .*id.* does not exist|invalid input syntax for type/i.test(error.message ?? '')) {
    // Non-uuid PK fallback — works for tables with created_at
    const res = await client.from(table).delete().not('created_at', 'is', null);
    error = res.error;
  }
  if (error && /column .*created_at.* does not exist/i.test(error.message ?? '')) {
    // Last resort — match every row via a non-null check on any column. Try a few common ones.
    for (const col of ['updated_at', 'name', 'key']) {
      const res = await (supabase as any).from(table).delete().not(col, 'is', null);
      if (!res.error) return null;
    }
  }
  return error ? error.message : null;
}

/**
 * Wipe all data owned by a module. Tables are deleted in declared order
 * (children first) so FK constraints are satisfied.
 */
export async function wipeModuleData(
  moduleId: keyof ModulesSettings,
): Promise<{ table: string; ok: boolean; error?: string }[]> {
  const ownership = getModuleOwnership(moduleId);
  if (!ownership) return [];

  const results: { table: string; ok: boolean; error?: string }[] = [];

  for (const table of ownership.tables) {
    if (PROTECTED_TABLES.has(table)) {
      results.push({ table, ok: false, error: 'protected' });
      continue;
    }
    const err = await wipeTable(table);
    if (err) {
      results.push({ table, ok: false, error: err });
      logger.warn(`[wipeModuleData] ${moduleId}.${table}: ${err}`);
    } else {
      results.push({ table, ok: true });
    }
  }

  const client = supabase as any;
  for (const bucket of ownership.storageBuckets) {
    try {
      const { data: files } = await client.storage.from(bucket).list('', { limit: 1000 });
      if (files && files.length > 0) {
        const paths = files.map((f: { name: string }) => f.name);
        await client.storage.from(bucket).remove(paths);
      }
      results.push({ table: `storage:${bucket}`, ok: true });
    } catch (e) {
      results.push({ table: `storage:${bucket}`, ok: false, error: e instanceof Error ? e.message : 'unknown' });
    }
  }

  return results;
}

/**
 * Wipe data across multiple modules with multi-pass retry. Tables that fail
 * on the first pass (typically FK violations from sibling modules) are retried
 * after their dependents elsewhere have been cleared. Stops when a pass makes
 * no progress.
 */
export async function wipeModulesData(
  moduleIds: (keyof ModulesSettings)[],
): Promise<{ table: string; module: string; ok: boolean; error?: string }[]> {
  const queue: { table: string; module: string }[] = [];
  for (const id of moduleIds) {
    const ownership = getModuleOwnership(id);
    if (!ownership) continue;
    for (const table of ownership.tables) {
      if (PROTECTED_TABLES.has(table)) continue;
      queue.push({ table, module: id as string });
    }
  }

  const results: { table: string; module: string; ok: boolean; error?: string }[] = [];
  let remaining = queue;
  for (let pass = 0; pass < 4 && remaining.length > 0; pass++) {
    const next: typeof remaining = [];
    for (const item of remaining) {
      const err = await wipeTable(item.table);
      if (err) next.push(item);
      else results.push({ ...item, ok: true });
    }
    if (next.length === remaining.length) {
      // No progress — record the failures and stop
      for (const item of next) {
        const err = await wipeTable(item.table);
        results.push({ ...item, ok: false, error: err ?? 'unknown' });
      }
      return results;
    }
    remaining = next;
  }
  return results;
}


/**
 * Count rows in each table owned by a module — used to detect orphan data
 * (e.g. module is disabled but its tables still have rows).
 */
export async function countModuleRows(moduleId: keyof ModulesSettings): Promise<number> {
  const ownership = getModuleOwnership(moduleId);
  if (!ownership || ownership.tables.length === 0) return 0;
  const client = supabase as any;
  let total = 0;
  for (const table of ownership.tables) {
    try {
      const { count } = await client.from(table).select('*', { count: 'exact', head: true });
      total += count ?? 0;
    } catch {
      // ignore — table may not exist on this instance
    }
  }
  return total;
}
