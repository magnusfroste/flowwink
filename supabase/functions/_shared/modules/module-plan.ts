/**
 * Switching modules on and off from the server — the rules, no I/O.
 *
 * /admin/modules has always been able to switch a module off properly: the
 * toggle cascades to dependents and `teardownModule` disables the module's
 * skills and automations. An agent could not: the only path was writing
 * `site_settings.modules` through manage_site_settings, which leaves every
 * skill and automation running — and the next write through one of them
 * (send_webinar_reminders, reindex_consultants…) switches the module back on
 * (autoActivateModule). On www 2026-10-31 five automations ran ~45 times a day
 * against modules with no data at all.
 *
 * module_usage_report and manage_modules (agent-execute) use these rules; the
 * catalog (parents, tables, core) travels in _module-skills.json.
 */

export interface ModuleCatalogEntry {
  moduleId: string;
  name: string;
  tier: string | null;
  requires: string[];
  tables: string[];
  core: boolean;
}

export type ModulesSetting = Record<string, { enabled?: boolean } & Record<string, unknown>>;

/**
 * Skills that stay enabled when their module is switched off — platform-shared
 * utilities (the same list as teardownModule's UTILITY_SKILLS in
 * src/lib/module-bootstrap.ts; a guardrail keeps the two equal).
 */
export const TEARDOWN_KEEP_SKILLS: readonly string[] = [
  'migrate_url', 'scrape_url', 'search_web', 'extract_pdf_text',
  'sla_check', 'process_signal', 'competitor_monitor',
];

/**
 * Modules module_usage_report never proposes to switch off, and an unattended
 * manage_modules refuses to: feedback is how the instance reports platform
 * defects upstream (submit_feedback → the endpoint's board). It has no rows
 * and no calls until something breaks — on liteit 2026-11-02 that read as
 * "unused". A person may still switch it off.
 */
export const NEVER_SUGGEST_OFF: readonly string[] = ['feedback'];

export interface ModuleChangePlan {
  /** The modules that will change, in the order given. */
  modules: string[];
  /** Why the change cannot be made as asked — empty when it can. */
  refusals: Array<{ module: string; reason: 'unknown' | 'core' | 'needed_by' | 'needs' | 'reports_defects' | 'off'; others?: string[] }>;
}

/**
 * Check a requested change against the graph. Nothing cascades silently: a
 * person approves the list as it is written, so a dependent (on disable) or a
 * parent (on enable) that is not in the list is a refusal naming it — the
 * agent adds it and asks again. A NEVER_SUGGEST_OFF module is switched off
 * only when a person is at the keyboard (`attended`).
 */
export function planModuleChange(
  catalog: ModuleCatalogEntry[],
  current: ModulesSetting,
  action: 'enable' | 'disable',
  requested: string[],
  opts: { attended?: boolean } = {},
): ModuleChangePlan {
  const byId = new Map(catalog.map((c) => [c.moduleId, c]));
  const wanted = [...new Set(requested.map((m) => String(m).trim()).filter(Boolean))];
  const set = new Set(wanted);
  const on = (id: string) => current[id]?.enabled === true;
  const refusals: ModuleChangePlan['refusals'] = [];

  for (const id of wanted) {
    const entry = byId.get(id);
    if (!entry || !(id in current)) { refusals.push({ module: id, reason: 'unknown' }); continue; }
    if (action === 'disable') {
      if (entry.core) { refusals.push({ module: id, reason: 'core' }); continue; }
      if (NEVER_SUGGEST_OFF.includes(id) && !opts.attended) { refusals.push({ module: id, reason: 'reports_defects' }); continue; }
      const dependents = catalog
        .filter((c) => c.requires.includes(id) && on(c.moduleId) && !set.has(c.moduleId))
        .map((c) => c.moduleId);
      if (dependents.length) refusals.push({ module: id, reason: 'needed_by', others: dependents });
    } else {
      const parents = entry.requires.filter((p) => !on(p) && !set.has(p));
      if (parents.length) refusals.push({ module: id, reason: 'needs', others: parents });
    }
  }
  const changing = wanted.filter((id) => (action === 'disable' ? on(id) : !on(id)));
  return { modules: refusals.length ? [] : changing, refusals };
}

/** The refusals as one sentence an agent can act on. */
export function describeRefusals(refusals: ModuleChangePlan['refusals']): string {
  return refusals.map((r) => {
    if (r.reason === 'unknown') return `${r.module} is not a module on this instance (module_usage_report lists them).`;
    if (r.reason === 'core') return `${r.module} is a core module and cannot be switched off.`;
    if (r.reason === 'off') return `${r.module} is off — keep is for a module that is on (enable it first, or leave it off).`;
    if (r.reason === 'reports_defects') return `${r.module} is how this instance reports platform defects — keep it on; only a person can switch it off, from /admin/modules.`;
    if (r.reason === 'needed_by') return `${r.module} is required by ${r.others!.join(', ')} — switch those off in the same call, or keep ${r.module}.`;
    return `${r.module} needs ${r.others!.join(', ')} — enable them in the same call.`;
  }).join(' ');
}

