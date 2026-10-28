/**
 * The cadence the task thread keeps for agents (comment_on_task).
 *
 * The thread is where people and agents write together, and a person reads it.
 * "One comment per task per day; never repeat an unanswered question" used to
 * be prose in project_portfolio_brief's instructions, and the model did not
 * follow it: on optic one task carried 48 FlowPilot comments and none from a
 * person — the same "who owns the next step?" twice a day for a month. So the
 * platform keeps the cadence here, before the write, for every unattended
 * agent caller:
 *
 *   * ALREADY_NUDGED_TODAY — the same agent wrote on this task in the last
 *     24 h and no person has written since.
 *   * QUESTION_STILL_OPEN  — the agent's latest question has no person comment
 *     after it and the task has not MOVED since it was asked (moved_at: a
 *     status change or a ticked checklist item — not updated_at, which rises
 *     on every write; see 20260911120000_rorelse-ar-inte-faltandring.sql).
 *     Applies to question/comment; a step or decision reports the agent's own
 *     work and is held only to the once-a-day rule.
 *
 * Both are REFUSALS, not failures: the answer carries no `error`, so the ReAct
 * loop's self-repair does not retry it, the journal does not log it as failed
 * and self-healing never counts it toward disabling the skill (the same shape
 * as `status: 'pending_approval'`). A person at the keyboard is never refused.
 *
 * Who wrote is `agent_key`, stamped by the server — never the model-supplied
 * `author_name`, which is only the display voice.
 */

export type TaskCommentKind = 'step' | 'question' | 'decision' | 'comment';
export type CadenceRefusalCode = 'ALREADY_NUDGED_TODAY' | 'QUESTION_STILL_OPEN';

/** One agent comment per task per this window. */
export const AGENT_COMMENT_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** The thread columns the cadence reads. */
export const THREAD_COLUMNS = 'author_type, author_name, agent_key, kind, created_at';
/** The same, on an instance whose 20261028090037 migration has not landed yet. */
export const THREAD_COLUMNS_LEGACY = 'author_type, author_name, kind, created_at';

export interface ThreadComment {
  author_type: string;
  author_name: string | null;
  agent_key?: string | null;
  kind: string;
  created_at: string;
}

export interface ThreadAuthor {
  /** Server-stamped identity: 'flowpilot', the gateway agent's caller_agent_name, or 'person:<uuid>'. */
  agent_key: string;
  /** A person at the keyboard (FlowChat, the admin UI) — never refused. */
  attended: boolean;
}

export interface ThreadState {
  /** This agent's latest comment on the task, if any. */
  last_agent_comment_at: string | null;
  /** This agent's latest question still stands: no person answered, the task did not move. */
  open_question: boolean;
  open_question_at: string | null;
  last_person_comment_at: string | null;
}

export interface CadenceRefusal extends ThreadState {
  code: CadenceRefusalCode;
  reason: string;
  hint: string;
  next_comment_at?: string;
}

export type CadenceVerdict = { allowed: true; state: ThreadState } | { allowed: false; refusal: CadenceRefusal };

/**
 * The identity a row was written under. Rows before agent_key existed fall
 * back to what they had: FlowPilot is one voice, any other agent its name.
 */
export function commentAgentKey(c: ThreadComment): string | null {
  if (c.agent_key) return c.agent_key;
  if (c.author_type === 'flowpilot') return 'flowpilot';
  if (c.author_type === 'agent') return c.author_name || 'agent';
  return null;
}

/**
 * The identity of the caller, from what the server knows — never from the
 * model's arguments. A gateway agent is its registered name, else its API key:
 * two unnamed agents are two identities, not one 'mcp'.
 */
export function threadAuthorFor(input: {
  agentType: string;
  callerAgentName: string | null;
  callerApiKeyId: string | null;
  attendedUserId: string | null;
}): ThreadAuthor {
  if (input.attendedUserId) return { agent_key: `person:${input.attendedUserId}`, attended: true };
  if (input.agentType === 'flowpilot') return { agent_key: 'flowpilot', attended: false };
  if (input.callerAgentName) return { agent_key: input.callerAgentName, attended: false };
  if (input.callerApiKeyId) return { agent_key: `key:${input.callerApiKeyId}`, attended: false };
  return { agent_key: input.agentType, attended: false };
}

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);

