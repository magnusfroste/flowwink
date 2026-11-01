/**
 * The task thread nudges once a day — the platform keeps the cadence, not the prompt.
 *
 * The finding (optic, 2026-10-27): the task "Revisionsberättelse" carried 48
 * comments — 48 from FlowPilot, 0 from people. The same "hub blocker — who
 * owns the next step?" twice a day since 2026-09-28, once per heartbeat.
 * Across the instance: 76 FlowPilot comments in 30 days against 6 from
 * people. Peter, who reads these threads, got a wall of the same question.
 *
 * project_portfolio_brief's instructions already said "one comment per task
 * per day at most; never repeat a question that already has no answer". That
 * was prose, and the model did not follow it. So the rule now lives in
 * comment_on_task, before the write:
 *   - ALREADY_NUDGED_TODAY — the same agent wrote on this task within 24 h and
 *     no person has written since;
 *   - QUESTION_STILL_OPEN  — the agent's question has no person comment after
 *     it and the task has not MOVED (moved_at, not updated_at) since.
 *
 * The review of the first cut (2026-10-28) found how a guard like this
 * defeats itself, and each is pinned below:
 *   1. a refusal shaped as `error` is retried by self-repair and counted by
 *      self-healing, which disables the very skill it protects — a refusal
 *      carries no `error`;
 *   2. identity from the model's `author_name` is a costume — it is the
 *      server-stamped agent_key;
 *   3. updated_at rises on every write — moved_at decides;
 *   4. a person at the keyboard (FlowChat) is never refused;
 *   5. a person's reply reopens the window;
 *   6. two overlapping heartbeats cannot both write (a locked compare-and-set).
 * Round two (same day) found what the fixes brought with them, pinned too:
 *   - a refusal journaled as 'success' counted as objective evidence — it is
 *     'refused', and evidence and progress skip it;
 *   - an edge deploy ahead of `db push` failed every comment — the read and
 *     the write fall back to the pre-migration schema;
 *   - a person in FlowChat was stored as FlowPilot — they write as a person,
 *     so their reply answers the question;
 *   - a lost race named a next_comment_at in the past — it is a day after
 *     the winner's comment;
 *   - unnamed gateway agents shared one identity ('mcp') — the API key;
 *   - attendance was a third identity field — it is caller_user_id.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  cadenceRefusalAnswer,
  decideTaskThreadCadence,
  isMissingSchemaError,
  nudgedTodayRefusal,
  readTaskThread,
  readTaskThreadComments,
  threadAuthorFor,
  writePacedComment,
  type CadenceVerdict,
  type PacedComment,
  type ThreadAuthor,
  type ThreadComment,
} from '../../../supabase/functions/_shared/handlers/task-thread-cadence';
import { projectsModule } from '@/lib/modules/projects-module';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

const NOW = new Date('2026-10-27T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const LONG_AGO = hoursAgo(500);

const FLOWPILOT: ThreadAuthor = { agent_key: 'flowpilot', attended: false };
const PETER_AT_KEYBOARD: ThreadAuthor = { agent_key: 'person:peter', attended: true };

const fp = (kind: string, h: number, extra: Partial<ThreadComment> = {}): ThreadComment =>
  ({ author_type: 'flowpilot', author_name: 'FlowPilot', agent_key: 'flowpilot', kind, created_at: hoursAgo(h), ...extra });
const person = (h: number): ThreadComment =>
  ({ author_type: 'person', author_name: 'Peter', kind: 'comment', created_at: hoursAgo(h) });

/** The refusal half of a verdict (the app tsconfig does not narrow on `allowed`). */
const refusal = (v: CadenceVerdict) => (v.allowed ? null : (v as Extract<CadenceVerdict, { allowed: false }>).refusal);
const decide = (comments: ThreadComment[], kind: 'step' | 'question' | 'decision' | 'comment', movedAt = LONG_AGO, author = FLOWPILOT) =>
  decideTaskThreadCadence({ comments, author, kind, taskMovedAt: movedAt, now: NOW });

