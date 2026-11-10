/**
 * Agent work, in plain words (#869) — the pure summary behind the dashboard
 * panel. People see; agents do. For that to hold, a person must be able to
 * tell what is waiting on them and where an agent was stopped, without
 * opening a developer log.
 *
 * Two things that otherwise pass unseen:
 *   - waiting on a person: operations an agent staged, and questions an agent
 *     asked on a task that no person has answered;
 *   - refused and failed: an agent that was quietly stopped.
 *
 * No new data source — agent_activity, pending_operations and
 * project_task_comments as they are. Scheduled ticks (agent 'cron') belong to
 * the Automation Health widget and a person's own clicks ('admin_ui') are not
 * agent work; both are left out.
 */

export interface AgentActivityRow {
  id: string;
  agent: string | null;
  skill_name: string | null;
  status: string | null;
  error_message: string | null;
  output: unknown;
  created_at: string;
  /** The connected agent's key (agent_activity.api_key_id), when the call came over the gateway. */
  api_key_id?: string | null;
  /** The call's `action` and `dry_run` arguments — what makes a manage_* call a read. */
  action?: string | null;
  dry_run?: string | boolean | null;
}

export interface TaskCommentRow {
  task_id: string;
  project_id: string;
  kind: string;
  author_type: string;
  author_name: string | null;
  created_at: string;
}

export interface StoppedCall {
  id: string;
  agent: string;
  skill: string;
  outcome: 'refused' | 'failed';
  reason: string;
  at: string;
}

export interface AgentWorkSummary {
  actionsToday: number;
  /** Distinct agents that did something today, most active first. */
  agentsToday: string[];
  staged: number;
  openQuestions: number;
  refused: number;
  failed: number;
  /** The latest stopped calls, newest first. */
  stopped: StoppedCall[];
  /** The window's successful work per business area, most changes first. */
  areas: AreaWork[];
}

/** What the agents did in one business area (a module) over the window. */
export interface AreaWork {
  /** The owning module's id, or 'platform' for a skill no module owns. */
  module: string;
  /** Calls that changed something. */
  changes: number;
  /** Calls that only looked. */
  lookups: number;
  /** Who did it, most active first. */
  agents: string[];
  /** The skills that changed something, most used first (at most three). */
  topChanges: string[];
  lastAt: string;
}

export interface AgentWorkReaders {
  /** The module that owns a skill (the generated owner map); null for a platform skill. */
  ownerOf?: (skillName: string) => string | null;
  /** Is this call a read? (the platform's one read rule, classifyCall) */
  isRead?: (skillName: string, args: Record<string, unknown>) => boolean;
  /** A connected agent's name by its key id (a2a_peers.name). */
  agentNames?: Record<string, string>;
}

/** The agent as a person names it: the connected agent's own name when its key is known. */
export function agentNameOf(row: Pick<AgentActivityRow, 'agent' | 'api_key_id'>, names?: Record<string, string>): string {
  const named = row.api_key_id ? names?.[row.api_key_id] : undefined;
  return named || agentLabel(row.agent);
}

function callArgs(row: AgentActivityRow): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  if (row.action) args.action = row.action;
  if (row.dry_run === true || row.dry_run === 'true') args.dry_run = true;
  return args;
}

/**
 * Successful agent calls grouped by the module that owns the skill: changes
 * first, lookups as a count. Without a read rule every call counts as a change
 * (nothing is hidden as "only a lookup" on a guess).
 */
export function workByArea(rows: AgentActivityRow[], readers: AgentWorkReaders = {}): AreaWork[] {
  const areas = new Map<string, { changes: number; lookups: number; agents: Map<string, number>; skills: Map<string, number>; lastAt: string }>();
  for (const r of rows) {
    if (r.status !== 'success' || !r.skill_name) continue;
    const module = readers.ownerOf?.(r.skill_name) || 'platform';
    const a = areas.get(module) ?? { changes: 0, lookups: 0, agents: new Map(), skills: new Map(), lastAt: r.created_at };
    const read = readers.isRead ? readers.isRead(r.skill_name, callArgs(r)) : false;
    if (read) a.lookups += 1;
    else {
      a.changes += 1;
      a.skills.set(r.skill_name, (a.skills.get(r.skill_name) ?? 0) + 1);
    }
    const who = agentNameOf(r, readers.agentNames);
    a.agents.set(who, (a.agents.get(who) ?? 0) + 1);
    if (r.created_at > a.lastAt) a.lastAt = r.created_at;
    areas.set(module, a);
  }
  const byCount = (m: Map<string, number>) => [...m].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([k]) => k);
  return [...areas]
    .map(([module, a]) => ({
      module,
      changes: a.changes,
      lookups: a.lookups,
      agents: byCount(a.agents),
      topChanges: byCount(a.skills).slice(0, 3),
      lastAt: a.lastAt,
    }))
    .sort((x, y) => y.changes - x.changes || y.lookups - x.lookups || x.module.localeCompare(y.module));
}

