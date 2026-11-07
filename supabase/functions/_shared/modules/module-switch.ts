/**
 * ONE module switch (2026-11-06).
 *
 * Switching a module on or off is four writes that must agree: the modules
 * row, the module's skills (enabled + mcp_exposed, both in one write), every
 * automation that runs one of its skills, and the decision record
 * (site_settings.module_teardowns) that keeps a switched-off module off and
 * lets enable resume exactly what disable stopped.
 *
 * Until today there were two implementations and three more writers:
 *   - manage_modules (agent-execute) did all four, by skill name;
 *   - the browser teardown (module-bootstrap.ts) did the skills, stopped
 *     automations by SEEDED NAME, and recorded `automation_ids: []` — so a
 *     module switched off in /admin/modules and on again never got its
 *     automations back, and "Weekly Business Digest" (a flowpilot-group
 *     automation running an analytics skill) kept running after either;
 *   - the bulk toggle fired teardowns without awaiting and swallowed errors;
 *   - manage_site_settings key=modules and install_template wrote the row
 *     alone, leaving skills and automations running and no record — the
 *     exact state autoActivateModule wakes a module from.
 *
 * This file is the one implementation. It has no I/O of its own beyond the
 * minimal client interface below, so the admin page (browser supabase-js,
 * the admin's own session and RLS) and agent-execute (service role) run the
 * same code. The rules (graph, core, protected, which skills) stay in
 * module-plan.ts; this is the hands.
 */
import {
  describeRefusals,
  moduleSkillNames,
  planModuleChange,
  skillsToDisable,
  type ModuleCatalogEntry,
  type ModulesSetting,
  type ModuleChangePlan,
} from './module-plan.ts';
import { hideSkills } from '../skills/skill-visibility.ts';

/** The slice of supabase-js both runtimes expose. */
// deno-lint-ignore no-explicit-any -- the query builder's generics differ between the browser and Deno clients
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface SwitchDb { from(table: string): any }

export interface ArtifactModule { moduleId: string; skills: Array<{ name?: string }> }

export interface SwitchInput {
  action: 'enable' | 'disable';
  modules: string[];
  /** Who decided: `user:<id>`, an agent's name, or a shell name. */
  by: string;
  reason: string | null;
  /** A person at the keyboard may switch off a protected module; an agent may not. */
  attended: boolean;
  /** How the switch was reached — recorded in the audit row and the teardown. */
  via: string;
  /** Write the audit row (default). The browser passes false: audit_logs refuses a user session, and a 400 in the network log is not a trace. */
  audit?: boolean;
}

export interface SwitchChange {
  module: string;
  enabled: boolean;
  skills_disabled?: number;
  skill_failures?: string[];
  automations_stopped?: string[];
  automations_resumed?: string[];
}

export interface SwitchResult {
  ok: boolean;
  /** Why nothing changed — empty when something did. */
  refusals: ModuleChangePlan['refusals'];
  /** One sentence an agent or a toast can show. */
  refusal_text: string | null;
  changed: SwitchChange[];
  /** A write failed — the result says which; what was written stays. */
  error: string | null;
}

type Teardown = { at: string; by: string; reason: string | null; via?: string; skills: string[]; automation_ids: string[] };
type SettingRow = { key: string; value: unknown };
type NamedRow = { id: string; name: string };

function settingOf<T>(rows: SettingRow[] | null | undefined, key: string, fallback: T): T {
  const row = (rows ?? []).find((r) => r.key === key);
  return (row?.value as T | undefined) ?? fallback;
}

/** Every parent an enable needs, so a template can switch on a child in one call. */
export function withParents(catalog: ModuleCatalogEntry[], ids: string[]): string[] {
  const byId = new Map(catalog.map((c) => [c.moduleId, c]));
  const out: string[] = [];
  const visit = (id: string) => {
    if (out.includes(id)) return;
    for (const p of byId.get(id)?.requires ?? []) visit(p);
    out.push(id);
  };
  for (const id of ids) visit(id);
  return out;
}

