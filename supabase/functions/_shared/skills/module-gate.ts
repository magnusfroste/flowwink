/**
 * The module gate — is this skill's OWNING module on? (2026-11-06)
 *
 * Until today every surface gated skills by CATEGORY: a category was open
 * when any module listed for it was on, `commerce` lists 24 modules, and a
 * default instance (approvals on) had every category open. So a module that
 * was off but whose rows had leaked (a bulk toggle, a settings write, an
 * install before the one switch) stayed visible to agents and ran. The
 * owner map (skill-modules.ts, generated from the seeds) was used only to
 * authorize people; it is the right gate for modules too.
 *
 * One rule, three consumers: the MCP gateway's discovery (loadExposedSkills),
 * FlowPilot's skill loading (loadSkillsRaw) and the executor (agent-execute
 * refuses MODULE_DISABLED). A skill passes when:
 *   - the modules row is unreadable (`__all__`): fail open, as before — a
 *     missing row must never hide every tool by accident;
 *   - it is a shared utility that stays on when its module is off
 *     (TEARDOWN_KEEP_SKILLS: search_web, scrape_url, sla_check, …);
 *   - it is owned by the `platform` pseudo-module, or by no module at all
 *     (agent-created, judged by its own row);
 *   - its owning module is on.
 */
import { SKILL_OWNER_MODULE } from './skill-modules.ts';
import { TEARDOWN_KEEP_SKILLS } from '../modules/module-plan.ts';

/** The sentinel loadActiveModuleIds answers when the modules row cannot be read. */
export const ALL_MODULES = '__all__';

/** Where a skill is SEEDED (cataloguing) — not the module that authorizes it (owner-module.ts). */
export function ownerModuleOf(skillName: string): string | null {
  return SKILL_OWNER_MODULE[skillName] ?? null;
}

export function skillModuleOn(skillName: string, activeModules: Set<string>): boolean {
  if (activeModules.has(ALL_MODULES)) return true;
  if (TEARDOWN_KEEP_SKILLS.includes(skillName)) return true;
  const owner = ownerModuleOf(skillName);
  if (!owner || owner === 'platform') return true;
  return activeModules.has(owner);
}

/** The refusal an executor answers for a skill whose module is off — not a failure, never retried as is. */
export function moduleDisabledRefusal(skillName: string, owner: string) {
  return {
    status: 'refused' as const,
    code: 'MODULE_DISABLED',
    retryable: false,
    module: owner,
    hint: `"${skillName}" belongs to the ${owner} module, which is off on this instance. An admin switches it on under Modules, or an agent asks with manage_modules (action enable — approval required). Switching it on brings its skills and automations back.`,
  };
}
