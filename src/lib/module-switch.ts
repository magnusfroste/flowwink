/**
 * /admin/modules runs the SAME module switch as manage_modules on the server
 * (supabase/functions/_shared/modules/module-switch.ts): the row, the skills,
 * the automations that run them, the decision record. Until 2026-11-06 the
 * browser had its own teardown — automations stopped by seeded name, the
 * record written with `automation_ids: []`, the bulk toggle not awaited — and
 * a module switched off here and on again never got its automations back.
 *
 * This file only builds the two catalogues the switch needs from what the
 * browser already has (the module registry, the modules row) and runs it as
 * the signed-in admin, under RLS.
 */
import { supabase } from '@/integrations/supabase/client';
import { moduleRegistry } from '@/lib/module-registry';
import { LEGACY_MODULE_DEPENDENCIES } from '@/lib/module-dependencies';
import { getUnifiedSkillNames } from '@/lib/module-def';
import type { ModulesSettings } from '@/hooks/useModules';
import type { ModuleCatalogEntry } from '../../supabase/functions/_shared/modules/module-plan.ts';
import { switchModules, withParents, type ArtifactModule, type SwitchResult } from '../../supabase/functions/_shared/modules/module-switch.ts';

export type { SwitchResult };

/** The graph the server's artifact carries, built from the registry and the row's `core` flags. */
export function browserModuleCatalog(modules: ModulesSettings): ModuleCatalogEntry[] {
  return moduleRegistry.list().map((mod) => {
    const def = moduleRegistry.get(mod.id) as { requires?: string[] } | undefined;
    const legacyParent = LEGACY_MODULE_DEPENDENCIES[mod.id];
    return {
      moduleId: mod.id,
      name: mod.name,
      tier: null,
      requires: [...new Set([...(def?.requires ?? []), ...(legacyParent ? [legacyParent] : [])])],
      tables: [],
      core: (modules as unknown as Record<string, { core?: boolean } | undefined>)[mod.id]?.core === true,
    };
  });
}

/** Every module's skill names — what a disable hides and whose automations it stops. */
export function browserArtifactModules(): ArtifactModule[] {
  return moduleRegistry.list().map((mod) => ({
    moduleId: mod.id,
    skills: getUnifiedSkillNames(mod.id as keyof ModulesSettings).map((name) => ({ name })),
  }));
}

/** Dependents an admin's disable takes with it, parents an enable needs — the list the switch is asked for. */
export function cascadeFor(catalog: ModuleCatalogEntry[], modules: ModulesSettings, action: 'enable' | 'disable', ids: string[]): string[] {
  if (action === 'enable') return withParents(catalog, ids);
  const on = (id: string) => (modules as unknown as Record<string, { enabled?: boolean } | undefined>)[id]?.enabled === true;
  const out = [...ids];
  for (let i = 0; i < out.length; i++) {
    for (const c of catalog) {
      if (c.requires.includes(out[i]) && on(c.moduleId) && !out.includes(c.moduleId)) out.push(c.moduleId);
    }
  }
  return out;
}

export async function switchModulesFromAdmin(
  modules: ModulesSettings,
  action: 'enable' | 'disable',
  ids: string[],
  reason: string | null = null,
): Promise<SwitchResult> {
  const { data: auth } = await supabase.auth.getUser();
  const catalog = browserModuleCatalog(modules);
  return switchModules(supabase, catalog, browserArtifactModules(), {
    action,
    modules: cascadeFor(catalog, modules, action, ids),
    by: auth?.user?.id ? `user:${auth.user.id}` : 'admin',
    reason,
    attended: true,
    via: '/admin/modules',
    audit: false,
  });
}
