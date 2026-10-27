import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  didYouMeanError,
  findTasksByIdPrefix,
  isUuid,
  resolveProjectTask,
  TASK_ID_PREFIX_LENGTH,
  type ResolvedTask,
  type TaskQueryClient,
} from '../../../supabase/functions/_shared/project-task-resolve';
import { projectsModule } from '../modules/projects-module';

/**
 * Guardrail: a garbled task id answers with the task it meant.
 *
 * ── The finding (optic, 2026-10-21 and 2026-10-27) ──────────────────────────
 * FlowPilot's heartbeat (02:00 and 13:00) read the project task
 * "Revisionsberättelse" from a listing and called comment_on_task with
 *
 *     ace681ae-74cb-4897-9654-a39fed57cee1      what the model sent
 *     ace681ae-74cb-4890-ab2e-aebe852895dd      the task's real id
 *
 * (a later heartbeat sent `ace681ae-74cb-4891-9f91-…`). The model reproduces
 * the first half of a uuid it just saw and improvises the tail. The OLD
 * handler answered
 *
 *     { success: false, error: "no task ace681ae-74cb-4897-9654-a39fed57cee1" }
 *
 * — a dead end — so the loop retried three times per heartbeat and never got
 * a word onto the card. Peter's Hermes agent once sent a uuid with one extra
 * character (`…aaf55`) and got Postgres' own
 *
 *     invalid input syntax for type uuid: "…"
 *
 * through the generic manage_project_task path, which is just as blind.
 * Neither old shape names the task, so neither is accepted below.
 *
 * ── What is pinned ──────────────────────────────────────────────────────────
 *  1. The prefix lookup: the first 13 characters (`ace681ae-74cb`) as a uuid
 *     RANGE (gte/lte), never an ILIKE on `id::text` (PostgREST does not cast
 *     a filter column: "operator does not exist: uuid ~~*", 2026-07-22).
 *  2. The did-you-mean message shape:
 *     `no task <sent> — did you mean <id> ("<title>")? Re-send with that id.`
 *  3. No silent action on a guess: ONE candidate still answers ok:false, and
 *     the handler writes the comment only on the resolver's ok branch.
 *  4. The invalid-uuid pre-check: a malformed id never reaches Postgres
 *     (no `.eq('id', …)`) and answers the same way, coded INVALID_INPUT.
 *  5. The skill seed carries task_title as the documented alternative, with
 *     the id from a listing preferred.
 */

const ROOT = process.cwd();
const HANDLER = readFileSync(join(ROOT, 'supabase/functions/agent-execute/index.ts'), 'utf8');

const SENT = 'ace681ae-74cb-4897-9654-a39fed57cee1';
const REAL = 'ace681ae-74cb-4890-ab2e-aebe852895dd';
const TITLE = 'Revisionsberättelse';
const PROJECT = '11111111-2222-4333-8444-555555555555';
const REAL_ROW = { id: REAL, title: TITLE, status: 'in_progress', project_id: PROJECT };

type Op = { kind: string; args: unknown[] };
type Query = { table: string; ops: Op[] };

/**
 * A recording fake of the supabase client: every chained call is logged, and
 * `answer` decides what a query returns from what was asked of it.
 */
function fakeClient(answer: (q: Query) => unknown[]) {
  const queries: Query[] = [];
  return {
    queries,
    from(table: string) {
      const q: Query = { table, ops: [] };
      queries.push(q);
      const builder: Record<string, unknown> = {};
      const chain = (kind: string) => (...args: unknown[]) => { q.ops.push({ kind, args }); return builder; };
      for (const m of ['select', 'eq', 'neq', 'gte', 'lte', 'ilike', 'limit', 'order']) builder[m] = chain(m);
      builder.maybeSingle = async () => { q.ops.push({ kind: 'maybeSingle', args: [] }); const rows = answer(q); return { data: rows[0] ?? null, error: null }; };
      builder.single = async () => { q.ops.push({ kind: 'single', args: [] }); const rows = answer(q); return { data: rows[0] ?? null, error: null }; };
      builder.insert = chain('insert');
      builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve({ data: answer(q), error: null }).then(res, rej);
      return builder as unknown as ReturnType<TaskQueryClient['from']>;
    },
  };
}

/** The app tsconfig is not strict, so a boolean discriminant does not narrow by itself; this guard does. */
const failed = (r: ResolvedTask): r is Extract<ResolvedTask, { ok: false }> => !r.ok;

const op = (q: Query, kind: string) => q.ops.find((o) => o.kind === kind);
const hasEqId = (q: Query) => q.ops.some((o) => o.kind === 'eq' && o.args[0] === 'id');
const isRange = (q: Query) => q.ops.some((o) => o.kind === 'gte') && q.ops.some((o) => o.kind === 'lte');