const RULE = 'The thread enforces one agent comment per task per day and keeps an unanswered question open — a refusal is not an error to retry.';

describe('ALREADY_NUDGED_TODAY — one agent comment per task per day', () => {
  it('refuses a second FlowPilot comment within 24 h and names when it may write again', () => {
    const r = refusal(decide([fp('comment', 12)], 'comment'));
    expect(r?.code).toBe('ALREADY_NUDGED_TODAY');
    expect(r?.next_comment_at).toBe(hoursAgo(-12));
    expect(r?.hint).toContain(hoursAgo(-12));
    expect(r?.last_agent_comment_at).toBe(hoursAgo(12));
  });

  it('allows it again after 24 h', () => {
    expect(decide([fp('comment', 25)], 'comment').allowed).toBe(true);
  });

  it('a person writing after the agent reopens the window (the agent may answer)', () => {
    expect(decide([person(1), fp('step', 3)], 'comment').allowed).toBe(true);
    // …but a person's comment BEFORE the agent's does not.
    expect(refusal(decide([fp('step', 1), person(3)], 'comment'))?.code).toBe('ALREADY_NUDGED_TODAY');
  });

  it('another agent writing does not use up this agent’s day', () => {
    const other: ThreadComment = { author_type: 'agent', author_name: 'OpenClaw', agent_key: 'OpenClaw', kind: 'step', created_at: hoursAgo(1) };
    expect(decide([other], 'step').allowed).toBe(true);
  });
});

describe('identity is server-stamped, never the model’s author_name', () => {
  it('FlowPilot is one voice whatever name it signs with', () => {
    expect(refusal(decide([fp('step', 2, { author_name: 'Pilot' })], 'step'))?.code).toBe('ALREADY_NUDGED_TODAY');
  });

  it('a gateway agent cannot dodge the window by renaming itself', () => {
    const openclaw = threadAuthorFor({ agentType: 'mcp', callerAgentName: 'OpenClaw', callerApiKeyId: 'k1', attendedUserId: null });
    const earlier: ThreadComment = { author_type: 'agent', author_name: 'OpenClaw (2)', agent_key: 'OpenClaw', kind: 'step', created_at: hoursAgo(2) };
    expect(openclaw).toEqual({ agent_key: 'OpenClaw', attended: false });
    expect(refusal(decideTaskThreadCadence({ comments: [earlier], author: openclaw, kind: 'step', taskMovedAt: LONG_AGO, now: NOW }))?.code)
      .toBe('ALREADY_NUDGED_TODAY');
  });

  it('two gateway agents are two identities', () => {
    const hermes = threadAuthorFor({ agentType: 'mcp', callerAgentName: 'Hermes', callerApiKeyId: 'k2', attendedUserId: null });
    const openclawRow: ThreadComment = { author_type: 'agent', author_name: 'mcp', agent_key: 'OpenClaw', kind: 'step', created_at: hoursAgo(1) };
    expect(decideTaskThreadCadence({ comments: [openclawRow], author: hermes, kind: 'step', taskMovedAt: LONG_AGO, now: NOW }).allowed).toBe(true);
  });

  it('unnamed gateway agents are told apart by their API key, not collapsed into "mcp"', () => {
    const a = threadAuthorFor({ agentType: 'mcp', callerAgentName: null, callerApiKeyId: 'key-a', attendedUserId: null });
    const b = threadAuthorFor({ agentType: 'mcp', callerAgentName: null, callerApiKeyId: 'key-b', attendedUserId: null });
    expect(a.agent_key).toBe('key:key-a');
    expect(b.agent_key).not.toBe(a.agent_key);
  });

  it('rows from before agent_key fall back to what they had', () => {
    expect(refusal(decide([fp('step', 2, { agent_key: null })], 'step'))?.code).toBe('ALREADY_NUDGED_TODAY');
  });

  it('the handler takes the identity from threadAuthorFor and never keys on author_name', () => {
    const cadence = read('supabase/functions/_shared/handlers/task-thread-cadence.ts');
    const index = read('supabase/functions/agent-execute/index.ts');
    expect(index).toMatch(/threadAuthorFor\(\{\s*agentType: agent_type, callerAgentName: caller_agent_name,\s*callerApiKeyId: caller_api_key_id \?\? null, attendedUserId,\s*\}\)/);
    expect(cadence).not.toMatch(/author_name\s*===|===\s*author\.author_name/);
  });
});