/** What the thread says about this agent: when it last wrote, and whether its question stands. */
export function readTaskThread(
  comments: ThreadComment[],
  author: ThreadAuthor,
  taskMovedAt: string | null,
): ThreadState {
  const sorted = [...comments].sort((a, b) => ms(b.created_at) - ms(a.created_at));
  const mine = sorted.filter((c) => commentAgentKey(c) === author.agent_key);
  const lastPerson = sorted.find((c) => c.author_type === 'person') ?? null;
  // The latest question, not the latest comment: a step written after an
  // unanswered question does not make the question answered.
  const question = mine.find((c) => c.kind === 'question') ?? null;
  let open = false;
  if (question) {
    const askedAt = ms(question.created_at);
    const answered = ms(lastPerson?.created_at) > askedAt;
    const moved = ms(taskMovedAt) > askedAt;
    open = !answered && !moved;
  }
  return {
    last_agent_comment_at: mine[0]?.created_at ?? null,
    open_question: open,
    open_question_at: open ? question!.created_at : null,
    last_person_comment_at: lastPerson?.created_at ?? null,
  };
}

/** ALREADY_NUDGED_TODAY for an agent whose last comment was at `lastAt`. */
export function nudgedTodayRefusal(state: ThreadState, lastAt: string): CadenceRefusal {
  const next = new Date(ms(lastAt) + AGENT_COMMENT_INTERVAL_MS).toISOString();
  return {
    ...state,
    last_agent_comment_at: lastAt,
    code: 'ALREADY_NUDGED_TODAY',
    next_comment_at: next,
    reason: `You already wrote on this task at ${lastAt}, and no person has written since.`,
    hint: `The thread takes one agent comment per task per day, sooner only after a person writes; you may comment on this task again from ${next}. Not an error to retry — move on to another task.`,
  };
}

export function decideTaskThreadCadence(input: {
  comments: ThreadComment[];
  author: ThreadAuthor;
  kind: TaskCommentKind;
  taskMovedAt: string | null;
  now?: Date;
}): CadenceVerdict {
  const { comments, author, kind, taskMovedAt } = input;
  const now = (input.now ?? new Date()).getTime();
  const state = readTaskThread(comments, author, taskMovedAt);
  if (author.attended) return { allowed: true, state };

  if ((kind === 'question' || kind === 'comment') && state.open_question) {
    return {
      allowed: false,
      refusal: {
        ...state,
        code: 'QUESTION_STILL_OPEN',
        reason: `Your question on this task (${state.open_question_at}) has no answer yet and the task has not moved since.`,
        hint: 'The question stands; wait for an answer or a change on the task. Not an error to retry — move on to another task.',
      },
    };
  }

  const lastAt = ms(state.last_agent_comment_at);
  const personSince = ms(state.last_person_comment_at) > lastAt;
  if (Number.isFinite(lastAt) && now - lastAt < AGENT_COMMENT_INTERVAL_MS && !personSince) {
    return { allowed: false, refusal: nudgedTodayRefusal(state, state.last_agent_comment_at!) };
  }

  return { allowed: true, state };
}

/**
 * The refusal as a skill answer: a stable code, never retryable, a hint that
 * says what to do instead — and no `error`, because nothing failed.
 */
export function cadenceRefusalAnswer(
  refusal: CadenceRefusal,
  task: { id: string; title: string },
): Record<string, unknown> {
  return {
    status: 'refused',
    code: refusal.code,
    retryable: false,
    reason: refusal.reason,
    hint: refusal.hint,
    task_id: task.id,
    task_title: task.title,
    last_agent_comment_at: refusal.last_agent_comment_at,
    open_question: refusal.open_question,
    ...(refusal.next_comment_at ? { next_comment_at: refusal.next_comment_at } : {}),
    // Nothing was written: an unattended run that only got refused leaves no journal row.
    work_done: 0,
  };
}

// ─── The thread's reads and writes ──────────────────────────────────────────
// The edge deploy can precede `db push` (a fork whose migration push lags, a
// manual `functions deploy`). Without agent_key and insert_task_comment_paced
// every comment would fail, three failures in a row would let self-healing
// disable the skill, and it would stay off after the migration arrived. So a
// missing column or function falls back to the pre-migration read and insert:
// the cadence still decides, only the race lock waits for the migration.