/** A database that holds exactly the optic task: an exact-id hit only for REAL, the prefix range finds it. */
const opticDb = (q: Query): unknown[] => {
  if (hasEqId(q)) return q.ops.some((o) => o.kind === 'eq' && o.args[1] === REAL) ? [REAL_ROW] : [];
  if (isRange(q)) {
    const lo = String(op(q, 'gte')!.args[1]);
    const hi = String(op(q, 'lte')!.args[1]);
    return REAL >= lo && REAL <= hi ? [REAL_ROW] : [];
  }
  if (op(q, 'ilike')) {
    const pattern = String(op(q, 'ilike')!.args[1]).toLowerCase();
    const bare = pattern.replace(/^%|%$/g, '');
    return TITLE.toLowerCase().includes(bare) ? [REAL_ROW] : [];
  }
  return [];
};

describe('task-id self-corrects — the prefix lookup', () => {
  it('matches on the first 13 characters as a uuid range, never an ILIKE on the id column', async () => {
    const db = fakeClient(opticDb);
    const found = await findTasksByIdPrefix(db, SENT);
    expect(found.map((t) => t.id)).toEqual([REAL]);

    const q = db.queries[0];
    expect(q.table).toBe('project_tasks');
    expect(TASK_ID_PREFIX_LENGTH).toBe(13);
    expect(op(q, 'gte')!.args).toEqual(['id', 'ace681ae-74cb-0000-0000-000000000000']);
    expect(op(q, 'lte')!.args).toEqual(['id', 'ace681ae-74cb-ffff-ffff-ffffffffffff']);
    expect(q.ops.some((o) => o.kind === 'ilike' && String(o.args[0]).startsWith('id'))).toBe(false);
  });

  it('a prefix that is not a well-formed uuid head anchors nothing (no range query at all)', async () => {
    const db = fakeClient(opticDb);
    expect(await findTasksByIdPrefix(db, 'revisionsberattelse-task')).toEqual([]);
    expect(db.queries).toHaveLength(0);
  });
});

describe('task-id self-corrects — the did-you-mean answer', () => {
  it('a garbled uuid with the right prefix names the task it meant and asks for a re-send', async () => {
    const db = fakeClient(opticDb);
    const r = await resolveProjectTask(db, { task_id: SENT }, { allowTitle: true });
    expect(r.ok).toBe(false);
    if (!failed(r)) return;
    expect(r.error).toBe(`no task ${SENT} — did you mean ${REAL} ("${TITLE}")? Re-send with that id.`);
    expect(r.code).toBe('NOT_FOUND');
    expect(r.retryable).toBe(true);
    expect(r.candidates).toEqual([REAL_ROW]);
    // The old shape stopped here; it is not what an agent gets any more.
    expect(r.error).not.toBe(`no task ${SENT}`);
  });

  it('several matches list up to five; nothing is picked for the agent', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      id: `ace681ae-74cb-489${i}-0000-00000000000${i}`, title: `Task ${i}`, status: 'todo', project_id: PROJECT,
    }));
    const r = didYouMeanError(SENT, many, 'not_found');
    expect(r.ok).toBe(false);
    expect(r.candidates).toHaveLength(5);
    expect(r.error).toMatch(/did you mean one of: /);
    expect(r.error).toMatch(/\(more exist\)/);
    expect(r.error).toMatch(/Task 0[\s\S]*Task 4/);
    expect(r.error).not.toMatch(/Task 5/);
  });

  it('no match at all points at the listing instead of guessing', () => {
    const r = didYouMeanError(SENT, [], 'not_found');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/^no task ace681ae-74cb-4897-9654-a39fed57cee1\. Nothing matches its prefix; list the project's tasks/);
    expect(r.candidates).toEqual([]);
  });

  it('falls back to the sent task_title when the prefix anchors nothing', async () => {
    const db = fakeClient(opticDb);
    const r = await resolveProjectTask(db, { task_id: 'deadbeef-0000-4000-8000-000000000000', task_title: TITLE });
    expect(r.ok).toBe(false);
    if (!failed(r)) return;
    expect(r.error).toContain(`did you mean ${REAL} ("${TITLE}")`);
    expect(db.queries.some((q) => op(q, 'ilike')?.args[0] === 'title')).toBe(true);
  });
});

