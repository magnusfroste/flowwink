/**
 * A module that is off is not shown and does not alarm (2026-11-08).
 *
 * The server already refuses an off module's skills and routes; the surfaces
 * that only LOOK read automations, runs and cron jobs directly, and an
 * automation or a cron job of a module the operator chose not to run read as
 * a problem to fix — on Observability, the dashboard and the heartbeat's own
 * cron gate. These pin the rule where those readers take it from.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { enrichCronHealth, CRON_JOB_MODULE, type CronHealthReport } from '../../../supabase/functions/_shared/cron/health.ts';
import { withoutOffModules, type AutomationHealthSummary, type AutomationHealthItem } from '@/hooks/useAutomationHealth';
import { activeModuleSet, skillShown, moduleShown } from '@/lib/module-visibility';
import { defaultModulesSettings } from '@/hooks/useModules';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

function report(jobs: Array<{ jobname: string; last_status?: string; never_ran?: boolean }>): CronHealthReport {
  return {
    checked_at: new Date().toISOString(),
    cron_available: true,
    self_host: 'https://self.supabase.co',
    jobs: jobs.map((j) => ({
      jobname: j.jobname, schedule: '0 * * * *', active: true, target_host: 'https://self.supabase.co', foreign_host: false,
      never_ran: j.never_ran ?? false, last_status: j.last_status ?? 'succeeded',
      last_run: new Date(Date.now() - 60_000).toISOString(), last_run_age_seconds: 60,
    })),
    http_errors_recent: [],
    flags: { jobs_total: jobs.length, jobs_never_ran: 0, jobs_foreign_host: 0, http_errors_24h: 0 },
  } as unknown as CronHealthReport;
}

describe('cron: a job of a module that is off is never red', () => {
  it('a failed newsletter job with Newsletter off alarms nobody; with it on it is red', () => {
    const r = report([{ jobname: 'newsletter-dispatch-scheduled', last_status: 'failed' }]);
    const off = enrichCronHealth(r, new Date(), { moduleOn: (m) => m !== 'newsletter' });
    expect(off.jobs[0].red).toBe(false);
    expect(off.jobs[0].module_off).toBe('newsletter');
    expect(off.red_count).toBe(0);
    const on = enrichCronHealth(r, new Date(), { moduleOn: () => true });
    expect(on.jobs[0].red).toBe(true);
  });

  it('a platform job is judged whatever the modules say', () => {
    const r = report([{ jobname: 'automation-dispatcher-every-minute', last_status: 'failed' }]);
    expect(enrichCronHealth(r, new Date(), { moduleOn: () => false }).jobs[0].red).toBe(true);
  });

  it('every module the map names is a real module', () => {
    const ids = new Set(Object.keys(defaultModulesSettings));
    for (const [job, mod] of Object.entries(CRON_JOB_MODULE)) expect(ids.has(mod), `${job} → ${mod}`).toBe(true);
  });

  it('every caller of enrichCronHealth passes which modules are on', () => {
    const callers = ['supabase/functions/instance-health/index.ts', 'supabase/functions/flowpilot-heartbeat/index.ts', 'supabase/functions/_shared/feedback/machine-room-reports.ts'];
    for (const f of callers) expect(read(f), f).toMatch(/enrichCronHealth\(.*moduleOn: await loadEnabledModules\(supabase\)/);
    // Discover, don't enumerate: no other edge caller may call it without the modules.
    const edge = (dir: string): string[] => readdirSync(join(process.cwd(), dir), { withFileTypes: true })
      .flatMap((e) => e.isDirectory() ? edge(`${dir}/${e.name}`) : e.name.endsWith('.ts') ? [`${dir}/${e.name}`] : []);
    for (const f of edge('supabase/functions')) {
      const src = read(f);
      if (!src.includes('enrichCronHealth(') || f.endsWith('_shared/cron/health.ts')) continue;
      expect(src, f).toMatch(/moduleOn:/);
    }
  });
});

describe('automation health: an automation of a module that is off is not shown', () => {
  const item = (skillName: string, health: AutomationHealthItem['health']): AutomationHealthItem => ({
    id: skillName, name: skillName, skillName, triggerType: 'cron', enabled: true, runCount: 3, lastTriggeredAt: null,
    lastError: health === 'warning' ? 'boom' : null, dailyRuns: [1, 0, 0, 0, 0, 0, 1], dailyErrors: [0, 0, 0, 0, 0, 0, 1], errorRate: 0.5, health,
  });
  const summary = (items: AutomationHealthItem[]): AutomationHealthSummary => ({
    total: items.length, enabled: items.length, healthy: 0, warning: items.length, erroring: 0, stale: 0,
    totalRuns7d: 4, totalErrors7d: 2, overallErrorRate: 0.5, items,
  });

  it('a warning on an off module disappears and is not counted', () => {
    const s = summary([item('send_webinar_reminders', 'warning'), item('add_lead', 'warning')]);
    const shown = withoutOffModules(s, activeModuleSet({ webinars: { enabled: false }, leads: { enabled: true } }));
    expect(shown.items.map((i) => i.skillName)).toEqual(['add_lead']);
    expect(shown.warning).toBe(1);
    expect(shown.totalErrors7d).toBe(1);
  });

  it('a missing modules row shows everything (fail open, as the route gate)', () => {
    const s = summary([item('send_webinar_reminders', 'warning')]);
    expect(withoutOffModules(s, activeModuleSet(null)).items).toHaveLength(1);
  });

  it('platform skills and automations without a skill are always shown', () => {
    const active = activeModuleSet({ leads: { enabled: false } });
    expect(skillShown(null, active)).toBe(true);
    expect(skillShown('agent_day_report', active)).toBe(true);
    expect(skillShown('add_lead', active)).toBe(false);
    expect(moduleShown('leads', active)).toBe(false);
    expect(moduleShown('leads', activeModuleSet(undefined))).toBe(true);
  });
});

describe('readiness: a job of a module that is off is not required', () => {
  it('booking-reminders and the newsletter job are not required with their modules off', async () => {
    const { requiredCronJobs, PLATFORM_CRON_JOBS } = await import('@/lib/instance-readiness');
    expect(requiredCronJobs()).toEqual([...PLATFORM_CRON_JOBS]);
    const req = requiredCronJobs((m) => m !== 'bookings' && m !== 'newsletter' && m !== 'flowpilot');
    expect(req).not.toContain('booking-reminders');
    expect(req).not.toContain('newsletter-dispatch-scheduled');
    expect(req).not.toContain('flowpilot-heartbeat');
    expect(req).toContain('automation-dispatcher-every-minute');
  });
});

describe('every surface that only looks asks the modules', () => {
  // Each reads agent/cron/module data and showed it whatever the module's state.
  const SURFACES: Array<[string, RegExp]> = [
    ['src/hooks/useAutomationHealth.ts', /withoutOffModules/],
    ['src/components/admin/system/ObservabilityTab.tsx', /skillShown\(f\.skill_name, active\)/],
    ['src/components/admin/system/ObservabilityTab.tsx', /SOURCE_MODULE\[src\]/],
    ['src/components/admin/system/PerformanceModeCard.tsx', /CRON_JOB_MODULE\[j\.jobname\]/],
    ['src/components/admin/developer/McpActivityPanel.tsx', /skillShown\(r\.skill_name, active\)/],
    ['src/components/admin/InstanceReadinessChecklist.tsx', /moduleOn:/],
    ['src/hooks/useAgentAttention.ts', /skillShown\(r\.skill_name, active\)/],
    ['src/components/admin/NotificationsBell.tsx', /moduleShown\('tickets', active\)/],
    ['src/components/admin/NotificationsBell.tsx', /moduleShown\('approvals', active\)/],
    ['src/components/admin/NotificationsBell.tsx', /moduleShown\('flowpilot', active\)/],
    ['src/components/admin/MyDayWidget.tsx', /KIND_MODULE\[i\.kind\]/],
    ['src/components/admin/BusinessPulseWidget.tsx', /leadsOn &&/],
    ['src/components/admin/ChatFeedbackDashboardWidget.tsx', /kbEnabled &&/],
    ['src/components/admin/FlowPilotDashboardWidget.tsx', /skillShown\(a\.skill_name, active\)/],
    ['src/components/admin/analytics/ConversionsTab.tsx', /KIND_MODULE\[k\]/],
  ];
  for (const [file, shape] of SURFACES) it(`${file} — ${shape.source}`, () => expect(read(file)).toMatch(shape));

  it('analytics offers no "Enable <module>" prompt for a module that is off', () => {
    expect(read('src/pages/admin/AnalyticsDashboardPage.tsx')).not.toMatch(/ModulePrompt/);
  });
});