/**
 * The skills a disable switches off: the module's own, except the shared
 * utilities and any skill another module that stays on also carries.
 */
export function skillsToDisable(
  artifactModules: Array<{ moduleId: string; skills: Array<{ name?: string }> }>,
  disabling: string[],
  enabledAfter: (id: string) => boolean,
): string[] {
  const off = new Set(disabling);
  const keep = new Set(TEARDOWN_KEEP_SKILLS);
  const stillCarried = new Set<string>();
  for (const m of artifactModules) {
    if (off.has(m.moduleId) || !(m.moduleId === 'platform' || enabledAfter(m.moduleId))) continue;
    for (const s of m.skills) if (s?.name) stillCarried.add(s.name);
  }
  const names = new Set<string>();
  for (const m of artifactModules) {
    if (!off.has(m.moduleId)) continue;
    for (const s of m.skills) if (s?.name && !keep.has(s.name) && !stillCarried.has(s.name)) names.add(s.name);
  }
  return [...names].sort();
}

/** Every skill name a module carries (its automations are found by these). */
export function moduleSkillNames(
  artifactModules: Array<{ moduleId: string; skills: Array<{ name?: string }> }>,
  moduleId: string,
): string[] {
  return artifactModules.filter((m) => m.moduleId === moduleId)
    .flatMap((m) => m.skills.map((s) => s?.name).filter((n): n is string => Boolean(n)));
}

export interface ModuleEvidence {
  module: string;
  enabled: boolean;
  core: boolean;
  /** Rows across the module's declared tables; null when it declares none. */
  rows: number | null;
  /** Calls of the module's skills by people and agents in the window (not automations). */
  calls: number;
  /** Runs of the module's skills by automations and cron in the window. */
  automation_runs: number;
  automations_enabled: number;
  /** Enabled modules that require this one. */
  required_by: string[];
}

/**
 * A person's decision to keep a module the report would propose, kept in
 * site_settings.module_keeps (manage_modules action keep, approved). Not in
 * module_teardowns: autoActivateModule reads any entry there as "switched off
 * by a person".
 */
export interface ModuleKeep {
  at: string;
  by: string;
  reason: string | null;
}

/**
 * A module younger than this on the instance is not judged: nobody has had
 * the time to use it. reports (#885) was listed as unused the day it shipped.
 */
export const NEW_MODULE_DAYS = 30;

/**
 * Is this module a candidate to switch off? Only a suggestion — the owner
 * decides: an empty module can be one the business is about to start using.
 * `age_days` is how long the module's skills have been on the instance (null
 * when unknown); `kept` is an earlier decision to keep it.
 */
export function suggestOff(
  e: ModuleEvidence,
  opts: { age_days?: number | null; kept?: ModuleKeep | null } = {},
): { candidate: boolean; why: string } {
  if (!e.enabled) return { candidate: false, why: 'already off' };
  if (e.core) return { candidate: false, why: 'core — cannot be switched off' };
  if (NEVER_SUGGEST_OFF.includes(e.module)) return { candidate: false, why: 'the instance reports platform defects through it — keep it on' };
  if (e.required_by.length) return { candidate: false, why: `required by ${e.required_by.join(', ')}` };
  if (e.rows === null) return { candidate: false, why: 'declares no tables — judge it by calls and by what the business does' };
  if (e.rows > 0 || e.calls > 0) return { candidate: false, why: 'in use' };
  const idleRuns = e.automation_runs > 0 ? `its automations ran ${e.automation_runs} times on nothing` : null;
  if (opts.kept) {
    const said = `kept by ${opts.kept.by} ${opts.kept.at.slice(0, 10)}${opts.kept.reason ? `: ${opts.kept.reason}` : ''}`;
    return {
      candidate: false,
      why: idleRuns && e.automations_enabled > 0
        ? `${said} — but ${idleRuns}; pause them (manage_automations disable) unless the owner wants them running`
        : said,
    };
  }
  if (opts.age_days != null && opts.age_days < NEW_MODULE_DAYS) {
    return { candidate: false, why: `new on this instance ${opts.age_days} days ago — too early to judge` };
  }
  return {
    candidate: true,
    why: idleRuns ? `no data and no calls; ${idleRuns}` : 'no data and no calls',
  };
}

/**
 * A keep is a decision about a module that is on: refuse an unknown or
 * switched-off module (keeping it off is what a disable records).
 */
export function planModuleKeep(current: ModulesSetting, requested: string[]): ModuleChangePlan {
  const wanted = [...new Set(requested.map((m) => String(m).trim()).filter(Boolean))];
  const refusals: ModuleChangePlan['refusals'] = [];
  for (const id of wanted) {
    if (!(id in current)) refusals.push({ module: id, reason: 'unknown' });
    else if (current[id]?.enabled !== true) refusals.push({ module: id, reason: 'off' });
  }
  return { modules: refusals.length ? [] : wanted, refusals };
}
