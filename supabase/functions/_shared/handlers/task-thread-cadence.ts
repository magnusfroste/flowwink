/**
 * The cadence the task thread keeps for agents (comment_on_task).
 *
 * The thread is where people and agents write together, and a person reads it.
 * "One comment per task per day; never repeat an unanswered question" used to
 * be prose in project_portfolio_brief's instructions, and the model did not
 * follow it: on optic one task carried 48 FlowPilot comments and none from a
 * person — the same "who owns the next step?" twice a day for a month. So the
 * platform keeps the cadence here, before the insert, for every agent caller:
 *
 *   * ALREADY_NUDGED_TODAY — the same agent wrote on this task in the last 24 h.
 *   * QUESTION_STILL_OPEN  — the agent's latest question has no person comment
 *     after it and the task has not changed since it was asked. Applies to
 *     question/comment; a step or decision reports the agent's own work and
 *     is held only to the once-a-day rule.
 *
 * Both are refusals, not errors to retry. A person is never refused.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type TaskCommentKind = 'step' | 'question' | 'decision' | 'comment';
export type TaskCommentAuthorType = 'person' | 'flowpilot' | 'agent';

/** One agent comment per task per this window. */
export const AGENT_COMMENT_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface ThreadComment {
  author_type: string;
  author_name: string | null;
  kind: string;
  created_at: string;
}

export interface ThreadAuthor {
  author_type: TaskCommentAuthorType;
  author_name: string;
}

export interface ThreadState {
  /** The calling agent's latest comment on the task, if any. */
  last_agent_comment_at: string | null;
  /** The calling agent's latest question still stands: no person answered, the task did not change. */
  open_question: boolean;
  open_question_at: string | null;
}

export type CadenceVerdict =
  | ({ allowed: true } & ThreadState)
  | ({
    allowed: false;
    code: 'ALREADY_NUDGED_TODAY' | 'QUESTION_STILL_OPEN';
    error: string;
    hint: string;
    next_comment_at?: string;
  } & ThreadState);

/**
 * FlowPilot is one voice whatever name it signs with; an external agent is
 * told apart by the name it writes under.
 */
function isSameAgent(c: ThreadComment, author: ThreadAuthor): boolean {
  if (c.author_type !== author.author_type) return false;
  return author.author_type === 'flowpilot' || (c.author_name ?? '') === author.author_name;
}

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);

/** What the thread says about this agent: when it last wrote, and whether its question stands. */
export function readTaskThread(
  comments: ThreadComment[],
  author: ThreadAuthor,
  taskUpdatedAt: string | null,
): ThreadState {
  const sorted = [...comments].sort((a, b) => ms(b.created_at) - ms(a.created_at));
  const mine = sorted.filter((c) => isSameAgent(c, author));
  const last = mine[0] ?? null;
  // The latest question, not the latest comment: a step written after an
  // unanswered question does not make the question answered.
  const question = mine.find((c) => c.kind === 'question') ?? null;
  let open = false;
  if (question) {
    const askedAt = ms(question.created_at);
    const answered = sorted.some((c) => c.author_type === 'person' && ms(c.created_at) > askedAt);
    const taskChanged = ms(taskUpdatedAt) > askedAt;
    open = !answered && !taskChanged;
  }
  return {
    last_agent_comment_at: last?.created_at ?? null,
    open_question: open,
    open_question_at: open ? question!.created_at : null,
  };
}

export function decideTaskThreadCadence(input: {
  comments: ThreadComment[];
  author: ThreadAuthor;
  kind: TaskCommentKind;
  taskUpdatedAt: string | null;
  now?: Date;
}): CadenceVerdict {
  const { comments, author, kind, taskUpdatedAt } = input;
  const now = (input.now ?? new Date()).getTime();
  const state = readTaskThread(comments, author, taskUpdatedAt);
  if (author.author_type === 'person') return { allowed: true, ...state };

  if ((kind === 'question' || kind === 'comment') && state.open_question) {
    return {
      allowed: false,
      ...state,
      code: 'QUESTION_STILL_OPEN',
      error: `Your question on this task (${state.open_question_at}) has no answer yet and the task has not changed since.`,
      hint: 'The question stands; wait for an answer or a change on the task. Not an error to retry — move on to another task.',
    };
  }

  const lastAt = ms(state.last_agent_comment_at);
  if (Number.isFinite(lastAt) && now - lastAt < AGENT_COMMENT_INTERVAL_MS) {
    const next = new Date(lastAt + AGENT_COMMENT_INTERVAL_MS).toISOString();
    return {
      allowed: false,
      ...state,
      code: 'ALREADY_NUDGED_TODAY',
      next_comment_at: next,
      error: `You already wrote on this task at ${state.last_agent_comment_at}.`,
      hint: `The thread takes one agent comment per task per day; you may comment on this task again from ${next}. Not an error to retry — move on to another task.`,
    };
  }

  return { allowed: true, ...state };
}

/** The task's updated_at and its latest comments — what the cadence is decided on. */
export async function readTaskThreadContext(
  supabase: SupabaseClient,
  taskId: string,
): Promise<{ comments: ThreadComment[]; taskUpdatedAt: string | null; error?: string }> {
  const [{ data: task, error: taskErr }, { data: thread, error: threadErr }] = await Promise.all([
    supabase.from('project_tasks').select('updated_at').eq('id', taskId).maybeSingle(),
    supabase.from('project_task_comments')
      .select('author_type, author_name, kind, created_at').eq('task_id', taskId)
      .order('created_at', { ascending: false }).limit(200),
  ]);
  const err = taskErr ?? threadErr;
  if (err) return { comments: [], taskUpdatedAt: null, error: `could not read the task thread: ${err.message}` };
  return { comments: (thread ?? []) as ThreadComment[], taskUpdatedAt: (task?.updated_at as string | null) ?? null };
}

/** A refusal in the agent envelope: a stable code, never retryable, a hint that says what to do instead. */
export function cadenceRefusal(verdict: Extract<CadenceVerdict, { allowed: false }>, taskId: string): Record<string, unknown> {
  return {
    success: false,
    error: verdict.error,
    code: verdict.code,
    retryable: false,
    hint: verdict.hint,
    task_id: taskId,
    last_agent_comment_at: verdict.last_agent_comment_at,
    open_question: verdict.open_question,
    ...(verdict.next_comment_at ? { next_comment_at: verdict.next_comment_at } : {}),
  };
}
