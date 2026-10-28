/**
 * The automations list can be searched and filtered — the modules page's
 * answer to a long list, given to automations once a full instance seeds
 * dozens. The rule is pure: trigger, state, home module and a free-text
 * query over name / skill / cron / event / module.
 */
import { describe, it, expect } from 'vitest';
import {
  EMPTY_AUTOMATION_FILTERS, automationModuleIndex, automationModuleOptions, automationHome,
  filterAutomations, hasActiveAutomationFilters, CUSTOM_AUTOMATION_MODULE,
} from '@/lib/automation-filter';
import type { AgentAutomation } from '@/types/agent';

const base: AgentAutomation = {
  id: 'x', name: 'n', description: null, trigger_type: 'cron', trigger_config: { expression: '0 7 * * *' },
  skill_id: null, skill_name: null, skill_arguments: {}, enabled: true, executor: 'platform',
  last_triggered_at: null, next_run_at: null, run_count: 0, last_work_at: null, idle_run_count: 0,
  last_error: null, created_by: null, created_at: '', updated_at: '',
};
const mk = (over: Partial<AgentAutomation>): AgentAutomation => ({ ...base, ...over, id: over.name ?? base.name });

const list: AgentAutomation[] = [
  mk({ name: 'Feedback ping', skill_name: 'feedback_ping', trigger_config: { expression: '17 3 * * *' }, run_count: 3, last_triggered_at: '2026-10-28T03:17:00Z' }),
  mk({ name: 'Dunning run', skill_name: 'process_dunning', enabled: false }),
  mk({ name: 'Auto-allocate picking on order paid', trigger_type: 'event', trigger_config: { event: 'order.paid' }, skill_name: 'allocate_picking', last_error: 'boom', run_count: 1 }),
  mk({ name: 'My own nightly job', skill_name: 'weekly_business_digest' }),
];

describe('automation search and filters', () => {
  const index = automationModuleIndex();

  it('homes a seeded automation to its module and an unseeded one to custom', () => {
    expect(index.size).toBeGreaterThan(20);
    expect(automationHome(list[0], index).id).toBe('feedback');
    expect(automationHome(list[2], index).id).toBe('inventory');
    expect(automationHome(list[3], index).id).toBe(CUSTOM_AUTOMATION_MODULE);
    const opts = automationModuleOptions(list, index);
    expect(opts.at(-1)?.id).toBe(CUSTOM_AUTOMATION_MODULE);
    expect(opts.map((o) => o.id)).toContain('feedback');
  });

  it('no filter shows everything; each filter narrows on its own fact', () => {
    expect(filterAutomations(list, EMPTY_AUTOMATION_FILTERS, index)).toHaveLength(4);
    expect(hasActiveAutomationFilters(EMPTY_AUTOMATION_FILTERS)).toBe(false);
    expect(filterAutomations(list, { ...EMPTY_AUTOMATION_FILTERS, trigger: 'event' }, index).map((a) => a.name)).toEqual(['Auto-allocate picking on order paid']);
    expect(filterAutomations(list, { ...EMPTY_AUTOMATION_FILTERS, state: 'disabled' }, index).map((a) => a.name)).toEqual(['Dunning run']);
    expect(filterAutomations(list, { ...EMPTY_AUTOMATION_FILTERS, state: 'failing' }, index).map((a) => a.name)).toEqual(['Auto-allocate picking on order paid']);
    expect(filterAutomations(list, { ...EMPTY_AUTOMATION_FILTERS, state: 'never_ran' }, index).map((a) => a.name)).toEqual(['Dunning run', 'My own nightly job']);
    expect(filterAutomations(list, { ...EMPTY_AUTOMATION_FILTERS, module: 'feedback' }, index).map((a) => a.name)).toEqual(['Feedback ping']);
    expect(filterAutomations(list, { ...EMPTY_AUTOMATION_FILTERS, module: CUSTOM_AUTOMATION_MODULE }, index).map((a) => a.name)).toEqual(['Dunning run', 'My own nightly job']);
  });

  it('the query reads name, skill, cron expression, event name and module — every term must hit', () => {
    const q = (query: string) => filterAutomations(list, { ...EMPTY_AUTOMATION_FILTERS, query }, index).map((a) => a.name);
    expect(q('ping')).toEqual(['Feedback ping']);
    expect(q('process_dunning')).toEqual(['Dunning run']);
    expect(q('17 3')).toEqual(['Feedback ping']);
    expect(q('order.paid')).toEqual(['Auto-allocate picking on order paid']);
    expect(q('inventory')).toEqual(['Auto-allocate picking on order paid']);
    expect(q('feedback')).toEqual(['Feedback ping']);
    expect(q('custom')).toEqual(['Dunning run', 'My own nightly job']);
    expect(q('feedback dunning')).toEqual([]);
    expect(q('  ')).toHaveLength(4);
  });
});
