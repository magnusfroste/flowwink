import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { objectOf, latestChanges, OBJECT_ROUTES, type ChangeRow, mergeFlags, type CheckFinding, workByArea, agentNameOf, summarizeAgentWork, openQuestionTasks, stopReason, isAgentCall, agentLabel, type AgentActivityRow, type TaskCommentRow } from '@/lib/agent-work';

/**
 * Agent work, in plain words (#869). The panel shows an owner what waits on a
 * person and where an agent was stopped. These pin the reading: who counts as
 * an agent, what counts as waiting, and that an off module stays quiet.
 */
const row = (o: Partial<AgentActivityRow>): AgentActivityRow => ({
  id: Math.random().toString(36).slice(2), agent: 'mcp', skill_name: 'manage_lead', status: 'success',
  error_message: null, output: null, created_at: '2026-11-10T09:00:00Z', ...o,
});
const comment = (o: Partial<TaskCommentRow>): TaskCommentRow => ({
  task_id: 't1', project_id: 'p1', kind: 'comment', author_type: 'person', author_name: null, created_at: '2026-11-10T09:00:00Z', ...o,
});
const base = { comments: [], stagedCount: 0, todayStart: '2026-11-10T00:00:00Z', shown: () => true };

describe('agent work', () => {
  it('a person at the admin and the scheduler are not agents', () => {
    expect(isAgentCall({ agent: 'mcp' })).toBe(true);
    expect(isAgentCall({ agent: 'flowpilot' })).toBe(true);
    for (const a of ['admin_ui', 'cron', 'system', 'automation', '', null]) expect(isAgentCall({ agent: a })).toBe(false);
    expect(agentLabel('mcp')).toBe('Connected agent');
    expect(agentLabel('hermes')).toBe('Hermes');
  });

  it('counts today, and the week\'s refused and failed apart', () => {
    const s = summarizeAgentWork({
      ...base,
      activity: [
        row({ agent: 'flowpilot' }), row({ agent: 'mcp' }), row({ agent: 'mcp' }),
        row({ created_at: '2026-11-08T09:00:00Z' }),                    // success, not today
        row({ status: 'refused', output: { status: 'refused', code: 'MODULE_DISABLED' }, created_at: '2026-11-09T09:00:00Z' }),
        row({ status: 'failed', error_message: 'period is locked\nstack…', created_at: '2026-11-10T08:00:00Z' }),
        row({ agent: 'cron', status: 'failed' }),                       // the automation widget's
        row({ agent: 'admin_ui' }),                                     // a person
      ],
    });
    expect(s.actionsToday).toBe(3);
    expect(s.agentsToday).toEqual(['Connected agent', 'FlowPilot']);
    expect(s.refused).toBe(1);
    expect(s.failed).toBe(1);
    expect(s.stopped.map((x) => [x.outcome, x.reason])).toEqual([['failed', 'period is locked'], ['refused', 'module disabled']]);
  });

  it('a skill of a module that is off is not shown at all', () => {
    const s = summarizeAgentWork({
      ...base,
      activity: [row({ skill_name: 'manage_webinar', status: 'failed' }), row({ skill_name: 'manage_lead', status: 'failed' })],
      shown: (skill) => skill !== 'manage_webinar',
    });
    expect(s.failed).toBe(1);
    expect(s.stopped[0].skill).toBe('manage_lead');
  });

  it('a question waits until a person writes after it', () => {
    const asked = comment({ kind: 'question', author_type: 'agent', created_at: '2026-11-09T10:00:00Z' });
    expect(openQuestionTasks([asked])).toEqual(['t1']);
    expect(openQuestionTasks([asked, comment({ created_at: '2026-11-09T09:00:00Z' })])).toEqual(['t1']); // written before
    expect(openQuestionTasks([asked, comment({ created_at: '2026-11-09T11:00:00Z' })])).toEqual([]);      // answered
    // a later step by the agent itself is not an answer; a person's own question is not an agent's
    expect(openQuestionTasks([asked, comment({ kind: 'step', author_type: 'agent', created_at: '2026-11-09T12:00:00Z' })])).toEqual(['t1']);
    expect(openQuestionTasks([comment({ kind: 'question' })])).toEqual([]);
    const s = summarizeAgentWork({ ...base, activity: [], comments: [asked, comment({ task_id: 't2', kind: 'question', author_type: 'flowpilot' })], stagedCount: 2 });
    expect([s.openQuestions, s.staged]).toEqual([2, 2]);
  });

  it('the reason is the refusal\'s code, else the error\'s first line, else says so', () => {
    expect(stopReason(row({ status: 'refused', output: { result: { code: 'READ_ONLY_KEY' } } }))).toBe('read only key');
    expect(stopReason(row({ status: 'failed', error_message: 'x'.repeat(200) })).length).toBe(88);
    expect(stopReason(row({ status: 'failed' }))).toBe('no reason recorded');
  });

  it('the panel is on the dashboard, in the admin preset, and reads the one module rule', () => {
    const root = join(__dirname, '../../..');
    expect(readFileSync(join(root, 'src/pages/admin/AdminDashboard.tsx'), 'utf-8')).toMatch(/case 'agent-work':\s+return <AgentWorkDashboardWidget/);
    // The availability map is a second list: a widget missing from it is silently never drawn.
    expect(readFileSync(join(root, 'src/pages/admin/AdminDashboard.tsx'), 'utf-8')).toMatch(/'agent-work': true,/);
    const presets = readFileSync(join(root, 'src/lib/dashboard-presets.ts'), 'utf-8');
    expect(presets).toMatch(/id: 'agent-work'/);
    expect(presets).toMatch(/admin: \[[^\]]*'agent-work'/);
    expect(readFileSync(join(root, 'src/components/admin/AgentWorkDashboardWidget.tsx'), 'utf-8')).toMatch(/skillShown\(skill, active\)/);
  });

  it('groups the week by the owning module, changes before lookups, agents by name', () => {
    const owner: Record<string, string> = { manage_lead: 'crm', manage_invoice: 'invoicing', list_invoices: 'invoicing' };
    const readers = {
      ownerOf: (n: string) => owner[n] ?? null,
      isRead: (n: string, args: Record<string, unknown>) => n.startsWith('list_') || args.action === 'list',
      agentNames: { k1: 'Hermes' },
    };
    const areas = workByArea([
      row({ skill_name: 'manage_lead', api_key_id: 'k1' }),
      row({ skill_name: 'manage_lead', api_key_id: 'k1', created_at: '2026-11-10T11:00:00Z' }),
      row({ skill_name: 'manage_lead', agent: 'flowpilot', action: 'list' }),   // a manage_* read
      row({ skill_name: 'manage_invoice', agent: 'flowpilot' }),
      row({ skill_name: 'list_invoices', agent: 'flowpilot' }),
      row({ skill_name: 'search_web', agent: 'flowpilot' }),                     // no owner: the platform's
      row({ skill_name: 'manage_lead', status: 'failed' }),                      // not work done
    ], readers);
    expect(areas.map((a) => a.module)).toEqual(['crm', 'invoicing', 'platform']);
    expect(areas[0]).toMatchObject({ changes: 2, lookups: 1, agents: ['Hermes', 'FlowPilot'], topChanges: ['manage_lead'], lastAt: '2026-11-10T11:00:00Z' });
    expect(areas[1]).toMatchObject({ changes: 1, lookups: 1 });
    // Without a read rule nothing is waved away as a lookup.
    expect(workByArea([row({ skill_name: 'list_invoices' })])[0]).toMatchObject({ module: 'platform', changes: 1, lookups: 0 });
    expect(agentNameOf({ agent: 'mcp', api_key_id: 'k1' }, { k1: 'Hermes' })).toBe('Hermes');
    expect(agentNameOf({ agent: 'mcp', api_key_id: 'k2' }, { k1: 'Hermes' })).toBe('Connected agent');
  });

  it('the summary names the connected agent and hides an off module from the areas', () => {
    const s = summarizeAgentWork({
      ...base,
      shown: (skill) => skill !== 'manage_invoice',
      readers: { ownerOf: (n) => (n === 'manage_lead' ? 'crm' : 'invoicing'), agentNames: { k1: 'Hermes' } },
      activity: [row({ api_key_id: 'k1' }), row({ skill_name: 'manage_invoice' })],
    });
    expect(s.agentsToday).toEqual(['Hermes']);
    expect(s.areas.map((a) => a.module)).toEqual(['crm']);
  });

  it('what the checks flag is one list, highest severity first, each with its fix', () => {
    const f = (o: Partial<CheckFinding>): CheckFinding => ({ id: 'x', severity: 'low', count: 1, label: 'something', ...o });
    const flags = mergeFlags({
      operations: [
        f({ id: 'quotes_without_expiry', area: 'sales', severity: 'medium', label: '2 sent quotes without a validity date', fix: { skill: 'manage_quote' } }),
        f({ id: 'urgent_unassigned', area: 'support', severity: 'high', label: '1 urgent ticket with no owner', fix: null }),
      ],
      books: [
        f({ id: 'unbooked_invoices', severity: 'high', label: '3 invoices not booked', fix: { skill: 'book_unbooked_invoices' } }),
        f({ id: 'no_label', label: '' }),                                  // malformed: dropped
      ],
    }, 2);
    expect(flags).toMatchObject({ high: 2, medium: 1, low: 0, total: 3 });
    expect(flags.top.map((x) => x.key)).toEqual(['operations:urgent_unassigned', 'books:unbooked_invoices']);
    expect(flags.top[0]).toMatchObject({ area: 'support', fixSkill: null });
    expect(flags.top[1]).toMatchObject({ area: 'books', fixSkill: 'book_unbooked_invoices' });
    // A check that was not run (module off, role refused) contributes nothing.
    expect(mergeFlags({ operations: null, books: null })).toMatchObject({ total: 0, top: [] });
  });

  it('findings of the same kind fold into one row, and stop crowding the list', () => {
    const f = (o: Partial<CheckFinding>): CheckFinding => ({ id: 'x', severity: 'high', count: 1, label: 'something', ...o });
    const filing = { skill: 'manage_statutory_filing' };
    const flags = mergeFlags({
      operations: [f({ id: 'urgent_unassigned', area: 'support', label: '3 urgent tickets with no owner', fix: { skill: 'manage_ticket' } })],
      books: [
        f({ id: 'deadline_overdue:agi-2025-09', label: 'AGI Sep 2025 not recorded as filed', fix: filing }),
        f({ id: 'deadline_overdue:agi-2025-10', label: 'AGI Oct 2025 not recorded as filed', fix: filing }),
        f({ id: 'deadline_overdue:agi-2025-11', label: 'AGI Nov 2025 not recorded as filed', fix: filing }),
        f({ id: 'deadline_overdue:vat-2025-q3', label: 'VAT Q3 not recorded as filed', severity: 'medium', fix: filing }), // another severity: its own row
        f({ id: 'unbooked_invoices', label: '2 invoices not booked', severity: 'medium', fix: { skill: 'book_unbooked_invoices' } }),
      ],
    }, 5);
    expect(flags).toMatchObject({ high: 4, medium: 2, total: 6, rows: 4 });       // every finding still counted
    expect(flags.top.map((x) => [x.key, x.same])).toEqual([
      ['operations:urgent_unassigned', 1],
      ['books:deadline_overdue:agi-2025-09', 3],                                  // the first speaks for three
      ['books:deadline_overdue:vat-2025-q3', 1],
      ['books:unbooked_invoices', 1],
    ]);
  });

  it('a reader is shown the flags of their own areas', () => {
    const f = (o: Partial<CheckFinding>): CheckFinding => ({ id: 'x', severity: 'high', count: 1, label: 'something', ...o });
    const checks = {
      operations: [f({ id: 'a', area: 'sales' }), f({ id: 'b', area: 'support' }), f({ id: 'c', area: 'automations' })],
      books: [f({ id: 'd' })],
    };
    const sales = mergeFlags(checks, 5, (area) => area === 'sales');
    expect(sales.top.map((x) => x.key)).toEqual(['operations:a']);
    expect(sales).toMatchObject({ total: 1, high: 1 });
    expect(mergeFlags(checks).total).toBe(4);                                     // an admin: everything
  });

  const U1 = '11111111-1111-4111-8111-111111111111';
  const U2 = '22222222-2222-4222-8222-222222222222';

  it('a call opens the record it was about', () => {
    expect(objectOf('manage_deal', { action: 'update', deal_id: U1 })).toEqual({ label: 'deal', href: `/admin/deals/${U1}` });
    // Several records named: the one the skill is about wins.
    expect(objectOf('manage_deal', { company_id: U2, deal_id: U1 })?.href).toBe(`/admin/deals/${U1}`);
    expect(objectOf('manage_company', { company_id: U2, deal_id: U1 })?.href).toBe(`/admin/companies/${U2}`);
    // A create sends no id: the answer's does.
    expect(objectOf('manage_deal', { action: 'create' }, { deal: U1 })?.href).toBe(`/admin/deals/${U1}`);
    expect(objectOf('manage_ticket', { action: 'create' }, { id: U1 })?.href).toBe(`/admin/tickets?ticket=${U1}`);
    expect(objectOf('manage_ticket', { action: 'create' }, { item: U1 })?.href).toBe(`/admin/tickets?ticket=${U1}`);   // result.item.id
    expect(objectOf('add_lead', { email: 'a@b.c' }, { lead_id: U1 })?.href).toBe(`/admin/leads/${U1}`);               // result.lead_id
    // result.id belongs to the skill's own record, never to another kind.
    expect(objectOf('manage_invoice', { action: 'create' }, { id: U1 })?.href).toBe(`/admin/invoices?invoice=${U1}`);
    expect(objectOf('manage_expenses', { action: 'create' }, { id: U1 })).toBeNull();
    expect(objectOf('manage_orders', { order_id: U2 })?.href).toBe(`/admin/orders?order=${U2}`);
    // A placeholder or a name is not an address.
    expect(objectOf('manage_deal', { deal_id: '<deal_id>' })).toBeNull();
    expect(objectOf('manage_deal', { deal_id: '../../settings' })).toBeNull();
    expect(objectOf('search_web', { query: 'x' })).toBeNull();
  });

  it('latest changes are the writes, newest first, with their record', () => {
    const c = (o: Partial<ChangeRow>): ChangeRow => ({ ...row({}), input: {}, ...o });
    const out = latestChanges([
      c({ id: 'a', skill_name: 'manage_deal', input: { action: 'update', deal_id: U1 }, created_at: '2026-11-10T10:00:00Z', api_key_id: 'k1' }),
      c({ id: 'b', skill_name: 'manage_deal', input: { action: 'list' }, created_at: '2026-11-10T11:00:00Z' }),   // a lookup
      c({ id: 'c', skill_name: 'write_blog_post', input: {}, created_at: '2026-11-10T12:00:00Z', agent: 'flowpilot' }),
      c({ id: 'd', skill_name: 'manage_deal', input: { deal_id: U1 }, status: 'failed' }),                        // not a change
      c({ id: 'e', skill_name: 'manage_deal', input: { deal_id: U1 }, agent: 'admin_ui' }),                       // a person
    ], { isRead: (_n, args) => args.action === 'list', agentNames: { k1: 'Hermes' } });
    expect(out.map((x) => x.id)).toEqual(['c', 'a']);
    expect(out[1]).toMatchObject({ agent: 'Hermes', action: 'update', object: { label: 'deal', href: `/admin/deals/${U1}` } });
    expect(out[0].object).toBeNull();
  });

  it('every record page the panel links to is a page the router serves', () => {
    const app = readFileSync(join(__dirname, '../../App.tsx'), 'utf-8');
    for (const r of OBJECT_ROUTES) {
      const href = r.href('ID');
      const path = href.split('?')[0].replace('/ID', '/:id');
      expect(app, `${r.param} → ${href}`).toContain(`path: "${path}"`);
      if (href.includes('?')) {
        // A list page that opens a record from its query string must read that key.
        const key = href.split('?')[1].split('=')[0];
        const page = app.match(new RegExp(`path: "${path}", element: <(\\w+)`))?.[1];
        const file = app.match(new RegExp(`const ${page} = lazy\\(\\(\\) => import\\("\\./pages/admin/([\\w/.-]+)"`))?.[1];
        expect(file, `page for ${path}`).toBeTruthy();
        // …either itself, or through the shared hook (useSelectOnQueryParam).
        const src = readFileSync(join(__dirname, `../../pages/admin/${file}.tsx`), 'utf-8');
        expect(src, `${file} reads ?${key}=`).toMatch(new RegExp(`searchParams\\.get\\('${key}'\\)|useSelectOnQueryParam\\(\\s*'${key}'`));
      }
    }
  });

  it('every list page that opens a record from its address is linked to (discovered, not listed)', () => {
    // A page that takes ?invoice=<id> exists so that something can point at it.
    // The panel said "invoices and orders have no page of their own" for a day
    // because its list was written by hand and the pages were not read.
    const dir = join(__dirname, '../../pages/admin');
    const linked = new Set(OBJECT_ROUTES.map((r) => r.href('ID')).filter((h) => h.includes('?')).map((h) => h.split('?')[1].split('=')[0]));
    const missing: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
      for (const m of readFileSync(join(dir, file), 'utf-8').matchAll(/useSelectOnQueryParam\(\s*'([a-z_]+)'/g)) {
        if (!linked.has(m[1])) missing.push(`${file}: ?${m[1]}=`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('the week of calls is read as fields — never whole arguments or answers', () => {
    // Two thousand list answers were megabytes sent to draw four numbers.
    const widget = readFileSync(join(__dirname, '../../components/admin/AgentWorkDashboardWidget.tsx'), 'utf-8');
    const big = widget.slice(widget.indexOf(".from('agent_activity' as never)"), widget.indexOf('.limit(2000)'));
    const select = big.slice(big.indexOf('.select('), big.indexOf('.gte('));
    expect(select).not.toMatch(/[`', ]output[,`' ]/);
    expect(select).not.toMatch(/[`', ]input[,`' ]/);
    expect(select).toContain('${STOP_FIELDS}');
    // …and the four fields are the ones stopReason reads.
    expect(widget).toMatch(/out_code:output->>code, out_error:output->>error, result_code:output->result->>code, result_error:output->result->>error/);
  });
});
