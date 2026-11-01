import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COCKPIT_TABS, resolveCockpitTab } from '../cockpit-tabs';

/**
 * FlowPilot review step 3: the cockpit is four tabs, each answering one
 * question an admin has. Old links still land somewhere that holds what they
 * pointed at; nothing in the app links to a tab that no longer exists.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('the cockpit', () => {
  it('has exactly Today, Goals, Behaviour and Log', () => {
    expect(COCKPIT_TABS.map((t) => t.id)).toEqual(['today', 'goals', 'behaviour', 'log']);
  });

  it('maps every old ?tab= to the tab that holds it now', () => {
    const cases: Record<string, string> = {
      overview: 'today', analytics: 'today', health: 'today', chat: 'today',
      objectives: 'goals',
      persona: 'behaviour', memory: 'behaviour', autonomy: 'behaviour', evolution: 'behaviour',
      trace: 'log', sessions: 'log',
    };
    for (const [old, now] of Object.entries(cases)) expect(resolveCockpitTab(old), old).toBe(now);
    expect(resolveCockpitTab(null)).toBe('today');
    expect(resolveCockpitTab('nonsense')).toBe('today');
  });

  it('no link anywhere points at a removed tab name', () => {
    const files = [
      'src/App.tsx', 'src/components/admin/NotificationsBell.tsx', 'src/components/admin/AutomationHealthDashboardWidget.tsx',
      'src/components/admin/copilot/FlowPilotStatusBar.tsx', 'src/components/admin/copilot/FlowPilotOverviewTab.tsx',
    ];
    for (const f of files) {
      const tabs = [...read(f).matchAll(/\/admin\/flowpilot\?tab=([a-z]+)/g)].map((m) => m[1]);
      for (const t of tabs) expect(COCKPIT_TABS.map((x) => x.id), `${f}: ?tab=${t}`).toContain(t);
    }
  });

  it('the status bar speaks plainly', () => {
    const sb = read('src/components/admin/copilot/FlowPilotStatusBar.tsx');
    expect(sb).not.toMatch(/<span>HIL<\/span>/);
    expect(sb).toMatch(/Needs you/);
    expect(sb).toMatch(/Last action/);
  });

  it('Goals offers starter goals when empty, shows a goal\'s history, and refuses invalid JSON', () => {
    const p = read('src/components/admin/skills/ObjectivesPanel.tsx');
    expect(p).toMatch(/GOAL_OPTIONS\.map/);
    expect(p).toMatch(/<ObjectiveHistory objectiveId=\{objective\.id\} \/>/);
    expect(p).toMatch(/is not valid JSON — nothing was saved/);
    expect(p).not.toMatch(/catch \{ \/\* keep empty \*\/ \}/);
  });

  it('distill proposals read the field names the backend writes', () => {
    const p = read('src/components/admin/skills/DistilledProposalsPanel.tsx');
    expect(p).toMatch(/p\.observed_count \?\? p\.occurrences/);
    expect(p).toMatch(/p\.distinct_sessions \?\? p\.distinct_groups/);
  });
});

describe('the FlowPilot page keeps the admin top bar', () => {
  it('pinned pages show on every admin page, the cockpit included', () => {
    const header = readFileSync('src/components/admin/AdminContentHeader.tsx', 'utf8');
    expect(header).not.toMatch(/isCopilotMode/);
    expect(header).toMatch(/<PinnedPagesBar userId=\{user\?\.id\} \/>/);
  });
});
