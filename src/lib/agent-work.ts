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
}): AgentWorkSummary {
  const rows = input.activity.filter((r) => isAgentCall(r) && input.shown(r.skill_name));
  const today = rows.filter((r) => r.created_at >= input.todayStart && r.status === 'success');
  const perAgent = new Map<string, number>();
  for (const r of today) perAgent.set(agentLabel(r.agent), (perAgent.get(agentLabel(r.agent)) ?? 0) + 1);

  const stoppedRows = rows.filter((r) => r.status === 'refused' || r.status === 'failed');
  const stopped = stoppedRows
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, input.stoppedLimit ?? 5)
    .map((r) => ({
      id: r.id,
      agent: agentLabel(r.agent),
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
  };
}
