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
import { parseReport } from '@/lib/report-blocks';
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
    expect(names.sort()).toEqual(['get_report', 'list_report_versions', 'list_reports', 'publish_report', 'update_report_details']);
    expect(names.some((n) => /archive|restore|delete|rename/.test(n))).toBe(false);
    for (const s of reportsModule.skillSeeds ?? []) expect(s.handler).toBe('internal:reports');
  });

  it('Flowwork runs the reads and stages a publish for the person to approve', () => {
    for (const n of ['list_reports', 'get_report', 'list_report_versions']) expect(classifyCall(n, {}), n).toBe('read');
    expect(classifyCall('publish_report', {})).toBe('stage');
  });

  it('the handler stamps who published and whose roles narrow a read — never from the model\'s args', () => {
    expect(EXEC).toMatch(/handler === 'internal:reports'[\s\S]{0,200}agent_type, caller_agent_name, attended_user_id: attendedUserId/);
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
