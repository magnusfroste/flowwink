/**
 * One rule for every surface that SHOWS something: a module that is off is
 * not shown and does not alarm (2026-11-08).
 *
 * The server already refuses an off module's skills (agent-execute,
 * MODULE_DISABLED), hides them from discovery, answers 404 for its public
 * routes and a ModuleOff page for its admin routes. The surfaces that only
 * LOOK — Observability, the notifications bell, the dashboard, analytics —
 * read agent_automations, agent_activity, cron jobs and skills directly, and
 * an automation or a failed run of a module that is off read as a problem the
 * operator was asked to fix. Off means quiet.
 *
 * The rule is the server's own (`skillModuleOn`, the generated skill → module
 * owner map), so a skill is judged by the module that OWNS it, platform skills
 * and the kept utilities always pass, and a missing or unreadable modules row
 * fails open — exactly as moduleOffForRoute and the executor do.
 */
import { useMemo } from 'react';
import { useModules } from '@/hooks/useModules';
import { ALL_MODULES, ownerModuleOf, skillModuleOn } from '../../supabase/functions/_shared/skills/module-gate';

/** The modules that are on, or the fail-open sentinel when the row is absent or not yet read. */
export function activeModuleSet(modules: object | null | undefined): Set<string> {
  const row = (modules ?? {}) as Record<string, { enabled?: boolean } | undefined>;
  if (!Object.keys(row).length) return new Set([ALL_MODULES]);
  return new Set(Object.entries(row).filter(([, v]) => v?.enabled).map(([k]) => k));
}

/** True unless the skill's owning module is known to be off. A null skill (no skill) is shown. */
export function skillShown(skillName: string | null | undefined, active: Set<string>): boolean {
  if (!skillName) return true;
  return skillModuleOn(skillName, active);
}

/** True unless the module is known to be off. */
export function moduleShown(moduleId: string, active: Set<string>): boolean {
  return active.has(ALL_MODULES) || active.has(moduleId);
}

export { ownerModuleOf };

/** The active-module set for the current instance, fail-open while loading. */
export function useActiveModules(): Set<string> {
  const { data: modules } = useModules();
  return useMemo(() => activeModuleSet(modules), [modules]);
}
