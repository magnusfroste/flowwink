/**
 * The gateway's own "no" — answered so an agent can act on it, and written
 * down so a person can see it.
 *
 * Measured on optic and www over two weeks (2026-11-04 → 11-17): an agent that
 * ran a skill by a name that does not exist got "Unknown skill: x" and the call
 * left no trace. `read_skill` with an unknown name was journaled; `execute_skill`
 * was not, and neither was a tool the client called that the connection does
 * not carry, a call outside the key's scope, a call outside the owner's reach or
 * a write on a read-only key. Hermes made up ten skill names on www in one week
 * and the only ones anyone could see were the three it happened to `read_skill`
 * first — which the machine room then filed upstream as "Skill failing:
 * read_skill", because a row without a code is read by its message and the
 * message classifier calls "Unknown skill" a handler error.
 *
 * So every refusal the gateway makes BEFORE the executor is one shape: an
 * answer with the envelope's `code`, `retryable` and `hint` (and, for a name
 * that is not there, the names that are), and one row in agent_activity with
 * the same code. The codes are all a caller's (NOT_A_SKILL_FAULT): a miss never
 * counts toward self-healing and is never a defect the machine room reports.
 *
 * Pure functions only — mcp-server applies them, the tests read them.
 */

/** The step a run that never started is journaled under, when the name it asked for is no skill. */
export const GATEWAY_RUN_STEP = 'execute_skill';

/** The longest caller-sent name that is echoed or stored. */
export const MISS_NAME_MAX = 120;

/** The most names an unknown one is answered with. */
export const MAX_NAME_SUGGESTIONS = 5;

/** How the caller asked: the dispatch tools, or a tool called by its own name. */
export type MissCalledAs = 'execute_skill' | 'read_skill' | 'tool';

/** Why a name is not there, as far as the gateway can tell. */
export type UnknownReason = 'no_such_skill' | 'module_off' | 'not_on_this_connection' | 'skill_called_as_tool';

export type GatewayMiss =
  | {
      kind: 'unknown_skill';
      /** The name as the caller sent it. */
      name: string;
      calledAs: MissCalledAs;
      /** The connection is `?mode=dispatch`: a skill is run through execute_skill there. */
      dispatch?: boolean;
      /** The module that owns the skill, when the name IS a skill this deploy knows. */
      ownerModule?: string | null;
      /** That module is switched off on this instance. */
      moduleOff?: boolean;
      /** The name is a skill this connection carries — only not as a tool of its own (dispatch). */
      isSkillHere?: boolean;
      /** The nearest names this connection does carry. */
      didYouMean?: readonly string[];
    }
  | { kind: 'forbidden'; skill: string; reason: string; calledAs?: MissCalledAs }
  | { kind: 'out_of_scope'; skill: string; calledAs?: MissCalledAs }
  | { kind: 'read_only_key'; skill: string };

export type GatewayMissCode = 'NOT_FOUND' | 'FORBIDDEN' | 'READ_ONLY_KEY';

/** The code each miss answers and stores. Every one is a caller's — see NOT_A_SKILL_FAULT. */
export const GATEWAY_MISS_CODES: Record<GatewayMiss['kind'], GatewayMissCode> = {
  unknown_skill: 'NOT_FOUND',
  forbidden: 'FORBIDDEN',
  out_of_scope: 'FORBIDDEN',
  read_only_key: 'READ_ONLY_KEY',
};

/** The HTTP status the REST door answers a miss with. */
export const GATEWAY_MISS_HTTP: Record<GatewayMiss['kind'], number> = {
  unknown_skill: 404,
  forbidden: 403,
  out_of_scope: 403,
  read_only_key: 403,
};

export interface GatewayMissAnswer {
  error: string;
  code: GatewayMissCode;
  retryable: boolean;
  hint: string;
  did_you_mean?: string[];
}

export function clipName(name: unknown): string {
  const s = typeof name === 'string' ? name.trim() : '';
  return s.length > MISS_NAME_MAX ? `${s.slice(0, MISS_NAME_MAX)}…` : s;
}

export function unknownReason(m: Extract<GatewayMiss, { kind: 'unknown_skill' }>): UnknownReason {
  // The name is right and the connection carries it — the door is wrong.
  if (m.calledAs === 'tool' && m.dispatch && m.isSkillHere) return 'skill_called_as_tool';
  if (m.ownerModule && m.moduleOff) return 'module_off';
  if (m.ownerModule || m.isSkillHere) return 'not_on_this_connection';
  return 'no_such_skill';
}

