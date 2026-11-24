// What a skill FlowPilot writes itself may reach (2026-11-24).
//
// skill_create and skill_update took any handler string. The executor runs a
// skill with the service role, so a handler is a capability: `db:<table>` is
// generic CRUD on any table (user_roles included), `edge:<fn>` any edge
// function, `rpc:<fn>` any definer function — and skill_update could rewrite
// the handler of a platform skill the visitor chat runs. FlowChat is an admin
// at the keyboard, but the model reads text strangers wrote (an e-mail, a
// scraped page), and one sentence could have asked for such a skill.
//
// The rule: a skill the agent writes may use a prompt (`ai-task:`), or a
// handler a platform skill already uses — a variant of something the platform
// does, never a new reach. Anything but a prompt stays internal: a twin of an
// internal skill must not reach the visitor chat or the gateway. The handler
// of a platform skill is the platform's, never the agent's to rewrite.
// No live instance carried an agent-made skill when this was written.

export const PROMPT_HANDLER_PREFIX = 'ai-task:';

/** ok, or why not: code and hint are set exactly when ok is false. */
export interface HandlerVerdict { ok: boolean; code?: 'HANDLER_NOT_ALLOWED'; hint?: string }

export function isPromptHandler(handler: unknown): boolean {
  return typeof handler === 'string' && handler.startsWith(PROMPT_HANDLER_PREFIX) && handler.length > PROMPT_HANDLER_PREFIX.length;
}

/** May an agent-made skill use this handler? `platformHandlers` = the handlers platform (non-agent) skills carry. */
export function judgeAgentSkillHandler(handler: unknown, platformHandlers: ReadonlySet<string>): HandlerVerdict {
  if (typeof handler !== 'string' || !handler.trim()) {
    return { ok: false, code: 'HANDLER_NOT_ALLOWED', hint: 'A skill needs a handler: `ai-task:<name>` for a prompt, or the handler of an existing platform skill.' };
  }
  if (isPromptHandler(handler)) return { ok: true };
  if (platformHandlers.has(handler)) return { ok: true };
  return {
    ok: false,
    code: 'HANDLER_NOT_ALLOWED',
    hint: `"${handler}" is not a handler any platform skill uses. A skill you write may use \`ai-task:<name>\` (a prompt) or reuse the exact handler of an existing skill (skill_list shows them). A new reach into the data is a platform change, not a skill.`,
  };
}

/** The scope an agent-made skill gets: only a prompt may reach the visitor chat or the gateway. */
export function agentSkillScope(handler: unknown, requested: unknown): 'internal' | 'external' | 'both' {
  const scope = requested === 'external' || requested === 'both' ? requested : 'internal';
  return isPromptHandler(handler) ? scope : 'internal';
}
