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

/**
 * Wipe all data owned by a module. Tables are deleted in declared order
 * (children first) so FK constraints are satisfied.
 *
 * Returns per-table outcome. Failures are collected, not thrown — a single
 * blocking FK shouldn't abort the entire reset.
 */
export async function wipeModuleData(
  moduleId: keyof ModulesSettings,
): Promise<{ table: string; ok: boolean; error?: string }[]> {
  const ownership = getModuleOwnership(moduleId);
  if (!ownership) return [];

  const client = supabase as any;
  const results: { table: string; ok: boolean; error?: string }[] = [];

  for (const table of ownership.tables) {
    if (PROTECTED_TABLES.has(table)) {
      results.push({ table, ok: false, error: 'protected' });
      continue;
    }
    try {
      // Try `id` predicate first (UUID PK); fall back for tables without one
      let { error } = await client.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error && /column .*id.* does not exist/i.test(error.message ?? '')) {
        const res = await client.from(table).delete().not('created_at', 'is', null);
        error = res.error;
      }
      if (error) {
        results.push({ table, ok: false, error: error.message });
        logger.warn(`[wipeModuleData] ${moduleId}.${table}: ${error.message}`);
      } else {
        results.push({ table, ok: true });
      }
    } catch (e) {
      results.push({ table, ok: false, error: e instanceof Error ? e.message : 'unknown' });
    }
  }

  // Storage buckets
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