describe('QUESTION_STILL_OPEN — an unanswered question is not repeated', () => {
  it('refuses a new question while the last one has no answer and the task has not moved', () => {
    const r = refusal(decide([fp('question', 30)], 'question'));
    expect(r?.code).toBe('QUESTION_STILL_OPEN');
    expect(r?.hint).toMatch(/the question stands; wait for an answer or a change on the task/i);
    expect(r?.open_question).toBe(true);
  });

  it('a nudge-comment is refused the same way', () => {
    expect(refusal(decide([fp('question', 30)], 'comment'))?.code).toBe('QUESTION_STILL_OPEN');
  });

  it('a step after the question does not reopen the door to asking again', () => {
    expect(refusal(decide([fp('step', 26), fp('question', 50)], 'question'))?.code).toBe('QUESTION_STILL_OPEN');
  });

  it('a person’s answer closes it', () => {
    const v = decide([person(28), fp('question', 30)], 'question');
    expect(v.allowed).toBe(true);
  });

  it('the task MOVING since the question closes it — moved_at, not updated_at', () => {
    expect(decide([fp('question', 30)], 'question', hoursAgo(5)).allowed).toBe(true);
    const cadence = read('supabase/functions/_shared/handlers/task-thread-cadence.ts');
    const index = read('supabase/functions/agent-execute/index.ts');
    const code = cadence.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(code).not.toMatch(/updated_at/);
    expect(index).toMatch(/const movedAt = resolved\.task\.moved_at/);
    // Read with the task the resolver already fetched — no second round trip.
    expect(read('supabase/functions/_shared/project-task-resolve.ts')).toMatch(/CANDIDATE_COLUMNS = '[^']*\bmoved_at\b/);
  });
});

describe('a step or decision about the agent’s own work — once a day', () => {
  for (const kind of ['step', 'decision'] as const) {
    it(`${kind} is allowed past an open question`, () => {
      const v = decide([fp('question', 30)], kind);
      expect(v.allowed).toBe(true);
    });

    it(`but a second ${kind} the same day is refused`, () => {
      expect(refusal(decide([fp(kind, 3)], kind))?.code).toBe('ALREADY_NUDGED_TODAY');
    });
  }
});

describe('a person is never refused', () => {
  it('a person at the keyboard (FlowChat, the admin UI), however busy the thread is', () => {
    const comments = [fp('comment', 0.1, { agent_key: 'person:peter' }), fp('question', 1)];
    for (const kind of ['comment', 'question', 'step', 'decision'] as const) {
      expect(decide(comments, kind, LONG_AGO, PETER_AT_KEYBOARD).allowed).toBe(true);
    }
  });

  it('attended means a verified user, never the gateway, the public chat or a scheduled run', () => {
    expect(threadAuthorFor({ agentType: 'flowpilot', callerAgentName: null, callerApiKeyId: null, attendedUserId: 'u1' }))
      .toEqual({ agent_key: 'person:u1', attended: true });
    const index = read('supabase/functions/agent-execute/index.ts');
    // One "who is the person" signal: caller_user_id — no third identity field.
    expect(index).toMatch(/const attendedUserId = agent_type === 'mcp' \|\| agent_type === 'chat' \|\| scheduled === true \? null\s*: \(caller_user_id \?\? null\);/);
    expect(index).not.toMatch(/interactive_user_id/);
  });

  it('FlowChat vouches for its signed-in admin on every skill call', () => {
    // FlowChat runs on the shared engine (step 4a): it hands the admin to
    // reason(), and reason() hands it to every skill call it makes.
    const operate = read('supabase/functions/agent-operate/index.ts');
    expect(operate).toMatch(/callerUserId: auth\.userId/);
    const engine = read('supabase/functions/_shared/pilot/reason.ts');
    const loop = engine.slice(engine.indexOf('export async function reason('));
    const calls = loop.match(/executeBuiltInTool\([^)]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c).toMatch(/skillOpts\)$/);
    expect(loop).toMatch(/const skillOpts = \{ callerUserId: config\.callerUserId \?\? null \}/);
    expect(engine).toMatch(/body\.caller_user_id = opts\.callerUserId/);
  });
});