/**
 * Where a connection's names are read: search_skills on a dispatch connection,
 * the tool list on one that carries every skill as a tool of its own.
 */
function whereTheNamesAre(dispatch: boolean | undefined): string {
  return dispatch
    ? 'search_skills shows what this connection can run'
    : 'tools/list (GET /rest/tools over REST) shows what this connection can run';
}

/**
 * What the agent is told. One sentence of error, one of hint — the hint says
 * the next call, never "contact support".
 */
export function gatewayMissAnswer(m: GatewayMiss): GatewayMissAnswer {
  const code = GATEWAY_MISS_CODES[m.kind];
  if (m.kind === 'unknown_skill') {
    const name = clipName(m.name);
    const near = (m.didYouMean ?? []).slice(0, MAX_NAME_SUGGESTIONS);
    const noun = m.calledAs === 'tool' ? 'tool' : 'skill';
    const reason = unknownReason(m);
    if (reason === 'skill_called_as_tool') {
      return {
        error: `Unknown tool: ${name}. This connection is in dispatch mode — run the skill with execute_skill.`,
        code, retryable: true,
        hint: `Call execute_skill with { "name": "${name}", "arguments": { … } }. read_skill shows its parameters first.`,
      };
    }
    if (reason === 'module_off') {
      return {
        error: `Unknown ${noun}: ${name}. It belongs to the ${m.ownerModule} module, which is switched off on this instance.`,
        code, retryable: false,
        hint: `Nothing here runs ${name} until an admin switches the ${m.ownerModule} module on (Modules, or manage_modules); ${whereTheNamesAre(m.dispatch)}.`,
        ...(near.length ? { did_you_mean: [...near] } : {}),
      };
    }
    if (reason === 'not_on_this_connection') {
      return {
        error: `Unknown ${noun}: ${name}. It is a FlowWink skill, but this connection does not carry it.`,
        code, retryable: false,
        hint: `The skill is switched off, not exposed to agents, or outside the groups this connection or its key is limited to; ${whereTheNamesAre(m.dispatch)}. An admin widens it under Developer → MCP Keys.`,
        ...(near.length ? { did_you_mean: [...near] } : {}),
      };
    }
    return {
      error: near.length
        ? `Unknown ${noun}: ${name} — did you mean ${near.length === 1 ? near[0] : `one of: ${near.join(', ')}`}?`
        : m.dispatch
          ? `Unknown ${noun}: ${name}. Use search_skills to discover valid names.`
          : `Unknown ${noun}: ${name}. The names this connection carries are in tools/list.`,
      code, retryable: true,
      hint: near.length
        ? `Names are copied from a listing, never composed. Re-send with one of the names above; ${whereTheNamesAre(m.dispatch)}.`
        : m.dispatch
          ? 'No skill is called that, or close to it. Call search_skills with what you want to do (the intent, not a name) and run the name it returns.'
          : 'No tool is called that, or close to it. Read the names from tools/list (GET /rest/tools over REST), or connect with ?mode=dispatch and call search_skills with what you want to do.',
      ...(near.length ? { did_you_mean: [...near] } : {}),
    };
  }
  if (m.kind === 'forbidden') {
    return {
      error: `Forbidden: ${m.reason}`,
      code, retryable: false,
      hint: 'This is a question for an admin, not a reason to retry: the person this agent acts for lacks the module or the role. Report it and go on with what is within reach.',
    };
  }
  if (m.kind === 'out_of_scope') {
    return {
      error: `API key scope does not permit skill '${m.skill}'.`,
      code, retryable: false,
      hint: 'The key this connection uses is limited to certain groups or skills, and this one is outside them. An admin widens the key under Developer → MCP Keys.',
    };
  }
  return {
    error: `This API key is read-only: '${m.skill}' writes and declares no dry_run.`,
    code, retryable: false,
    hint: 'Read-only keys run read skills as they are and writes only as dry runs (skills with a dry_run parameter). For a write, connect with a key that is not read-only — an admin creates one under Developer → MCP Keys.',
  };
}

export interface GatewayMissRow {
  skill_name: string;
  status: 'failed';
  error_message: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  /** Set when the miss names a real skill: its row is read with that skill's module. */
  ownedSkill: string | null;
}

/**
 * What a refused call's arguments leave in the journal: the action and the
 * names of what was sent, never the values — the call did not run, and a body
 * that was never written has no business in the log.
 */
