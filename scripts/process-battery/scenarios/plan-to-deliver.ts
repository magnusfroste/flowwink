import type { Scenario, ScenarioModule } from '../lib';

/**
 * Plan-to-Deliver: three workstreams, none of them with a due date on anything —
 * the way the optic team works. One task waits on an unfinished one, one is
 * urgent, one project is calm. The end state that must hold: the verdict sees the
 * blocked and the urgent work WITHOUT any dates, the calm project is left alone,
 * the agent's brief and the project view say the same thing, finishing the
 * prerequisite lifts the block, and the team order is shared and sticks.
 */
async function run(s: Scenario): Promise<void> {
  // "Since last Tuesday": the meeting is the moment everything below happens after.
  const meetingAt = new Date(Date.now() - 1000).toISOString();
  const project = async (name: string) =>
    s.idOf(await s.must(`the ${name} workstream exists`, 'manage_project', { action: 'create', name: `${name} ${s.tag}` }), 'project');
  const legal = await project('Legal');
  const finance = await project('Finance');
  const calm = await project('Team');
  const offsite = await project('Offsite 2025');
  await s.must('a finished workstream is closed', 'manage_project', { action: 'close', project_id: offsite });
  s.equal('closing marks it completed and inactive',
    (await s.one<{ v: string }>(`select status || '|' || is_active as v from projects where id = $1`, [offsite]))?.v, 'completed|false');

  const task = async (projectId: string, title: string, extra: Record<string, unknown> = {}) =>
    s.idOf(await s.must(`task "${title}" is planned`, 'manage_project_task', { action: 'create', project_id: projectId, title: `${title} ${s.tag}`, ...extra }), 'task');
  const prereq = await task(legal, 'Board minutes signed');
  const waits = await task(legal, 'Register with Bolagsverket');
  await s.must('registering waits for the signed minutes', 'manage_task_dependency', {
    p_action: 'add', p_task_id: waits, p_depends_on_task_id: prereq,
  });
  await task(finance, 'Close Q3 VAT', { priority: 'urgent' });
  await task(calm, 'Book the offsite');

  const undated = await s.one<{ n: string }>(
    `select count(*) as n from project_tasks where project_id = any($1::uuid[]) and due_date is not null`, [[legal, finance, calm]]);
  s.equal('no task carries a due date — the team does not work with dates', undated?.n, 0);

  type Row = { project_id: string; blocked: number; urgent: number; overdue: number; attention: { needs_attention: boolean; weight: number; reasons: Array<{ kind: string; count: number }> } };
  const read = async () => {
    const out = await s.must('what needs attention is read', 'project_attention', {});
    const rows = (out.projects ?? []) as Row[];
    return (id: string) => rows.find((r) => r.project_id === id);
  };

  let at = await read();
  s.equal('the blocked task is seen without any date', at(legal)?.blocked, 1);
  s.equal('…and the legal workstream needs attention', at(legal)?.attention.needs_attention, true);
  s.equal('the urgent task is seen', at(finance)?.urgent, 1);
  s.equal('…and it is the first reason given', at(finance)?.attention.reasons[0]?.kind, 'urgent');
  s.equal('the calm workstream is left alone', at(calm)?.attention.needs_attention, false);
  s.check('urgent weighs more than blocked', (at(finance)?.attention.weight ?? 0) > (at(legal)?.attention.weight ?? 0),
    `${at(finance)?.attention.weight} vs ${at(legal)?.attention.weight}`);
  s.equal('nothing is overdue — undated is never overdue', (at(legal)?.overdue ?? 0) + (at(finance)?.overdue ?? 0), 0);

  const brief = await s.must('the agent reads its portfolio brief', 'project_portfolio_brief', { p_project_id: legal });
  const briefLegal = ((brief.projects ?? []) as Array<{ id: string; attention: { needs_attention: boolean; weight: number } }>)[0];
  s.equal('the brief and the project view give the same verdict', briefLegal?.attention.needs_attention, at(legal)?.attention.needs_attention);
  s.equal('…with the same weight', briefLegal?.attention.weight, at(legal)?.attention.weight);

  // ── An agent can work the tasks it planned ─────────────────────────────
  // manage_project_task declares task_id; the table-derived key was project_task_id,
  // so update/move/complete all answered "id is required".
  const listed = await s.must('the legal tasks are listed', 'manage_project_task', { action: 'list', project_id: legal, limit: 500 });
  const listedItems = (listed.items ?? []) as Array<{ project_id: string }>;
  s.equal('a list by project holds only that project\'s tasks', listedItems.every((i) => i.project_id === legal) && listedItems.length === 2, true);
  const found = await s.must('the workstreams are searched', 'manage_project', { action: 'search', search: `Legal ${s.tag}` });
  s.equal('a search finds the one it names', ((found.items ?? []) as unknown[]).length, 1);
  await s.must('the minutes are started', 'manage_project_task', { action: 'move', task_id: prereq, status: 'in_progress' });
  s.equal('moving by task_id moves the task', (await s.one<{ status: string }>('select status::text from project_tasks where id = $1', [prereq]))?.status, 'in_progress');
  await s.must('the minutes are signed', 'manage_project_task', { action: 'complete', task_id: prereq });
  s.equal('completing by task_id completes it, stamped',
    (await s.one<{ v: string }>(`select status::text || '|' || (completed_at is not null) as v from project_tasks where id = $1`, [prereq]))?.v, 'done|true');
  at = await read();
  s.equal('a finished prerequisite no longer blocks', at(legal)?.blocked, 0);
  s.equal('…and the legal workstream is calm again', at(legal)?.attention.needs_attention, false);

  // ── The team order ─────────────────────────────────────────────────────
  const order = async () => new Map((await s.sql<{ id: string; sort_order: number }>(
    'select id, sort_order from projects where id = any($1::uuid[])', [[legal, finance, calm]])).map((r) => [r.id, Number(r.sort_order)]));
  const born = await order();
  s.check('the newest project is on top of the team order', born.get(calm)! < born.get(finance)! && born.get(finance)! < born.get(legal)!, JSON.stringify([...born]));
  const moved = await s.must('finance is put first on the agenda, then legal, then team', 'reorder_projects', { p_project_ids: [finance, legal, calm] });
  s.equal('three projects are in the order asked for', ((moved.order ?? []) as unknown[]).length, 3);
  const after = await order();
  s.check('the order sticks', after.get(finance)! < after.get(legal)! && after.get(legal)! < after.get(calm)!, JSON.stringify([...after]));
  const others = await s.one<{ n: string }>(
    `select count(*) as n from projects where id <> all($1::uuid[]) and sort_order <= $2`, [[legal, finance, calm], after.get(calm)]);
  s.equal('no other project jumped in front of the three', others?.n, 0);
  await s.mustRefuse('a project cannot stand in two places', 'reorder_projects', { p_project_ids: [legal, legal] }, /duplicate|one place/i);
  const newest = await project('Listing');
  const withNew = await order();
  const newOrder = (await s.one<{ o: number }>('select sort_order as o from projects where id = $1', [newest]))?.o;
  s.check('a project created after the reorder still lands on top', Number(newOrder) < withNew.get(finance)!, `${newOrder} vs ${withNew.get(finance)}`);

  // ── What changed since the meeting ─────────────────────────────────────
  // The optic team kept a hand-made daily snapshot of every task to answer this.
  // The ledger every writer feeds answers it: created, completed, moved, the
  // dependency, an agent's comment, a reprioritisation, a deletion with its name.
  await s.must('the agent reports on the registration task', 'comment_on_task', { task_id: waits, body: 'Waiting for the signed minutes to arrive', kind: 'step' });
  await s.must('the VAT task is downgraded', 'manage_project_task', { action: 'update', task_id: (await s.one<{ id: string }>(`select id from project_tasks where project_id = $1`, [finance]))!.id, priority: 'high' });
  const gone = await task(legal, 'Draft the press release');
  await s.must('a task planned by mistake is removed', 'manage_project_task', { action: 'delete', task_id: gone });
  const quiet = await project('Quiet');

  type Change = { project_id: string; coverage: string; counts: Record<string, number>; deleted: Array<{ title: string }>; comments: Array<{ author_type: string; kind: string }>; moved: Array<{ from: string; to: string }> };
  const digest = await s.must('what changed since the meeting is read', 'project_changes', { p_since: meetingAt });
  const changed = new Map(((digest.projects ?? []) as Change[]).map((c) => [c.project_id, c]));
  const l = changed.get(legal);
  s.equal('legal: three tasks were created', l?.counts.created, 3);
  s.equal('legal: one was completed', l?.counts.completed, 1);
  s.equal('legal: one was moved — todo to in progress', l?.moved[0] && `${l.moved[0].from}>${l.moved[0].to}`, 'todo>in_progress');
  s.equal('legal: the dependency counts', l?.counts.dependencies, 1);
  s.equal('legal: the deleted task keeps its name', l?.deleted[0]?.title, `Draft the press release ${s.tag}`);
  s.equal('legal: the agent\'s step is there, marked as an agent\'s', l?.comments[0] && `${l.comments[0].author_type}/${l.comments[0].kind}`, 'agent/step');
  s.equal('legal: a project born inside the window has full coverage', l?.coverage, 'full');
  s.equal('finance: the reprioritisation counts', changed.get(finance)?.counts.reprioritised, 1);
  const quietIds = ((digest.quiet ?? []) as Array<{ project_id: string }>).map((q) => q.project_id);
  s.check('the untouched project is named as quiet, not dropped', quietIds.includes(quiet), quietIds.length.toString());
  s.check('a closed project is not called quiet', !quietIds.includes(offsite), 'offsite listed');
  s.check('projects come in the team order — finance before legal', [...changed.keys()].indexOf(finance) < [...changed.keys()].indexOf(legal), [...changed.keys()].join(','));
  const nothing = await s.must('a window that opens now is read', 'project_changes', { p_project_id: legal, p_since: new Date().toISOString() });
  s.equal('…and lists nothing', ((nothing.projects ?? []) as Change[])[0]?.counts.created, 0);
  const refused = async (query: string) => {
    try { await s.sql(query, [legal]); return ''; } catch (e) { return (e as Error).message; }
  };
  s.check('the ledger refuses an edit', /never edited/.test(await refused(`update project_task_events set new_value = 'todo' where project_id = $1 and kind = 'status'`)));
  s.check('the ledger refuses a deletion', /never deleted/.test(await refused(`delete from project_task_events where project_id = $1`)));

  // ── A priority means what the team says it means ───────────────────────
  // The scale existed and nobody used it (66 of 70 on medium): no screen set
  // it, and "high" had no words. The words are the team's, read by the picker
  // and by the agent in the same function; the verdict reads the level.
  const before = await s.must('the priority guide is read', 'project_priority_guide', {});
  s.check('the guide has a default for every level', ['low', 'medium', 'high', 'urgent'].every((k) => typeof before[k] === 'string' && (before[k] as string).length > 0));
  const urgentWords = `Blockerar R/B, IPO eller lönsamhet ${s.tag}`;
  const set = await s.must('the team defines urgent in its own words', 'set_project_priority_guide', { p_guide: { urgent: urgentWords } });
  s.equal('the answer carries the new wording', (set.priority_guide as Record<string, string>)?.urgent, urgentWords);
  const attention = await s.must('the verdict is read again', 'project_attention', {});
  s.equal('project_attention carries the guide the picker shows', (attention.priority_guide as Record<string, string>)?.urgent, urgentWords);
  s.equal('…without touching the other levels', (attention.priority_guide as Record<string, string>)?.low, before.low);
  const briefAll = await s.must('the agent reads the brief', 'project_portfolio_brief', {});
  s.equal('the brief carries the same guide', (briefAll.priority_guide as Record<string, string>)?.urgent, urgentWords);
  await s.mustRefuse('a level outside the scale is refused', 'set_project_priority_guide', { p_guide: { critical: 'x' } }, /not a priority/);
  const highTask = await task(finance, 'Prepare the audit binder', { priority: 'high' });
  s.equal('a task can be planned at high', (await s.one<{ p: string }>('select priority::text as p from project_tasks where id = $1', [highTask]))?.p, 'high');
  await s.must('…and moved to urgent when it starts to block', 'manage_project_task', { action: 'update', task_id: highTask, priority: 'urgent' });
  at = await read();
  // Finance's original urgent task was downgraded to high above, so this is the only one.
  s.equal('urgent counts in the verdict; high did not', at(finance)?.urgent, 1);
  await s.must('the wording is returned to the default', 'set_project_priority_guide', { p_guide: { urgent: '' } });
  s.equal('an empty string restores the default', ((await s.must('the guide is read once more', 'project_priority_guide', {})).urgent as string), before.urgent);
}

export default { process: 'plan-to-deliver', run } satisfies ScenarioModule;
