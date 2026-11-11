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

/** One thing a check flags: check_operations / check_books' finding, as both return it. */
export interface CheckFinding {
  id: string;
  area?: string | null;
  severity: 'high' | 'medium' | 'low';
  count: number;
  label: string;
  detail?: string | null;
  fix?: { skill: string; args?: Record<string, unknown> } | null;
}

export interface Flag {
  /** Unique across the checks: `<source>:<id>`. */
  key: string;
  source: 'operations' | 'books';
  area: string;
  severity: 'high' | 'medium' | 'low';
  label: string;
  /** The skill that fixes it, when the check names one; null means it is the owner's to decide. */
  fixSkill: string | null;
  /** How many findings of the same kind this row stands for (1 = just this one). */
  same: number;
}

export interface FlagSummary {
  high: number;
  medium: number;
  low: number;
  total: number;
  /** Rows after findings of the same kind are folded into one. */
  rows: number;
  /** Highest severity first, the checks' own order within a severity. */
  top: Flag[];
}

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

/**
 * What the checks flag, as one list (#869 point 3). The same findings an agent
 * reads from check_operations and check_books — a person sees what the agent
 * was told, with the skill that would fix it. A check that was not run (its
 * module is off, or the reader's role may not ask it) is passed as null and
 * contributes nothing.
 */
export function mergeFlags(
  checks: { operations?: CheckFinding[] | null; books?: CheckFinding[] | null },
  limit = 5,
  /** May the reader see this area? (the role matrix) Omitted: everything the checks answered. */
  mayRead?: (area: string) => boolean,
): FlagSummary {
  const all: Flag[] = [];
  // Findings of the same kind fold into one row: a check that reports one
  // finding per period (`deadline_overdue:agi-2025-09`, …-10, …-11) would
  // otherwise fill the list and push everything else out of sight. The kind is
  // the id up to its colon; severity and fix must agree too.
  const rows = new Map<string, Flag>();
  for (const source of ['operations', 'books'] as const) {
    for (const f of checks[source] ?? []) {
      if (!f || !f.id || !f.label) continue;
      const severity = f.severity in SEVERITY_ORDER ? f.severity : 'low';
      const area = f.area || (source === 'books' ? 'books' : 'operations');
      // A check answers for the whole business; a reader sees their own areas.
      if (mayRead && !mayRead(area)) continue;
      const flag: Flag = {
        key: `${source}:${f.id}`,
        source,
        area,
        severity,
        label: f.label,
        fixSkill: f.fix?.skill ?? null,
        same: 1,
      };
      all.push(flag);
      const kind = f.id.includes(':') ? f.id.slice(0, f.id.indexOf(':')) : f.id;
      const rowKey = `${source}:${kind}:${severity}:${flag.fixSkill ?? ''}`;
      const row = rows.get(rowKey);
      if (row) row.same += 1;
      else rows.set(rowKey, { ...flag });
    }
  }
  // Stable: Array.prototype.sort keeps the checks' own order within a severity.
  const sorted = [...rows.values()].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const count = (s: Flag['severity']) => all.filter((f) => f.severity === s).length;
  return { high: count('high'), medium: count('medium'), low: count('low'), total: all.length, rows: sorted.length, top: sorted.slice(0, limit) };
}

/**
 * The record a call touched, and the page that opens it (#869: "with a link
 * to the object"). `param` is the argument that names the record; a create
 * has no id to send, so the answer's id is read too (see objectOf). Only pages that open ONE record
 * are listed — a guard checks every address against the router.
 */
export interface ObjectRoute {
  param: string;
  entity: string;
  label: string;
  href: (id: string) => string;
  /** The record is named by a slug, not a uuid. */
  slug?: boolean;
}

export const OBJECT_ROUTES: ObjectRoute[] = [
  { param: 'lead_id', entity: 'lead', label: 'lead', href: (id) => `/admin/leads/${id}` },
  { param: 'deal_id', entity: 'deal', label: 'deal', href: (id) => `/admin/deals/${id}` },
  { param: 'contract_id', entity: 'contract', label: 'contract', href: (id) => `/admin/contracts/${id}` },
  { param: 'company_id', entity: 'company', label: 'company', href: (id) => `/admin/companies/${id}` },
  { param: 'ticket_id', entity: 'ticket', label: 'ticket', href: (id) => `/admin/tickets?ticket=${id}` },
  { param: 'quote_id', entity: 'quote', label: 'quote', href: (id) => `/admin/quotes?id=${id}` },
  { param: 'page_id', entity: 'page', label: 'page', href: (id) => `/admin/pages/${id}` },
  { param: 'article_id', entity: 'article', label: 'article', href: (id) => `/admin/knowledge-base/${id}` },
  { param: 'candidate_id', entity: 'candidate', label: 'candidate', href: (id) => `/admin/recruitment/candidates/${id}` },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/;

export interface ObjectLink {
  label: string;
  href: string;
}

/**
 * The record a call was about. When a call names several (a deal created for
 * a company), the one the SKILL is about wins — manage_deal opens the deal.
 * An id that is not a uuid (a placeholder, a name) links nowhere.
 */
export function objectOf(
  skillName: string | null,
  input: Record<string, unknown> | null | undefined,
  /** Ids read from the answer the journal stored: `<param>` (lead_id), `<entity>` (lead.id), `id` and `item` (id, item.id). */
  answered: Record<string, unknown> | null | undefined = null,
): ObjectLink | null {
  const skill = (skillName ?? '').toLowerCase();
  const valid = (r: ObjectRoute, v: unknown): v is string => typeof v === 'string' && (r.slug ? SLUG : UUID).test(v);
  const found: Array<{ route: ObjectRoute; id: string; own: boolean }> = [];
  for (const route of OBJECT_ROUTES) {
    const own = skill.includes(route.entity);
    // What the call was sent; then what it answered: `lead_id`, `lead.id`, and — for the
    // skill's own record only — `id` / `item.id` (shapes seen from add_lead, manage_ticket …).
    const id = [input?.[route.param], answered?.[route.param], answered?.[route.entity], ...(own ? [answered?.id, answered?.item] : [])]
      .find((v) => valid(route, v));
    if (id) found.push({ route, id: id as string, own });
  }
  const pick = found.find((f) => f.own) ?? found[0];
  return pick ? { label: pick.route.label, href: pick.route.href(pick.id) } : null;
}

export interface ChangeRow extends AgentActivityRow {
  input?: Record<string, unknown> | null;
  /** Ids read out of the answer (see objectOf). */
  answered?: Record<string, unknown> | null;
}

export interface Change {
  id: string;
  agent: string;
  skill: string;
  action: string | null;
  at: string;
  object: ObjectLink | null;
}

/** The latest calls that changed something, newest first, each with the record it touched when one is known. */
export function latestChanges(rows: ChangeRow[], readers: AgentWorkReaders = {}, shown: (skill: string | null) => boolean = () => true, limit = 5): Change[] {
  return rows
    .filter((r) => r.status === 'success' && !!r.skill_name && isAgentCall(r) && shown(r.skill_name))
    .filter((r) => !(readers.isRead?.(r.skill_name as string, { ...(r.input ?? {}) }) ?? false))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      agent: agentNameOf(r, readers.agentNames),
      skill: r.skill_name as string,
      action: typeof r.input?.action === 'string' ? (r.input.action as string) : null,
      at: r.created_at,
      object: objectOf(r.skill_name, r.input, r.answered),
    }));
}
