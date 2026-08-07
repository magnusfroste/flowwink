/**
 * The dashboard offers no action the role cannot take.
 *
 * Found by Magnus signed in as sales: the "Quick Actions" card showed four
 * hardcoded CMS-era links (new page, blog post, campaign, analytics) with zero
 * role gating — an invitation into the exact empty-page failure the RLS sweep
 * eliminated, served on the front page, in EVERY role's default layout.
 *
 * The rule that survives: quick actions have ONE home — the top bar's
 * QuickCreateMenu, gated per action on both role and enabled module. A second
 * surface is a second copy of the gating logic, and the first copy had already
 * drifted (it never had gating at all).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROLE_PRESETS, DASHBOARD_WIDGETS } from '@/lib/dashboard-presets';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const dashboard = read('src/pages/admin/AdminDashboard.tsx');

describe('the ungated card is gone', () => {
  it('renders no hardcoded action links', () => {
    for (const label of ['Create new page', 'Write blog post', 'Create campaign']) {
      expect(dashboard).not.toContain(label);
    }
  });

  it('the widget id survives for stored layouts, rendering only the gated half', () => {
    // 'quick-actions' is a wire identifier in saved dashboard configs across
    // the fleet. Removing the id would not break anything (unknown ids render
    // null) but the approver's Pending Review card legitimately lives under
    // it — so the id stays and the else-branch is null.
    expect(dashboard).toMatch(/case 'quick-actions':/);
    expect(dashboard).toMatch(/isApprover \? \(/);
  });
});

describe('no default layout advertises it to non-approvers', () => {
  it('only admin keeps the widget in its preset', () => {
    for (const [role, widgets] of Object.entries(ROLE_PRESETS)) {
      if (role === 'admin') continue;
      expect(widgets, `${role} preset still lists quick-actions`).not.toContain('quick-actions');
    }
  });

  it('the customize panel names what actually renders', () => {
    const w = DASHBOARD_WIDGETS.find((x) => x.id === 'quick-actions');
    expect(w?.title).toBe('Pending Review');
  });
});

describe('the one remaining quick-action surface is gated', () => {
  it('QuickCreateMenu filters on role and module per action', () => {
    const menu = read('src/components/admin/QuickCreateMenu.tsx');
    expect(menu).toMatch(/roles: AppRole\[\]/);
    expect(menu).toMatch(/useEnabledModules/);
  });
});