/** Callers that are not agents: a person at the admin, the scheduler, the platform itself. */
const NOT_AN_AGENT = new Set(['admin_ui', 'cron', 'system', 'automation']);

export const AGENT_LABEL: Record<string, string> = {
  flowpilot: 'FlowPilot',
  mcp: 'Connected agent',
  chat: 'Visitor chat',
  flowwork: 'Flowwork',
};

export function agentLabel(agent: string | null | undefined): string {
  const key = (agent ?? '').toLowerCase();
  return AGENT_LABEL[key] ?? (key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Agent');
}

export function isAgentCall(row: Pick<AgentActivityRow, 'agent'>): boolean {
  const a = (row.agent ?? '').toLowerCase();
  return a !== '' && !NOT_AN_AGENT.has(a);
}

/** Why a call stopped, as a person reads it: the refusal's code, or the error's first line. */
export function stopReason(row: AgentActivityRow): string {
  const out = (row.output && typeof row.output === 'object' ? row.output : {}) as Record<string, unknown>;
  const nested = (out.result && typeof out.result === 'object' ? out.result : {}) as Record<string, unknown>;
  const code = [out.code, nested.code].find((c): c is string => typeof c === 'string' && c.length > 0);
  if (code) return code.replace(/_/g, ' ').toLowerCase();
  const text = [row.error_message, out.error, nested.error].find((e): e is string => typeof e === 'string' && e.trim().length > 0);
  if (!text) return row.status === 'refused' ? 'refused' : 'no reason recorded';
  const first = text.trim().split('\n')[0];
  return first.length > 90 ? `${first.slice(0, 87)}…` : first;
}

/**
 * Agent questions no person has answered: per task, the latest agent comment
 * of kind 'question' with no person comment after it. (The thread cadence in
 * _shared/handlers/task-thread-cadence.ts also closes a question when the
 * task moves or seven days pass; the caller bounds the window to seven days.)
 */
export function openQuestionTasks(comments: TaskCommentRow[]): string[] {
  const byTask = new Map<string, TaskCommentRow[]>();
  for (const c of comments) {
    const list = byTask.get(c.task_id) ?? [];
    list.push(c);
    byTask.set(c.task_id, list);
  }
  const open: string[] = [];
  for (const [taskId, list] of byTask) {
    const question = list
      .filter((c) => c.kind === 'question' && c.author_type !== 'person')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (!question) continue;
    const answered = list.some((c) => c.author_type === 'person' && c.created_at > question.created_at);
    if (!answered) open.push(taskId);
  }
  return open;
}

export function summarizeAgentWork(input: {
  activity: AgentActivityRow[];
  comments: TaskCommentRow[];
  stagedCount: number;
  /** Start of the business day, ISO. */
  todayStart: string;
  /** Is this skill's module on? (module-visibility's skillShown) */
  shown: (skillName: string | null) => boolean;
  stoppedLimit?: number;
  readers?: AgentWorkReaders;
}): AgentWorkSummary {
  const names = input.readers?.agentNames;
  const rows = input.activity.filter((r) => isAgentCall(r) && input.shown(r.skill_name));
  const today = rows.filter((r) => r.created_at >= input.todayStart && r.status === 'success');
  const perAgent = new Map<string, number>();
  for (const r of today) perAgent.set(agentNameOf(r, names), (perAgent.get(agentNameOf(r, names)) ?? 0) + 1);

  const stoppedRows = rows.filter((r) => r.status === 'refused' || r.status === 'failed');
  const stopped = stoppedRows
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, input.stoppedLimit ?? 5)
    .map((r) => ({
      id: r.id,
      agent: agentNameOf(r, names),
      skill: r.skill_name ?? 'unknown skill',
      outcome: r.status as 'refused' | 'failed',
      reason: stopReason(r),
      at: r.created_at,
    }));

  return {
    actionsToday: today.length,
    agentsToday: [...perAgent].sort((a, b) => b[1] - a[1]).map(([name]) => name),
    staged: input.stagedCount,
    openQuestions: openQuestionTasks(input.comments).length,
    refused: stoppedRows.filter((r) => r.status === 'refused').length,
    failed: stoppedRows.filter((r) => r.status === 'failed').length,
    stopped,
    areas: workByArea(rows, input.readers),
  };
}