describe('a refusal is not a failure', () => {
  const answer = cadenceRefusalAnswer(refusal(decide([fp('comment', 1)], 'comment'))!, { id: 't1', title: 'Revisionsberättelse' });
  const index = read('supabase/functions/agent-execute/index.ts');

  it('carries no `error` — self-repair does not retry it, self-healing does not count it', () => {
    expect(answer).not.toHaveProperty('error');
    expect(answer.status).toBe('refused');
  });

  it('carries the envelope: code, retryable false, one sentence (`reason`), hint, and the thread state', () => {
    expect(answer).toMatchObject({ code: 'ALREADY_NUDGED_TODAY', retryable: false, task_id: 't1', open_question: false });
    expect(answer.reason).toEqual(expect.any(String));
    expect(answer.hint).toEqual(expect.any(String));
    expect(answer).not.toHaveProperty('refused');
    expect(answer).not.toHaveProperty('message');
    expect(answer.last_agent_comment_at).toBe(hoursAgo(1));
  });

  it('the harness’s failure tests read `error` / status failed — the shape the refusal avoids', () => {
    const reason = read('supabase/functions/_shared/pilot/reason.ts');
    expect(reason).toMatch(/const failed = !!\(result\?\.error \|\| result\?\.status === 'failed'\)/);
    expect(index).toMatch(/const handlerFailed = !!\(result as any\)\?\.error;/);
  });

  it('the journal records it as refused — not a success — and objective progress skips it', () => {
    expect(index).toMatch(/const handlerRefused = !handlerFailed && \(result as \{ status\?: unknown \} \| null\)\?\.status === 'refused';/);
    expect(index).toMatch(/status: handlerFailed \? 'failed' : handlerRefused \? 'refused' : 'success', conversation_id,/);
    expect(index).toMatch(/if \(activityId && !handlerRefused\) \{\s*try \{\s*await trackObjectiveProgress\(/);
    // Before the enum value lands, the row is kept (as success) rather than lost.
    expect(index).toMatch(/activity\.status === 'refused' && \/invalid input value for enum\|22P02\/i/);
  });

  it('objective evidence counts a refusal neither as support nor as a failure', () => {
    const handlers = read('supabase/functions/_shared/pilot/handlers.ts');
    const at = handlers.indexOf("if (a.status === 'refused'");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(handlers.indexOf("if (a.status === 'success') o.ok++;"));
    expect(handlers.slice(at, at + 200)).toMatch(/\.status === 'refused'\) continue;/);
  });
});

/** A fake supabase client: rpc / from(...) answer from the script; every call is recorded. */
function fakeDb(script: {
  rpc?: { data?: unknown; error?: { message: string; code?: string } | null };
  select?: (columns: string) => { data?: unknown; error?: { message: string; code?: string } | null };
  insert?: { data?: unknown; error?: { message: string; code?: string } | null };
}) {
  const calls: string[] = [];
  const done = (r: { data?: unknown; error?: unknown } | undefined) => Promise.resolve({ data: r?.data ?? null, error: r?.error ?? null });
  const query = (table: string) => {
    let op = 'select'; let columns = '';
    const q = {
      select: (c: string) => { if (op !== 'insert') columns = c; calls.push(`${table}.select(${c})`); return q; },
      eq: () => q, order: () => q, limit: () => q,
      insert: (row: Record<string, unknown>) => { op = 'insert'; calls.push(`${table}.insert(${Object.keys(row).join(',')})`); return q; },
      single: () => done(op === 'insert' ? script.insert : script.select?.(columns)),
      maybeSingle: () => done(script.select?.(columns)),
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => done(script.select?.(columns)).then(ok, ko),
    };
    return q;
  };
  return {
    calls,
    from: (t: string) => query(t),
    rpc: (fn: string) => { calls.push(`rpc:${fn}`); return done(script.rpc); },
  };
}

const COMMENT: PacedComment = {
  task_id: 't1', project_id: 'p1', body: 'b', kind: 'step', author_type: 'flowpilot', author_name: 'FlowPilot',
  author_id: null, agent_key: 'flowpilot', seen_last_at: hoursAgo(30),
};

describe('the write is a locked compare-and-set', () => {
  const index = read('supabase/functions/agent-execute/index.ts');
  const start = index.indexOf("handler === 'internal:comment_on_task'");
  const block = index.slice(start, index.indexOf("} else if (handler === '", start + 50));
  const migration = readdirSync(join(process.cwd(), 'supabase/migrations'))
    .filter((f) => f.endsWith('.sql'))
    .map((f) => read(`supabase/migrations/${f}`))
    .find((sql) => sql.includes('FUNCTION public.insert_task_comment_paced(')) ?? '';

  it('never decides on a thread it could not read, decides before it writes, and writes only through the paced function', () => {
    const readErrAt = block.indexOf('if (thread.error)');
    const decideAt = block.indexOf('decideTaskThreadCadence({');
    const refuseAt = block.indexOf('cadenceRefusalAnswer(verdict.refusal');
    const writeAt = block.indexOf('writePacedComment(supabase');
    expect(readErrAt).toBeGreaterThan(0);
    expect(decideAt).toBeGreaterThan(readErrAt);
    expect(refuseAt).toBeGreaterThan(decideAt);
    expect(writeAt).toBeGreaterThan(refuseAt);
    expect(block).not.toMatch(/\.insert\(/);
  });

  it('the function locks the task, refuses a write from the same agent since the one seen, and names the winner’s time', () => {
    expect(migration).toMatch(/pg_advisory_xact_lock\(hashtextextended\('project_task_comments:' \|\| p_task_id::text, 0\)\)/);
    expect(migration).toMatch(/agent_key = p_agent_key AND created_at > p_seen_last_at/);
    expect(migration).toMatch(/jsonb_build_object\('written', false, 'last_at', v_at\)/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.insert_task_comment_paced\([^)]*\) TO service_role/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.insert_task_comment_paced\([^)]*\) FROM anon, authenticated/);
    expect(migration).toMatch(/ALTER TYPE public\.agent_activity_status ADD VALUE IF NOT EXISTS 'refused';/);
  });

  it('a lost race is refused until a day after the WINNER’s comment, never a time in the past', async () => {
    const winner = hoursAgo(0.01);
    const db = fakeDb({ rpc: { data: { written: false, last_at: winner } } });
    const w = await writePacedComment(db, COMMENT);
    expect(w).toEqual({ written: false, last_at: winner });
    const r = nudgedTodayRefusal(readTaskThread([fp('step', 26)], FLOWPILOT, LONG_AGO), winner);
    expect(new Date(r.next_comment_at!).getTime()).toBeGreaterThan(NOW.getTime());
    expect(block).toMatch(/nudgedTodayRefusal\(state, lastAt\)/);
    expect(block).toMatch(/const lastAt = written\.last_at \?\? new Date\(\)\.toISOString\(\);/);
  });

  it('success carries the thread state', () => {
    const success = block.slice(block.indexOf('success: true'));
    expect(success).toMatch(/last_agent_comment_at: after\.last_agent_comment_at/);
    expect(success).toMatch(/open_question: after\.open_question/);
  });
});

describe('before the migration lands, the skill keeps working', () => {
  const missingColumn = { message: 'column project_task_comments.agent_key does not exist', code: '42703' };
  const missingFn = { message: 'Could not find the function public.insert_task_comment_paced in the schema cache', code: 'PGRST202' };

  it('the thread read falls back to the pre-migration columns', async () => {
    const db = fakeDb({ select: (c) => (c.includes('agent_key') ? { error: missingColumn } : { data: [fp('step', 2, { agent_key: undefined })] }) });
    const t = await readTaskThreadComments(db, 't1');
    expect(t.error).toBeNull();
    expect(t.comments).toHaveLength(1);
    expect(db.calls).toEqual(['project_task_comments.select(author_type, author_name, agent_key, kind, created_at)', 'project_task_comments.select(author_type, author_name, kind, created_at)']);
  });

  it('the write falls back to the plain insert, without agent_key', async () => {
    const db = fakeDb({ rpc: { error: missingFn }, insert: { data: { id: 'c1', created_at: hoursAgo(0) } } });
    const w = await writePacedComment(db, COMMENT);
    expect(w).toMatchObject({ written: true, id: 'c1', locked: false });
    const insert = db.calls.find((c) => c.startsWith('project_task_comments.insert('))!;
    expect(insert).not.toMatch(/agent_key/);
  });

  it('any other error is a real failure, not a fallback', async () => {
    const db = fakeDb({ rpc: { error: { message: 'permission denied for table project_task_comments', code: '42501' } } });
    expect(await writePacedComment(db, COMMENT)).toEqual({ error: 'permission denied for table project_task_comments' });
    expect(isMissingSchemaError({ message: 'permission denied', code: '42501' })).toBe(false);
  });
});

describe('a person at the keyboard writes as a person', () => {
  const index = read('supabase/functions/agent-execute/index.ts');

  it('attended rows are author_type person, with the person’s name and id', () => {
    expect(index).toMatch(/const authorType = author\.attended \? 'person' : agent_type === 'flowpilot' \? 'flowpilot' : 'agent';/);
    expect(index).toMatch(/const authorName = attendedUserId\s*\? await personDisplayName\(supabase, attendedUserId\)/);
    expect(index).toMatch(/author_id: attendedUserId,/);
  });

  it('so a person answering FlowPilot through FlowChat closes the question and reopens the window', () => {
    const viaFlowChat: ThreadComment = { author_type: 'person', author_name: 'Peter', agent_key: 'person:peter', kind: 'comment', created_at: hoursAgo(1) };
    expect(decide([viaFlowChat, fp('question', 2)], 'question').allowed).toBe(true);
    expect(readTaskThread([viaFlowChat, fp('question', 2)], FLOWPILOT, LONG_AGO).open_question).toBe(false);
  });
});

describe('the vocabulary and the skill copy', () => {
  it('the codes are part of the stable vocabulary, and documented where the vocabulary is', () => {
    expect(read('supabase/functions/_shared/agent-errors.ts')).toMatch(/'ALREADY_NUDGED_TODAY'[\s\S]*'QUESTION_STILL_OPEN'/);
    for (const doc of ['CLAUDE.md', 'docs/architecture/agent-harness.md']) {
      const text = read(doc);
      expect(text, doc).toContain('ALREADY_NUDGED_TODAY');
      expect(text, doc).toContain('QUESTION_STILL_OPEN');
    }
  });

  const skills = projectsModule.skillSeeds ?? [];
  const byName = (n: string) => skills.find((s) => s.name === n);

  it('comment_on_task’s description says the thread enforces it', () => {
    expect(byName('comment_on_task')?.description).toContain(RULE);
    expect(byName('comment_on_task')?.instructions).toMatch(/status "refused" with a code and no error/);
  });

  it('project_portfolio_brief says it as the platform’s rule, not a request', () => {
    const instructions = byName('project_portfolio_brief')?.instructions ?? '';
    expect(instructions).toContain(RULE);
    expect(instructions).not.toMatch(/One comment per task per day at most/);
  });
});
