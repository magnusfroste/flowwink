/**
 * Search and filter for the automations list — the same answer the modules
 * page gives when there are more items than a glance covers.
 *
 * An automation is homed to the module that seeded it (its name appears in
 * that module's `automations` seeds — the unified registry or the legacy
 * bootstrap registry); one no module seeded is "custom". Pure functions, so
 * the panel stays a renderer and the rule is testable without React.
 */
import type { AgentAutomation, AutomationTriggerType } from '@/types/agent';
import { moduleRegistry } from '@/lib/module-registry';
import { getBootstrapRegistry } from '@/lib/module-bootstrap';
import { defaultModulesSettings } from '@/hooks/useModules';

export const CUSTOM_AUTOMATION_MODULE = 'custom';

export type AutomationStateFilter = 'all' | 'enabled' | 'disabled' | 'failing' | 'never_ran';

export interface AutomationFilters {
  query: string;
  trigger: AutomationTriggerType | 'all';
  state: AutomationStateFilter;
  module: string; // module id, CUSTOM_AUTOMATION_MODULE, or 'all'
}

export const EMPTY_AUTOMATION_FILTERS: AutomationFilters = { query: '', trigger: 'all', state: 'all', module: 'all' };

export interface AutomationModuleHome { id: string; name: string }

/** Seeded automation name → the module that seeds it. Built once per call; cheap. */
export function automationModuleIndex(): Map<string, AutomationModuleHome> {
  const index = new Map<string, AutomationModuleHome>();
  const names = new Map<string, string>();
  for (const m of moduleRegistry.list()) names.set(m.id, m.name);
  for (const [id, cfg] of Object.entries(defaultModulesSettings)) {
    if (!names.has(id) && cfg && typeof cfg === 'object' && 'name' in cfg) names.set(id, String((cfg as { name: string }).name));
  }
  for (const m of moduleRegistry.list()) {
    const seeds = (moduleRegistry.get(m.id) as { automations?: Array<{ name: string }> } | undefined)?.automations ?? [];
    for (const a of seeds) if (!index.has(a.name)) index.set(a.name, { id: m.id, name: names.get(m.id) ?? m.id });
  }
  for (const [id, bootstrap] of Object.entries(getBootstrapRegistry())) {
    for (const a of (bootstrap as { automations?: Array<{ name: string }> } | undefined)?.automations ?? []) {
      if (!index.has(a.name)) index.set(a.name, { id, name: names.get(id) ?? id });
    }
  }
  return index;
}

export function automationHome(a: Pick<AgentAutomation, 'name'>, index: Map<string, AutomationModuleHome>): AutomationModuleHome {
  return index.get(a.name) ?? { id: CUSTOM_AUTOMATION_MODULE, name: 'Custom' };
}

/** The modules present in a list, for the filter's options: id → name, sorted by name, custom last. */
export function automationModuleOptions(list: AgentAutomation[], index: Map<string, AutomationModuleHome>): AutomationModuleHome[] {
  const seen = new Map<string, AutomationModuleHome>();
  for (const a of list) { const h = automationHome(a, index); if (!seen.has(h.id)) seen.set(h.id, h); }
  const custom = seen.get(CUSTOM_AUTOMATION_MODULE);
  const rest = Array.from(seen.values()).filter((h) => h.id !== CUSTOM_AUTOMATION_MODULE).sort((x, y) => x.name.localeCompare(y.name));
  return custom ? [...rest, custom] : rest;
}

function triggerText(a: AgentAutomation): string {
  const cfg = (a.trigger_config ?? {}) as Record<string, unknown>;
  return [cfg.expression, cfg.event_name, cfg.event, cfg.signal_type, cfg.signal].filter((v) => typeof v === 'string').join(' ');
}

export function matchesAutomationFilters(a: AgentAutomation, f: AutomationFilters, index: Map<string, AutomationModuleHome>): boolean {
  if (f.trigger !== 'all' && a.trigger_type !== f.trigger) return false;
  if (f.state === 'enabled' && !a.enabled) return false;
  if (f.state === 'disabled' && a.enabled) return false;
  if (f.state === 'failing' && !a.last_error) return false;
  if (f.state === 'never_ran' && (a.run_count > 0 || a.last_triggered_at)) return false;
  const home = automationHome(a, index);
  if (f.module !== 'all' && home.id !== f.module) return false;
  const q = f.query.trim().toLowerCase();
  if (!q) return true;
  const hay = [a.name, a.description ?? '', a.skill_name ?? '', triggerText(a), home.name, home.id, a.executor ?? ''].join(' ').toLowerCase();
  return q.split(/\s+/).every((term) => hay.includes(term));
}

export function filterAutomations(list: AgentAutomation[], f: AutomationFilters, index = automationModuleIndex()): AgentAutomation[] {
  return list.filter((a) => matchesAutomationFilters(a, f, index));
}

export function hasActiveAutomationFilters(f: AutomationFilters): boolean {
  return f.query.trim() !== '' || f.trigger !== 'all' || f.state !== 'all' || f.module !== 'all';
}
