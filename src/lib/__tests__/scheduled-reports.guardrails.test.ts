/**
 * Scheduled reports (docs/modules/reports.md, 2026-11-04): what the platform
 * writes for people on a clock lands under Reports as versioned pages — the
 * daily briefing, the weekly digest, the month close — and the briefing
 * points at them. "Mine" on Reports is the shared ownership lens, a filter
 * over the first requester, never a wall.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseReport } from '@/lib/report-blocks';
import { briefingReport, weeklyDigestReport, monthCloseReport, monthCloseSlug, previousMonth, DAILY_BRIEFING_SLUG, WEEKLY_DIGEST_SLUG } from '../../../supabase/functions/_shared/reports/scheduled';
import { reportsModule } from '@/lib/modules/reports-module';
import { OWNERSHIP, applyLens } from '@/lib/ownership';

const fmt = { money: (c: number) => `${Math.round(c / 100)} kr`, date: (d: Date | string) => new Date(d).toISOString().slice(0, 10) };
const read = (p: string) => readFileSync(p, 'utf8');

describe('the renderers are pure and parse with the reader', () => {
  it('the briefing: kpis, a health note, what needs a person, the sections as tables — the same input, the same page', () => {
    const input = {
      date: '2026-11-04T06:00:00Z', summary: '3 visitors today · 1 new lead', healthScore: 82,
      metrics: { traffic_today: 3, new_leads_today: 1, new_leads_week: 4, revenue_week: 1234500, bookings_week: 2 },
      sections: [{ title: '📊 Business Pulse', type: 'metrics', items: [{ label: 'Page Views (7d)', value: 40, trend: 12, unit: '%' }, { label: 'Revenue (7d)', value: 12345, format: 'currency' }] }, { title: 'Empty', items: [] }],
      actionItems: [{ priority: 'high', text: 'Books: 2 unbooked', link: '/admin/accounting' }],
    };
    const a = briefingReport(input, fmt);
    expect(a.slug).toBe(DAILY_BRIEFING_SLUG);
    expect(a.note).toBe('2026-11-04');
    const kinds = parseReport(a.content).map((s) => s.kind);
    expect(kinds).toEqual(['markdown', 'note', 'kpis', 'markdown']);
    expect(a.content).toMatch(/- 12345 kr \| Revenue \(7d\)/);
    expect(a.content).toMatch(/\| Page Views \(7d\) \| 40 \(\+12%\) \|/);
    expect(a.content).toMatch(/\| Revenue \(7d\) \| 12345 kr \|/);
    expect(a.content).toMatch(/\*\*HIGH\*\* — Books: 2 unbooked \(\[open\]\(\/admin\/accounting\)\)/);
    expect(a.content).not.toMatch(/## Empty/);
    expect(briefingReport(input, fmt).content).toBe(a.content);
  });

  it('the weekly digest: six kpis from the RPC answer, a version a week', () => {
    const w = weeklyDigestReport({ since: '2026-10-28', page_views: 120, new_leads: 3, bookings: 1, orders: 2, order_revenue_cents: 50000, invoices: 4, invoiced_cents: 990000, new_deals: 1, deal_value_cents: 2500000 }, '2026-11-06', fmt);
    expect(w.slug).toBe(WEEKLY_DIGEST_SLUG);
    expect(w.note).toBe('Week ending 2026-11-06');
    const segs = parseReport(w.content);
    const kpis = segs.find((s) => s.kind === 'kpis') as { items: Array<{ value: string; label: string }> };
    expect(kpis.items.map((i) => i.label)).toEqual(['Page views', 'New leads', 'Bookings', 'Orders', 'Invoices', 'New deals']);
    expect(kpis.items[3]).toMatchObject({ value: '2', detail: '500 kr paid' });
  });

  it('the month close: a verdict note, the checks as a table with their fix, a live block the reader can run, for accounting', () => {
    const m = monthCloseReport({
      fiscal_year: 2026, month: 10, label: '2026', period_label: 'Oct 2026', date_from: '2026-10-01', date_to: '2026-10-31', status: 'open', ready: false,
      blocking: ['no_drafts'], checks: [{ id: 'previous_month_closed', label: 'Previous month closed', pass: true }, { id: 'no_drafts', label: 'No draft entries', pass: false, detail: '2 drafts', fix: { skill: 'manage_journal_entry', tab: 'Journal' } }],
      next: { skill: 'close_accounting_period', args: { fiscal_year: 2026, period_month: 10 } },
    }, fmt);
    expect(m.slug).toBe('month-close-2026-10');
    expect(m).toMatchObject({ audience_module: 'accounting', subject_type: 'period', subject_id: '2026-10', category: 'Month close', note: '1 blocking' });
    const segs = parseReport(m.content);
    expect(segs.map((s) => s.kind)).toEqual(['markdown', 'note', 'kpis', 'markdown', 'live']);
    expect((segs[1] as { tone: string }).tone).toBe('warn');
    expect(m.content).toMatch(/\| No draft entries \| ✗ 2 drafts \| `manage_journal_entry` · Journal \|/);
    const live = segs[4] as { spec: { skill: string; args: Record<string, unknown>; kpis: unknown[]; table: unknown } };
    expect(live.spec.skill).toBe('month_close_checklist');
    expect(live.spec.args).toEqual({ p_year: 2026, p_month: 10 });
    expect(monthCloseReport({ fiscal_year: 2026, month: 9, status: 'closed', checks: [] }, fmt)).toMatchObject({ note: 'Closed', slug: monthCloseSlug(2026, 9) });
    expect(previousMonth(new Date('2026-01-15T00:00:00Z'))).toEqual({ year: 2025, month: 12 });
  });
});

describe('the wiring', () => {
  it('the reports module declares the two skills and their automations; publish_report stamps the first requester', () => {
    const names = reportsModule.skillSeeds.map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(['publish_weekly_digest', 'publish_month_close_report']));
    expect(reportsModule.automations?.map((a) => [a.name, a.skill_name])).toEqual(expect.arrayContaining([['Weekly digest report', 'publish_weekly_digest'], ['Month close report', 'publish_month_close_report']]));
    const exec = read('supabase/functions/agent-execute/index.ts');
    expect(exec).toMatch(/if \(skillName === 'publish_weekly_digest' \|\| skillName === 'publish_month_close_report'\) \{\s+return await executeScheduledReport\(/);
    expect(exec).toMatch(/supabase\.rpc\('weekly_business_digest', \{ p_period: 'week', p_format: 'json' \}\)/);
    expect(exec).toMatch(/supabase\.rpc\('month_close_checklist', \{ p_year: year, p_month: month \}\)/);
    expect(exec).toMatch(/mods\.accounting\?\.enabled !== true\) return \{ skipped:/);
    expect(exec).toMatch(/await markRequester\(supabase, published, viewer\);\s+return published;/);
    expect(exec).toMatch(/supabase\.rpc\('report_mark_requester', \{ p_slug: slug, p_user: viewer \}\)/);
    expect(exec).toMatch(/p_mine: args\.mine === true,/);
  });

  it('the briefing publishes itself as a page and links to it, never failing the briefing', () => {
    const b = read('supabase/functions/flowpilot-lifecycle/briefing.ts');
    expect(b).toMatch(/const page = briefingReport\(/);
    expect(b).toMatch(/supabase\.rpc\('report_publish', \{[\s\S]*p_slug: page\.slug,[\s\S]*p_audience_module: 'flowpilot',[\s\S]*p_published_by_kind: 'flowpilot',/);
    expect(b).toMatch(/if \(reportUrl\) lines\.push\(``, `📄 \[Read it as a page\]\(\$\{reportUrl\}\)/);
    expect(b).toMatch(/reportUrl: reportUrl \? `\$\{siteOrigin\}\$\{reportUrl\}` : undefined,/);
    expect(b).toMatch(/Read this briefing as a page/);
    expect(b).toMatch(/console\.warn\('\[briefing\] reports step skipped:'/);
  });

  it('"Mine" on Reports is the shared lens over the first requester — a filter, not a policy', () => {
    expect(OWNERSHIP.reports.column).toBe('requested_by_user_id');
    const rows = [{ slug: 'a', requested_by_user_id: 'u1' }, { slug: 'b', requested_by_user_id: null }, { slug: 'c', requested_by_user_id: 'u2' }];
    expect(applyLens(rows, 'reports', 'mine', 'u1').map((r) => r.slug)).toEqual(['a']);
    expect(applyLens(rows, 'reports', 'mine', 'u1', ['u2']).map((r) => r.slug)).toEqual(['a', 'c']);
    expect(applyLens(rows, 'reports', 'all', 'u1')).toHaveLength(3);
    const page = read('src/pages/admin/ReportsPage.tsx');
    expect(page).toMatch(/applyLens\(reports\.filter\(\(r\) => !audience \|\| r\.audience_module === audience\), 'reports', lens, uid, coveredUids\)/);
    expect(page).toMatch(/<LensToggle \/>/);
    const sql = read('supabase/migrations/20261104200000_reports-requester-and-mine.sql');
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS requested_by_user_id uuid/);
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.report_list\(text, text, boolean, text, text, integer, uuid\);/);
    expect(sql).toMatch(/AND \(NOT coalesce\(p_mine, false\) OR \(v_viewer IS NOT NULL AND r\.requested_by_user_id = v_viewer\)\)/);
    // Reading stays the role matrix's: nothing here touches can_read_report or a policy.
    expect(sql).not.toMatch(/CREATE POLICY|FUNCTION public\.can_read_report/);
  });
});
