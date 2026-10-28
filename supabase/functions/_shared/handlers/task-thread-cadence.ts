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

/** The identity of the caller, from what the server knows — never from the model's arguments. */
export function threadAuthorFor(input: {
  agentType: string;
  callerAgentName: string | null;
  attendedUserId: string | null;
}): ThreadAuthor {
  if (input.attendedUserId) return { agent_key: `person:${input.attendedUserId}`, attended: true };
  if (input.agentType === 'flowpilot') return { agent_key: 'flowpilot', attended: false };
  return { agent_key: input.callerAgentName || input.agentType, attended: false };
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
    refused: true,
    code: refusal.code,
    retryable: false,
    message: refusal.reason,
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
