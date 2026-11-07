/**
 * Reports (2026-11-03): what FlowPilot, Flowwork and an external agent worked
 * out, as a versioned page staff open under Reports. The rules these tests
 * hold:
 *   - the three agent paths reach it: the skills are in the module, Flowwork's
 *     read surface runs the reads and stages the publish, the handler stamps
 *     WHO published (never a model) and whose roles narrow a read;
 *   - agents add, never take away: no archive/restore/rename skill, and the
 *     person_* functions refuse the service role by name;
 *   - reading is the role matrix: RLS through can_read_report (the module,
 *     narrowed by the report's audience_module);
 *   - the report dialect parses as AgentReports writes it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { reportsModule } from '@/lib/modules/reports-module';
import { parseReport, resolvePath, validateLiveSpec } from '@/lib/report-blocks';
import { overviewDashboard } from '../../../supabase/functions/_shared/reports/overview';
import { classifyCall } from '../../../supabase/functions/_shared/skills/read-surface';

const SQL = readFileSync('supabase/migrations/20261103150000_agent-reports.sql', 'utf8');
const EXEC = readFileSync('supabase/functions/agent-execute/index.ts', 'utf8');
const handlerFn = EXEC.slice(EXEC.indexOf('async function executeReportsAction('), EXEC.indexOf('async function executeFeedbackAction('));

function fnBody(name: string): string {
  const a = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  return SQL.slice(a, SQL.indexOf('$$;', a));
}

describe('the agent paths', () => {
  const names = (reportsModule.skillSeeds ?? []).map((s) => s.name);

  it('publish, list, read, versions and details — and nothing that takes away', () => {
    expect(names.sort()).toEqual(['get_report', 'list_report_versions', 'list_reports', 'publish_month_close_report', 'publish_overview_dashboard', 'publish_report', 'publish_weekly_digest', 'update_report_details']);
    expect(names.some((n) => /archive|restore|delete|rename/.test(n))).toBe(false);
    for (const s of reportsModule.skillSeeds ?? []) expect(s.handler).toBe('internal:reports');
  });

  it('Flowwork runs the reads and stages a publish for the person to approve', () => {
    for (const n of ['list_reports', 'get_report', 'list_report_versions']) expect(classifyCall(n, {}), n).toBe('read');
    expect(classifyCall('publish_report', {})).toBe('stage');
  });

  it('the handler stamps who published and whose roles narrow a read — never from the model\'s args', () => {
    expect(EXEC).toMatch(/'internal:reports': [\s\S]{0,200}agent_type, caller_agent_name, attended_user_id: attendedUserId/);
    expect(handlerFn).toMatch(/p_published_by: by, p_published_by_kind: kind/);
    expect(handlerFn).toMatch(/const viewer = ctx\.attended_user_id \?\? null/);
    expect(handlerFn).not.toMatch(/args\.(viewer|published_by|p_viewer)/);
    // The external agent's name is the gateway's (a2a_peers), not its own claim.
    expect(handlerFn).toMatch(/kind === 'mcp' \? \(ctx\.caller_agent_name \|\| 'External agent'\)/);
  });

  it('the MCP gateway can show the skills (content group)', () => {
    expect(readFileSync('supabase/functions/_shared/mcp/groups.ts', 'utf8')).toMatch(/"wiki", "reports"/);
  });
});

describe('agents add, never take away', () => {
  it('every person_* function refuses the service role by name and needs a signed-in person', () => {
    for (const fn of ['report_person_archive', 'report_person_restore_version', 'report_person_set_details']) {
      const body = fnBody(fn);
      expect(body, fn).toMatch(/IF auth\.role\(\) = 'service_role' THEN\s+RAISE EXCEPTION/);
      expect(body, fn).toMatch(/auth\.uid\(\) IS NULL OR NOT public\.can_access_module\(auth\.uid\(\), 'reports'\)/);
      expect(SQL, fn).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, service_role;`));
    }
  });

  it('a publish never overwrites: a version per publish, identical content adds none, a stale write is refused, a person\'s fields are kept', () => {
    const body = fnBody('report_publish');
    expect(body).toMatch(/INSERT INTO public\.report_versions/);
    expect(body).not.toMatch(/UPDATE public\.report_versions|DELETE FROM public\.report/);
    expect(body).toMatch(/'unchanged', true/);
    expect(body).toMatch(/'code', 'STALE_VERSION'/);
    expect(body).toMatch(/'title' = ANY \(locked_fields\) THEN title/);
  });
});

describe('reading is the role matrix', () => {
  it('RLS reads through can_read_report: the reports module, narrowed by audience_module', () => {
    expect(fnBody('can_read_report')).toMatch(/can_access_module\(_user_id, 'reports'\)\s+AND \(_audience_module IS NULL OR public\.can_access_module\(_user_id, _audience_module\)\)/);
    expect(SQL).toMatch(/ON public\.reports\s+FOR SELECT TO authenticated\s+USING \(public\.can_read_report\(auth\.uid\(\), audience_module\)\)/);
    expect(SQL).not.toMatch(/ON public\.reports\s+FOR (INSERT|UPDATE|DELETE|ALL)/);
  });

  it('every functional role may open Reports (what each sees is narrowed per report)', () => {
    expect(SQL).toMatch(/INSERT INTO public\.role_module_access_defaults[\s\S]*'reports'/);
  });

  it('the module is on by default, in the menu, routed, and in the showcase template', () => {
    const modules = readFileSync('src/hooks/useModules.tsx', 'utf8');
    expect(modules).toMatch(/reports: \{\s+enabled: true,/);
    expect(readFileSync('src/components/admin/adminNavigation.ts', 'utf8')).toMatch(/href: "\/admin\/reports", icon: FileBarChart, moduleId: "reports"/);
    expect(readFileSync('src/App.tsx', 'utf8')).toMatch(/path: "\/admin\/reports\/:slug"/);
  });
});

describe('the report dialect (AgentReports\')', () => {
  const src = `# Q3
What the quarter cost.

::kpis
- 3 752 294 kr | Total cost | +8 % on Q2
- 249 | invoices
::

::note warn
252 832 kr is not in the books yet.
::

\`\`\`chart stacked title="Cost per month" unit="kr"
Month, Transport, Storage
2026-08, 298000, 84000
2026-09, 312 000, 86000
\`\`\`

::details Method
From accounting_reports.
::

::note
never closed`;

  it('a pie: one slice per row, the first series its size; the reader draws it', () => {
    const segs = parseReport('```chart pie title="Cost by kind"\nKind, Share\nTransport, 610000\nStorage, 170000\n```');
    expect(segs[0]).toMatchObject({ kind: 'chart', type: 'pie', title: 'Cost by kind', axis: 'Kind', series: ['Share'] });
    expect((segs[0] as { rows: unknown[] }).rows).toEqual([{ Kind: 'Transport', Share: 610000 }, { Kind: 'Storage', Share: 170000 }]);
    expect(validateLiveSpec({ skill: 'check_books', chart: { type: 'pie', rows: 'r', axis: 'a', series: ['s'] } }).errors).toEqual([]);
    expect(validateLiveSpec({ skill: 'check_books', chart: { type: 'donut', rows: 'r', axis: 'a', series: ['s'] } }).errors.join()).toMatch(/bar \| stacked \| line \| pie/);
    const body = readFileSync('src/components/admin/reports/ReportBody.tsx', 'utf8');
    expect(body).toMatch(/type === 'pie'[\s\S]*<PieChart>[\s\S]*nameKey=\{axis\}/);
    // The skill says charts exist before the guide is read (Law 2).
    expect(reportsModule.skillSeeds.find((x) => x.name === 'publish_report')?.description).toMatch(/bar \/ stacked \/ line \/ pie charts/);
  });

  it('parses kpis, notes, charts and details; an unclosed block stays text', () => {
    const segs = parseReport(src);
    expect(segs.map((s) => s.kind)).toEqual(['markdown', 'kpis', 'note', 'chart', 'details', 'markdown']);
    const kpis = segs[1] as Extract<ReturnType<typeof parseReport>[number], { kind: 'kpis' }>;
    expect(kpis.items[0]).toEqual({ value: '3 752 294 kr', label: 'Total cost', detail: '+8 % on Q2' });
    expect(kpis.items[1]).toEqual({ value: '249', label: 'invoices' });
    expect(segs[2]).toMatchObject({ kind: 'note', tone: 'warn' });
    const chart = segs[3] as Extract<ReturnType<typeof parseReport>[number], { kind: 'chart' }>;
    expect(chart).toMatchObject({ type: 'stacked', title: 'Cost per month', unit: 'kr', axis: 'Month', series: ['Transport', 'Storage'] });
    expect(chart.rows[1]).toEqual({ Month: '2026-09', Transport: 312000, Storage: 86000 });
    expect(segs[4]).toMatchObject({ kind: 'details', summary: 'Method' });
    expect((segs[5] as { text: string }).text).toContain('never closed');
  });

  it('an HTML report runs sandboxed: scripts, but no origin — no session, no admin API', () => {
    const body = readFileSync('src/components/admin/reports/ReportBody.tsx', 'utf8');
    expect(body).toMatch(/sandbox="allow-scripts"/);
    expect(body).not.toMatch(/allow-same-origin/);
  });
});

describe('live blocks — figures fetched when the report is opened (a dashboard)', () => {
  const live = (o: unknown) => '```live\n' + JSON.stringify(o) + '\n```';

  it('parses a live block, and a malformed one becomes a visible invalid segment', () => {
    const segs = parseReport(`# D\n${live({ skill: 'check_books', kpis: [{ path: 'summary.total', label: 'Open' }] })}\n${'```live\n{skill: x}\n```'}`);
    expect(segs.map((x) => x.kind)).toEqual(['markdown', 'live', 'invalid']);
    expect(segs[1]).toMatchObject({ kind: 'live', spec: { skill: 'check_books', args: {} } });
  });

  it('validation names what is wrong, in words an agent can fix', () => {
    expect(validateLiveSpec({ skill: 'check_books' }).errors.join()).toMatch(/kpis, chart or table/);
    expect(validateLiveSpec({ skill: 'Bad Name', kpis: [{ path: 'a', label: 'b' }] }).errors.join()).toMatch(/skill/);
    expect(validateLiveSpec({ skill: 'x', chart: { rows: 'r', axis: 'a', series: [] } }).errors.join()).toMatch(/chart/);
    expect(validateLiveSpec({ skill: 'x', kpis: [{ path: 'a', label: 'b', divide: 0 }] }).errors.join()).toMatch(/divide/);
    expect(validateLiveSpec({ skill: 'x', table: { rows: 'r', columns: [{ path: 'a', label: 'A' }] } }).spec?.table?.rows).toBe('r');
  });

  it('paths reach into the answer, lists by index', () => {
    const data = { summary: { total: 22 }, rows: [{ amount: 5 }] };
    expect(resolvePath(data, 'summary.total')).toBe(22);
    expect(resolvePath(data, 'rows.0.amount')).toBe(5);
    expect(resolvePath(data, 'nope.deeper')).toBeUndefined();
  });

  it('opening a report can never write: agent-execute refuses a read_only run of anything but a read', () => {
    expect(EXEC).toMatch(/if \(readOnlyRun === true && classifyCall\(skill\.name, args as Record<string, unknown>\) !== 'read'\)/);
    expect(EXEC).toMatch(/code: 'READ_ONLY_RUN'/);
    const body = readFileSync('src/components/admin/reports/ReportBody.tsx', 'utf8');
    expect(body).toMatch(/agent_type: 'admin_ui', read_only: true/);
  });

  it('a publish checks live blocks with the same parser: malformed, unknown or writing skills refuse it', () => {
    expect(handlerFn).toMatch(/parseReport\(content\)/);
    expect(handlerFn).toMatch(/code: 'LIVE_BLOCK_INVALID'/);
    expect(handlerFn).toMatch(/classifyCall\(x\.spec\.skill, x\.spec\.args\) !== 'read'/);
    expect(EXEC).toMatch(/import \{ parseReport \} from '\.\.\/_shared\/reports\/blocks\.ts'/);
  });
});

describe('the overview dashboard — published by FlowPilot, live, in the site\'s language', () => {
  it('is all live blocks that parse, books only when accounting is on, in Swedish or English', () => {
    const sv = overviewDashboard('sv', { accounting: true });
    expect(sv).toMatchObject({ slug: 'overview', title: 'Läget just nu' });
    const segs = parseReport(sv.content);
    expect(segs.filter((x) => x.kind === 'invalid')).toEqual([]);
    expect(segs.filter((x) => x.kind === 'live').map((x) => (x as { spec: { skill: string } }).spec.skill)).toEqual(['check_books', 'check_books', 'check_operations']);
    const en = overviewDashboard('en-GB', { accounting: false });
    expect(en.title).toBe('The state of things');
    expect(parseReport(en.content).filter((x) => x.kind === 'live').map((x) => (x as { spec: { skill: string } }).spec.skill)).toEqual(['check_operations']);
    // Pure: the same input is the same report, so a daily run adds no version.
    expect(overviewDashboard('sv', { accounting: true }).content).toBe(sv.content);
  });

  it('counts a list with .length (operations has findings, no summary)', () => {
    expect(resolvePath({ findings: [1, 2, 3] }, 'findings.length')).toBe(3);
  });

  it('a daily automation keeps it present, and an admin can create it from Reports', () => {
    const mod = readFileSync('src/lib/modules/reports-module.ts', 'utf8');
    expect(mod).toMatch(/skill_name: 'publish_overview_dashboard'/);
    expect(mod).toMatch(/automations: REPORT_AUTOMATIONS/);
    expect(readFileSync('src/pages/admin/ReportsPage.tsx', 'utf8')).toMatch(/callSkill<\{ slug\?: string \}>\('publish_overview_dashboard'\)/);
    expect(handlerFn).toMatch(/skillName === 'publish_overview_dashboard'[\s\S]*overviewDashboard\(lang, \{ accounting: mods\.accounting\?\.enabled === true \}\)/);
  });
});

describe('reports where they belong — on the subject\'s page, in the accounting workspace', () => {
  it('a subject with a page links there; one without has no link', async () => {
    const { subjectHref } = await import('@/lib/report-subjects');
    expect(subjectHref('company', 'c1')).toBe('/admin/companies/c1');
    expect(subjectHref('Deal', 'd1')).toBe('/admin/deals/d1');
    expect(subjectHref('project', 'p1')).toBe('/admin/projects?project=p1');
    expect(subjectHref('fiscal_year', '2026')).toBeNull();
    expect(subjectHref(null, 'x')).toBeNull();
  });

  it('the company, deal and project pages show their reports', () => {
    expect(readFileSync('src/pages/admin/CompanyDetailPage.tsx', 'utf8')).toMatch(/<SubjectReports subjectType="company"/);
    expect(readFileSync('src/pages/admin/DealDetailPage.tsx', 'utf8')).toMatch(/<SubjectReports subjectType="deal"/);
    expect(readFileSync('src/pages/admin/ProjectsPage.tsx', 'utf8')).toMatch(/<SubjectReports subjectType="project"/);
    // Read through RLS like the list — the role matrix decides, no service path.
    const hook = readFileSync('src/hooks/useReports.ts', 'utf8');
    expect(hook).toMatch(/export function useSubjectReports[\s\S]*\.eq\('subject_type', subjectType\)[\s\S]*\.eq\('status', 'active'\)/);
  });

  it('publish stores one spelling of the subject kind, so the page finds it', () => {
    expect(EXEC).toMatch(/const subjectType = \(\) => s\('subject_type'\)\?\.toLowerCase\(\)\.replace\(\/\[\\s-\]\+\/g, '_'\)/);
    expect(EXEC).toMatch(/p_subject_type: subjectType\(\), p_subject_id: s\('subject_id'\)/);
    expect(EXEC).not.toMatch(/p_subject_type: s\('subject_type'\)/);
  });

  it('the accounting workspace lists the reports written for the books', () => {
    expect(readFileSync('src/lib/workspaces.ts', 'utf8')).toMatch(/href: '\/admin\/reports\?for=accounting', moduleId: 'reports'/);
    expect(readFileSync('src/pages/admin/ReportsPage.tsx', 'utf8')).toMatch(/r\.audience_module === audience/);
  });
});
