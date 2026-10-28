/**
 * A garbled task id answers with the task it meant.
 *
 * Measured on optic (2026-10-21 and 2026-10-27): FlowPilot's heartbeat read the
 * task "Revisionsberättelse" from a listing, then called comment_on_task with
 *
 *     ace681ae-74cb-4897-9654-a39fed57cee1     (what the model sent)
 *     ace681ae-74cb-4890-ab2e-aebe852895dd     (the task's real id)
 *
 * and again with `…4891-9f91-…` at the next heartbeat. A model reproduces the
 * first half of a UUID it just saw and improvises the tail; Peter's Hermes
 * agent once sent one with an extra character and got Postgres' "invalid input
 * syntax for type uuid". Each time the answer was a dead end — `no task <id>` —
 * so the loop retried three times per heartbeat, 02:00 and 13:00, and never
 * got a word onto the card.
 *
 * The platform rule is the self-correcting error (CLAUDE.md, "Self-correcting
 * RPC errors"), never a routing hack: the handler does NOT act on a guess. It
 * names the task the id most likely meant and asks the agent to re-send with
 * that id — a comment on the wrong card is worse than no comment.
 *
 * Why the prefix lookup is a uuid RANGE and not an ILIKE: PostgREST does not
 * read `id::text` as a cast in a filter — it sends `id ~~* …` against the uuid
 * column and the query crashes (check_order, 2026-07-22). A uuid orders
 * byte-wise, so every id that starts with `ace681ae-74cb` lies between
 * `ace681ae-74cb-0000-…` and `ace681ae-74cb-ffff-…`: exact, server-side, and
 * immune to PostgREST's silent 1000-row cap.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The first 13 characters of a uuid: `xxxxxxxx-xxxx`. */
const PREFIX_RE = /^[0-9a-f]{8}-[0-9a-f]{4}$/i;
/** The tail a 13-char prefix is completed with, low and high. */
const PREFIX_LO = '-0000-0000-000000000000';
const PREFIX_HI = '-ffff-ffff-ffffffffffff';

export const TASK_ID_PREFIX_LENGTH = 13;
export const MAX_TASK_CANDIDATES = 5;

export interface TaskCandidate {
  id: string;
  title: string;
  status: string;
  project_id: string;
}

export type ResolvedTask =
  | { ok: true; id: string; task: TaskCandidate; matched_by: 'id' | 'title' }
  | {
      ok: false;
      error: string;
      code: 'NOT_FOUND' | 'INVALID_INPUT' | 'MISSING_REQUIRED_PARAMETER';
      retryable: true;
      hint: string;
      candidates: TaskCandidate[];
    };

const CANDIDATE_COLUMNS = 'id, title, status, project_id';

/** The slice of a supabase client the resolver uses — structural, so a test can hand in a fake. */
type QueryResult = Promise<{ data: unknown; error: { message: string } | null }>;
interface TaskQuery extends PromiseLike<{ data: unknown; error: { message: string } | null }> {
  select(columns: string): TaskQuery;
  eq(column: string, value: unknown): TaskQuery;
  neq(column: string, value: unknown): TaskQuery;
  gte(column: string, value: unknown): TaskQuery;
  lte(column: string, value: unknown): TaskQuery;
  ilike(column: string, pattern: string): TaskQuery;
  limit(n: number): TaskQuery;
  maybeSingle(): QueryResult;
}
/** Any supabase client will do; the builder is narrowed once, here, rather than typed at two call sites. */
export interface TaskQueryClient {
  from(table: string): unknown;
}
const tasks = (supabase: TaskQueryClient): TaskQuery => supabase.from('project_tasks') as TaskQuery;

