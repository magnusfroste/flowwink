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

export interface ModuleChangePlan {
  /** The modules that will change, in the order given. */
  modules: string[];
  /** Why the change cannot be made as asked — empty when it can. */
  refusals: Array<{ module: string; reason: 'unknown' | 'core' | 'needed_by' | 'needs'; others?: string[] }>;
}

/**
 * Check a requested change against the graph. Nothing cascades silently: a
 * person approves the list as it is written, so a dependent (on disable) or a
 * parent (on enable) that is not in the list is a refusal naming it — the
 * agent adds it and asks again.
 */
export function planModuleChange(
  catalog: ModuleCatalogEntry[],
  current: ModulesSetting,
  action: 'enable' | 'disable',
  requested: string[],
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
 * Is this module a candidate to switch off? Only a suggestion — the owner
 * decides: an empty module can be one the business is about to start using.
 */
export function suggestOff(e: ModuleEvidence): { candidate: boolean; why: string } {
  if (!e.enabled) return { candidate: false, why: 'already off' };
  if (e.core) return { candidate: false, why: 'core — cannot be switched off' };
  if (e.required_by.length) return { candidate: false, why: `required by ${e.required_by.join(', ')}` };
  if (e.rows === null) return { candidate: false, why: 'declares no tables — judge it by calls and by what the business does' };
  if (e.rows > 0 || e.calls > 0) return { candidate: false, why: 'in use' };
  return {
    candidate: true,
    why: e.automation_runs > 0
      ? `no data and no calls; its automations ran ${e.automation_runs} times on nothing`
      : 'no data and no calls',
  };
}