export function refusedCallInput(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return {};
  const a = args as Record<string, unknown>;
  const keys = Object.keys(a).filter((k) => !k.startsWith('_')).sort();
  return {
    ...(typeof a.action === 'string' ? { action: a.action.slice(0, 60) } : {}),
    ...(keys.length ? { _argument_names: keys.slice(0, 40) } : {}),
  };
}

/**
 * The journal row of a miss. A name that is no skill is filed under the step
 * that was asked (`read_skill`, or `execute_skill` for every way of running),
 * with the name in `input.name` — skill_name stays a closed vocabulary. A
 * refusal of a real skill is filed under that skill.
 */
export function gatewayMissRow(m: GatewayMiss, args?: unknown): GatewayMissRow {
  const answer = gatewayMissAnswer(m);
  if (m.kind === 'unknown_skill') {
    const name = clipName(m.name);
    return {
      skill_name: m.calledAs === 'read_skill' ? 'read_skill' : GATEWAY_RUN_STEP,
      status: 'failed',
      error_message: `Unknown ${m.calledAs === 'tool' ? 'tool' : 'skill'}: ${name}`,
      input: { name, ...(m.calledAs === 'tool' ? { called_as: 'tool' } : {}) },
      output: {
        code: answer.code,
        reason: unknownReason(m),
        ...(m.ownerModule ? { module: m.ownerModule } : {}),
        ...(answer.did_you_mean?.length ? { did_you_mean: answer.did_you_mean } : {}),
      },
      ownedSkill: null,
    };
  }
  const readStep = m.kind !== 'read_only_key' && m.calledAs === 'read_skill';
  return {
    // Reading a skill's playbook is the discovery step, whoever the skill is.
    skill_name: readStep ? 'read_skill' : m.skill,
    status: 'failed',
    error_message: answer.error,
    input: readStep ? { name: m.skill } : refusedCallInput(args),
    output: { code: answer.code, reason: m.kind },
    ownedSkill: readStep ? null : m.skill,
  };
}

const VERBS = new Set([
  'manage', 'list', 'get', 'read', 'create', 'add', 'new', 'update', 'edit', 'set', 'delete', 'remove',
  'search', 'find', 'browse', 'query', 'show', 'view', 'fetch', 'lookup', 'check', 'run', 'do', 'make',
  'write', 'send', 'upload', 'upsert', 'all', 'my', 'the',
]);

function nameTokens(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((t) => (t.length > 3 && t.endsWith('ies') ? `${t.slice(0, -3)}y` : t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));
}

/** A name's tokens weigh 1; a verb every other skill also starts with weighs a quarter. */
function weight(token: string): number {
  return VERBS.has(token) ? 0.25 : 1;
}

/** The share of two names' weighted tokens that both carry: 0 (nothing) to 1 (the same words). */
export function nameNearness(sent: string, candidate: string): number {
  const a = new Set(nameTokens(sent));
  const b = new Set(nameTokens(candidate));
  if (!a.size || !b.size) return 0;
  let shared = 0;
  let all = 0;
  let sharedSubject = false;
  for (const t of new Set([...a, ...b])) {
    const w = weight(t);
    all += w;
    if (a.has(t) && b.has(t)) {
      shared += w;
      if (!VERBS.has(t)) sharedSubject = true;
    }
  }
  // Two names that share only a verb ("manage_x", "manage_y") are not near.
  if (!sharedSubject) return 0;
  return all ? shared / all : 0;
}

/** Below this, a name is not offered: a suggestion that is a guess sends the agent the wrong way. */
export const NAME_NEARNESS_MIN = 0.34;

/**
 * The names an unknown one most likely meant: the ones that share its subject
 * words. A did-you-mean over names (`manage_documents` → `manage_document`,
 * `list_tasks` → `manage_project_task`), not a search — what the agent WANTS is
 * search_skills' question.
 */
export function nearestSkillNames(
  sent: string,
  names: readonly string[],
  max: number = MAX_NAME_SUGGESTIONS,
): string[] {
  const clipped = clipName(sent);
  if (!clipped) return [];
  return names
    .map((name) => ({ name, score: nameNearness(clipped, name) }))
    .filter((c) => c.score >= NAME_NEARNESS_MIN && c.name !== clipped)
    .sort((x, y) => y.score - x.score || x.name.length - y.name.length || x.name.localeCompare(y.name))
    .slice(0, max)
    .map((c) => c.name);
}