type DbError = { message: string; code?: string } | null;
type DbResult = { data: unknown; error: DbError };
interface DbQuery extends PromiseLike<DbResult> {
  select(columns: string): DbQuery;
  eq(column: string, value: unknown): DbQuery;
  order(column: string, opts: { ascending: boolean }): DbQuery;
  limit(n: number): DbQuery;
  insert(row: Record<string, unknown>): DbQuery;
  single(): PromiseLike<DbResult>;
  maybeSingle(): PromiseLike<DbResult>;
}
interface Db {
  from(table: string): DbQuery;
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<DbResult>;
}

/** An undefined column or function — the schema is older than this code. */
export function isMissingSchemaError(error: DbError): boolean {
  if (!error) return false;
  if (['42703', '42883', 'PGRST202', 'PGRST204'].includes(String(error.code ?? ''))) return true;
  return /does not exist|schema cache/i.test(error.message);
}

/** The thread, newest first. Never decide on a thread that could not be read: the caller checks `error` first. */
export async function readTaskThreadComments(
  supabase: unknown,
  taskId: string,
): Promise<{ comments: ThreadComment[]; error: string | null }> {
  const db = supabase as Db;
  const read = (columns: string) => db.from('project_task_comments').select(columns)
    .eq('task_id', taskId).order('created_at', { ascending: false }).limit(200);
  let { data, error } = await read(THREAD_COLUMNS);
  if (isMissingSchemaError(error)) ({ data, error } = await read(THREAD_COLUMNS_LEGACY));
  if (error) return { comments: [], error: `could not read the task thread: ${error.message}` };
  return { comments: (data ?? []) as ThreadComment[], error: null };
}

/** A person's display name for a comment written on their behalf. */
export async function personDisplayName(supabase: unknown, userId: string): Promise<string> {
  const { data, error } = await (supabase as Db).from('profiles').select('full_name, email').eq('id', userId).maybeSingle();
  if (error) console.warn('[comment_on_task] profile unreadable:', error.message);
  const p = data as { full_name?: string | null; email?: string | null } | null;
  return p?.full_name?.trim() || p?.email || 'FlowChat';
}

export interface PacedComment {
  task_id: string;
  project_id: string;
  body: string;
  kind: TaskCommentKind;
  author_type: 'person' | 'flowpilot' | 'agent';
  author_name: string;
  author_id: string | null;
  agent_key: string;
  /** The agent's latest comment it saw; NULL skips the check (a person at the keyboard). */
  seen_last_at: string | null;
}

export type PacedWrite =
  | { written: true; id: string; created_at: string; locked: boolean }
  | { written: false; last_at: string | null }
  | { error: string };

/**
 * The write: insert_task_comment_paced takes a per-task lock and writes only
 * if no comment from this agent landed since the one it saw. Before the
 * migration, a plain insert of the same row (no lock, no agent_key).
 */
export async function writePacedComment(supabase: unknown, c: PacedComment): Promise<PacedWrite> {
  const db = supabase as Db;
  const { data, error } = await db.rpc('insert_task_comment_paced', {
    p_task_id: c.task_id, p_project_id: c.project_id, p_body: c.body, p_kind: c.kind,
    p_author_type: c.author_type, p_author_name: c.author_name, p_author_id: c.author_id,
    p_agent_key: c.agent_key, p_seen_last_at: c.seen_last_at,
  });
  if (!error) {
    const row = data as { written?: boolean; id?: string; created_at?: string; last_at?: string | null } | null;
    if (row?.written && row.id && row.created_at) return { written: true, id: row.id, created_at: row.created_at, locked: true };
    return { written: false, last_at: row?.last_at ?? null };
  }
  if (!isMissingSchemaError(error)) return { error: error.message };
  const { data: legacy, error: legacyErr } = await db.from('project_task_comments').insert({
    task_id: c.task_id, project_id: c.project_id, body: c.body, kind: c.kind,
    author_type: c.author_type, author_name: c.author_name, author_id: c.author_id,
  }).select('id, created_at').single();
  if (legacyErr) return { error: legacyErr.message };
  const row = legacy as { id: string; created_at: string };
  return { written: true, id: row.id, created_at: row.created_at, locked: false };
}