describe('task-id self-corrects — no silent action on a guess', () => {
  it('exactly one prefix candidate is still an error, never an ok with the guessed id', async () => {
    const db = fakeClient(opticDb);
    const r = await resolveProjectTask(db, { task_id: SENT });
    expect(r.ok).toBe(false);
    if (!failed(r)) return;
    expect(r.candidates).toHaveLength(1);
    expect(r.hint).toMatch(/Nothing was written/);
  });

  it('the exact id resolves, and an unambiguous open title resolves only when allowed', async () => {
    const exact = await resolveProjectTask(fakeClient(opticDb), { task_id: REAL });
    expect(exact).toMatchObject({ ok: true, id: REAL, matched_by: 'id' });

    const byTitle = await resolveProjectTask(fakeClient(opticDb), { task_title: TITLE }, { allowTitle: true });
    expect(byTitle).toMatchObject({ ok: true, id: REAL, matched_by: 'title' });
    const titleQuery = fakeClient(opticDb);
    await resolveProjectTask(titleQuery, { task_title: TITLE }, { allowTitle: true });
    // Open tasks only: a title names what someone is working on, not its archive.
    expect(titleQuery.queries[0].ops.some((o) => o.kind === 'neq' && o.args[0] === 'status' && o.args[1] === 'done')).toBe(true);

    const notAllowed = await resolveProjectTask(fakeClient(opticDb), { task_title: TITLE });
    expect(notAllowed.ok).toBe(false);
    if (failed(notAllowed)) expect(notAllowed.code).toBe('MISSING_REQUIRED_PARAMETER');
  });

  it('a title shared by two open tasks lists both and asks for task_id', async () => {
    const twin = { ...REAL_ROW, id: 'bbbbbbbb-1111-4222-8333-444444444444' };
    const db = fakeClient((q) => (op(q, 'ilike') ? [REAL_ROW, twin] : []));
    const r = await resolveProjectTask(db, { task_title: TITLE }, { allowTitle: true });
    expect(r.ok).toBe(false);
    if (!failed(r)) return;
    expect(r.error).toMatch(/matches 2 open tasks/);
    expect(r.error).toMatch(/Re-send with task_id/);
    expect(r.candidates).toHaveLength(2);
  });

  it('the handler writes the comment only on the resolver\'s ok branch, and the bare `no task ${id}` is gone', () => {
    const start = HANDLER.indexOf("handler === 'internal:comment_on_task'");
    expect(start).toBeGreaterThan(0);
    const block = HANDLER.slice(start, HANDLER.indexOf("} else if (handler === '", start + 50));
    expect(block).toMatch(/resolveProjectTask\(supabase, args as any, \{ allowTitle: true \}\)/);
    expect(block).not.toMatch(/`no task \$\{taskId\}`/);
    const insertAt = block.indexOf("from('project_task_comments').insert(");
    const okBranchAt = block.indexOf('} else {', block.indexOf('if (!resolved.ok)'));
    expect(insertAt).toBeGreaterThan(okBranchAt);
    expect(block).toMatch(/project_id: resolved\.task\.project_id/);
  });

  it('manage_project_task get/update/delete go through the same resolver before any row is touched', () => {
    const gate = HANDLER.match(/if \(table === 'project_tasks' && \(action === 'get' \|\| action === 'update' \|\| action === 'delete'\)[^\n]*\n([\s\S]*?)\n {2}\}\n/);
    expect(gate, 'the project_tasks gate in executeGenericCrud').not.toBeNull();
    expect(gate![1]).toMatch(/resolveProjectTask\(supabase, \{ task_id: id, task_title: /);
    expect(gate![1]).toMatch(/if \(!resolved\.ok\)[\s\S]*return \{/);
    // The gate sits before the switch that reads or writes the row.
    expect(HANDLER.indexOf("if (table === 'project_tasks' && (action === 'get'")).toBeLessThan(HANDLER.indexOf("case 'get': {"));
  });
});

describe('task-id self-corrects — the invalid-uuid pre-check', () => {
  it('a uuid with one extra character never reaches Postgres and answers with the task it meant', async () => {
    const db = fakeClient(opticDb);
    const r = await resolveProjectTask(db, { task_id: `${REAL}aaf55` });
    expect(isUuid(`${REAL}aaf55`)).toBe(false);
    expect(r.ok).toBe(false);
    if (!failed(r)) return;
    expect(r.code).toBe('INVALID_INPUT');
    expect(r.error).toBe(`no task ${REAL}aaf55 (not a valid uuid) — did you mean ${REAL} ("${TITLE}")? Re-send with that id.`);
    // No `.eq('id', <malformed>)`: Postgres would have answered
    // `invalid input syntax for type uuid` with nothing to act on.
    expect(db.queries.some(hasEqId)).toBe(false);
    expect(db.queries.some(isRange)).toBe(true);
  });

  it('an empty task_id with no title is a missing parameter, not a lookup', async () => {
    const db = fakeClient(opticDb);
    const r = await resolveProjectTask(db, { task_id: '' }, { allowTitle: true });
    expect(r.ok).toBe(false);
    if (failed(r)) expect(r.code).toBe('MISSING_REQUIRED_PARAMETER');
    expect(db.queries).toHaveLength(0);
  });
});

describe('task-id self-corrects — the skill seed documents task_title', () => {
  const seed = projectsModule.skillSeeds.find((s) => s.name === 'comment_on_task')!;

  it('tool_definition carries task_title and no longer hard-requires task_id', () => {
    const params = (seed.tool_definition as { function: { parameters: { properties: Record<string, { description: string }>; required: string[] } } }).function.parameters;
    expect(params.properties.task_title).toBeDefined();
    expect(params.properties.task_title.description).toMatch(/exactly one open/);
    expect(params.properties.task_id.description).toMatch(/listing/);
    expect(params.required).toEqual(['body']);
  });

  it('the description prefers the id from a listing and says a guess is never acted on', () => {
    expect(seed.description).toMatch(/Use when:/);
    expect(seed.description).toMatch(/task_id copied from a listing[^.]*preferred/);
    expect(seed.description).toMatch(/task_title is accepted only when it names exactly one open task/);
    expect(seed.description).toMatch(/nothing is written on a guess/);
    expect(seed.instructions).toMatch(/did you mean <id>/);
  });
});