export async function switchModules(
  db: SwitchDb,
  catalog: ModuleCatalogEntry[],
  artifactModules: ArtifactModule[],
  input: SwitchInput,
): Promise<SwitchResult> {
  const { data: rows, error: readErr } = await db.from('site_settings')
    .select('key, value').in('key', ['modules', 'module_teardowns', 'module_keeps']);
  if (readErr) return { ok: false, refusals: [], refusal_text: null, changed: [], error: `Could not read site_settings: ${readErr.message}` };
  const current: ModulesSetting = { ...settingOf<ModulesSetting>(rows as SettingRow[], 'modules', {}) };
  const teardowns = { ...settingOf<Record<string, Teardown>>(rows as SettingRow[], 'module_teardowns', {}) };
  const keeps = { ...settingOf<Record<string, unknown>>(rows as SettingRow[], 'module_keeps', {}) };
  if (!Object.keys(current).length) return { ok: false, refusals: [], refusal_text: null, changed: [], error: 'site_settings.modules is absent.' };

  const plan = planModuleChange(catalog, current, input.action, input.modules, { attended: input.attended });
  if (plan.refusals.length) return { ok: false, refusals: plan.refusals, refusal_text: describeRefusals(plan.refusals), changed: [], error: null };
  if (!plan.modules.length) return { ok: true, refusals: [], refusal_text: null, changed: [], error: null };

  // 1. The row — only the enabled flag of the modules that change.
  for (const id of plan.modules) current[id] = { ...current[id], enabled: input.action === 'enable' };
  const { error: writeErr } = await db.from('site_settings').upsert({ key: 'modules', value: current }, { onConflict: 'key' });
  if (writeErr) return { ok: false, refusals: [], refusal_text: null, changed: [], error: `Could not write the module row: ${writeErr.message}` };

  const changed: SwitchChange[] = [];
  const at = new Date().toISOString();

  if (input.action === 'disable') {
    const enabledAfter = (id: string) => current[id]?.enabled === true;
    const names = skillsToDisable(artifactModules, plan.modules, enabledAfter);
    for (const id of plan.modules) {
      // 2. The skills — the module's own, minus shared utilities and what another enabled module carries.
      const own = moduleSkillNames(artifactModules, id);
      const mine = names.filter((s) => own.includes(s));
      // Both flags in one write, chunked, the result read (skill-visibility.ts).
      const hidden = await hideSkills(db, mine);
      // 3. The automations — every one that runs one of the module's skills,
      //    whatever group seeded it and whoever created it.
      const { data: stopped } = own.length
        ? await db.from('agent_automations').update({ enabled: false }).in('skill_name', own).eq('enabled', true).select('id, name')
        : { data: [] };
      // 4. The record — what enable resumes, and what autoActivateModule respects.
      teardowns[id] = { at, by: input.by, reason: input.reason, via: input.via, skills: mine, automation_ids: ((stopped ?? []) as NamedRow[]).map((a) => a.id) };
      delete keeps[id]; // a switch-off supersedes an earlier keep
      changed.push({
        module: id, enabled: false, skills_disabled: hidden.hidden,
        ...(hidden.failures.length ? { skill_failures: hidden.failures } : {}),
        automations_stopped: ((stopped ?? []) as NamedRow[]).map((a) => a.name),
      });
    }
  } else {
    for (const id of plan.modules) {
      const rec = teardowns[id];
      const ids = Array.isArray(rec?.automation_ids) ? rec.automation_ids : [];
      const { data: resumed } = ids.length
        ? await db.from('agent_automations').update({ enabled: true }).in('id', ids).select('id, name')
        : { data: [] };
      delete teardowns[id];
      changed.push({ module: id, enabled: true, automations_resumed: ((resumed ?? []) as NamedRow[]).map((a) => a.name) });
    }
    // The skills come back through the skill sync (the caller runs it: the
    // edge's sync_skills_from_code, or the admin shell's on its next load) —
    // re-enabling by name here would resurrect a quarantined skill.
  }

  const { error: tdErr } = await db.from('site_settings').upsert({ key: 'module_teardowns', value: teardowns }, { onConflict: 'key' });
  const { error: keepErr } = await db.from('site_settings').upsert({ key: 'module_keeps', value: keeps }, { onConflict: 'key' });
  // The audit row is a trace, never a gate: a failure does not fail the switch.
  // audit_logs.entity_id is a uuid; a module id is not one, so the module goes
  // in metadata — the rows manage_modules wrote with entity_id: '<module>'
  // never landed (0 module rows on every instance, 2026-11-06).
  if (input.audit !== false) {
    await db.from('audit_logs').insert(plan.modules.map((id) => ({
      entity_type: 'module', entity_id: null,
      action: input.action === 'disable' ? 'module.disabled' : 'module.enabled',
      metadata: { module: id, by: input.by, reason: input.reason, via: input.via },
    }))).then(() => undefined, () => undefined);
  }

  const error = tdErr ? `Could not record the decision: ${tdErr.message}` : keepErr ? `Could not write module_keeps: ${keepErr.message}` : null;
  return { ok: !error, refusals: [], refusal_text: null, changed, error };
}