/** Escape the LIKE wildcards in a title so "50% done" matches literally. */
function likeLiteral(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Tasks whose id starts with the sent id's first 13 characters. Empty when
 * the sent id's own prefix is not well-formed (nothing to anchor on).
 */
export async function findTasksByIdPrefix(supabase: TaskQueryClient, sentId: string): Promise<TaskCandidate[]> {
  const prefix = sentId.slice(0, TASK_ID_PREFIX_LENGTH).toLowerCase();
  if (!PREFIX_RE.test(prefix)) return [];
  const { data, error } = await tasks(supabase)
    .select(CANDIDATE_COLUMNS)
    .gte('id', `${prefix}${PREFIX_LO}`)
    .lte('id', `${prefix}${PREFIX_HI}`)
    .limit(MAX_TASK_CANDIDATES + 1);
  if (error) return [];
  return (data ?? []) as TaskCandidate[];
}

/**
 * Tasks whose title matches: exact (case-insensitive) first, then contains.
 * `openOnly` keeps the done ones out — a title names the task someone is
 * working on, not its archive.
 */
export async function findTasksByTitle(
  supabase: TaskQueryClient,
  title: string,
  opts: { openOnly?: boolean } = {},
): Promise<TaskCandidate[]> {
  const needle = title.trim();
  if (!needle) return [];
  const run = async (pattern: string) => {
    let q = tasks(supabase).select(CANDIDATE_COLUMNS).ilike('title', pattern);
    if (opts.openOnly) q = q.neq('status', 'done');
    const { data, error } = await q.limit(MAX_TASK_CANDIDATES + 1);
    if (error) return [] as TaskCandidate[];
    return (data ?? []) as TaskCandidate[];
  };
  const exact = await run(likeLiteral(needle));
  if (exact.length) return exact;
  return run(`%${likeLiteral(needle)}%`);
}

function describe(c: TaskCandidate): string {
  return `${c.id} ("${c.title}")`;
}

/**
 * The error an agent gets when its id did not resolve. ONE candidate is named
 * as the task it meant; several are listed; none says where to look.
 */
export function didYouMeanError(
  sentId: string,
  candidates: TaskCandidate[],
  reason: 'not_found' | 'invalid_uuid',
): Extract<ResolvedTask, { ok: false }> {
  const head = reason === 'invalid_uuid'
    ? `no task ${sentId} (not a valid uuid)`
    : `no task ${sentId}`;
  const code = reason === 'invalid_uuid' ? 'INVALID_INPUT' : 'NOT_FOUND';
  if (candidates.length === 1) {
    const c = candidates[0];
    return {
      ok: false,
      error: `${head} — did you mean ${describe(c)}? Re-send with that id.`,
      code,
      retryable: true,
      hint: `The id you sent shares its first ${TASK_ID_PREFIX_LENGTH} characters with exactly one task; copy the id from this message (not from memory) and call again. Nothing was written.`,
      candidates: [c],
    };
  }
  if (candidates.length > 1) {
    const shown = candidates.slice(0, MAX_TASK_CANDIDATES);
    const more = candidates.length > MAX_TASK_CANDIDATES ? ' (more exist)' : '';
    return {
      ok: false,
      error: `${head} — did you mean one of: ${shown.map(describe).join(', ')}${more}? Re-send with the right id.`,
      code,
      retryable: true,
      hint: 'Several tasks match the start of the id you sent; pick the one by title and copy its id from this message. Nothing was written.',
      candidates: shown,
    };
  }
  return {
    ok: false,
    error: `${head}. Nothing matches its prefix; list the project's tasks (manage_project_task list {project_id}) and copy the id from the listing.`,
    code,
    retryable: true,
    hint: 'Ids are copied from a listing, never reproduced from memory. Nothing was written.',
    candidates: [],
  };
}

/**
 * Resolve the task a call refers to, by `task_id` first and `task_title`
 * second — and when neither lands, say which task was most likely meant.
 *
 *  - task_id valid and found → ok.
 *  - task_id invalid (never reaches Postgres) or not found → NOT ok, with the
 *    candidates by id prefix, then by title when one was sent.
 *  - no task_id, task_title given → ok ONLY when exactly one open task carries
 *    that title (`allowTitle`); several → listed; none → NOT_FOUND.
 *
 * It never acts on a guess: the only `ok` answers are an exact id hit and an
 * unambiguous title.
 */
export async function resolveProjectTask(
  supabase: TaskQueryClient,
  args: { task_id?: unknown; task_title?: unknown },
  opts: { allowTitle?: boolean } = {},
): Promise<ResolvedTask> {
  const sentId = String(args.task_id ?? '').trim();
  const sentTitle = String(args.task_title ?? '').trim();

  if (sentId) {
    if (!isUuid(sentId)) {
      // The invalid-uuid pre-check: Postgres would answer "invalid input syntax
      // for type uuid" with nothing to act on. Same lookup, same answer shape.
      let candidates = await findTasksByIdPrefix(supabase, sentId);
      if (!candidates.length && sentTitle) candidates = await findTasksByTitle(supabase, sentTitle);
      return didYouMeanError(sentId, candidates, 'invalid_uuid');
    }
    const { data, error } = await tasks(supabase)
      .select(CANDIDATE_COLUMNS)
      .eq('id', sentId)
      .maybeSingle();
    if (error) {
      return {
        ok: false,
        error: `Task lookup failed: ${error.message}`,
        code: 'NOT_FOUND',
        retryable: true,
        hint: 'Repeat the call once; if it fails again, list the project\'s tasks and copy the id.',
        candidates: [],
      };
    }
    if (data) {
      const task = data as TaskCandidate;
      return { ok: true, id: task.id, task, matched_by: 'id' };
    }
    let candidates = await findTasksByIdPrefix(supabase, sentId);
    if (!candidates.length && sentTitle) candidates = await findTasksByTitle(supabase, sentTitle);
    return didYouMeanError(sentId, candidates, 'not_found');
  }

  if (sentTitle && opts.allowTitle) {
    const open = await findTasksByTitle(supabase, sentTitle, { openOnly: true });
    if (open.length === 1) {
      return { ok: true, id: open[0].id, task: open[0], matched_by: 'title' };
    }
    if (open.length > 1) {
      const shown = open.slice(0, MAX_TASK_CANDIDATES);
      return {
        ok: false,
        error: `task_title "${sentTitle}" matches ${open.length > MAX_TASK_CANDIDATES ? 'more than ' + MAX_TASK_CANDIDATES : open.length} open tasks: ${shown.map(describe).join(', ')}. Re-send with task_id.`,
        code: 'NOT_FOUND',
        retryable: true,
        hint: 'A title identifies a task only when it is unique among open tasks; pick one and send its id.',
        candidates: shown,
      };
    }
    return {
      ok: false,
      error: `no open task titled "${sentTitle}". List the project's tasks (manage_project_task list {project_id}) and send task_id from the listing.`,
      code: 'NOT_FOUND',
      retryable: true,
      hint: 'Done tasks are not matched by title; use task_id for those.',
      candidates: [],
    };
  }

  return {
    ok: false,
    error: opts.allowTitle
      ? 'task_id is required (or task_title, when it names exactly one open task)'
      : 'task_id is required',
    code: 'MISSING_REQUIRED_PARAMETER',
    retryable: true,
    hint: 'Copy task_id from a task listing.',
    candidates: [],
  };
}
