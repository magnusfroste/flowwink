/**
 * When a skill call may switch its module ON.
 *
 * agent-execute turns a module on the first time one of its `module:` skills
 * runs (Law 4: a working capability should not sit behind a manual flag).
 * Until 2026-10-23 it did so for EVERY call, reads included — and a module can
 * have a public side effect. On synclair a connected ChatGPT ran
 * `manage_orders({action:'list'})` every morning around 06:00 as part of its
 * routine; each call switched the e-commerce module back on, the storefront
 * dial had never been set, and the cart reappeared in the header of a site
 * that sells nothing. The operator switched it off; the next morning it was
 * on again, and nothing in the activity log said why.
 *
 * Two rules:
 *  1. A READ never wakes a module. Asking "are there any orders?" is not a
 *     decision to run a shop. The read judgement is the shared one
 *     (isReadCall — name prefixes, read extras, manage_* with a read action),
 *     so there is one definition of "read" on the platform, and anything it
 *     cannot prove is a read still wakes the module, as before (fail toward
 *     the old behaviour, never toward silence).
 *  2. A wake is VISIBLE: an audit_logs row and a note in the skill result, so
 *     the agent can tell its human and the operator can see who did it.
 */
import { isReadCall } from '../skills/read-surface.ts';

export function callWakesModule(skillName: string, args?: Record<string, unknown>): boolean {
  return !isReadCall(skillName, args);
}

/** The audit_logs row written when a call switches a module on. */
export function moduleWakeAuditRow(
  settingKey: string,
  ctx: { skillName: string; handler: string; args?: Record<string, unknown> },
) {
  const action = (ctx.args as { action?: unknown } | undefined)?.action;
  return {
    entity_type: 'module',
    entity_id: settingKey,
    action: 'module.auto_enabled',
    metadata: {
      skill: ctx.skillName,
      handler: ctx.handler,
      ...(typeof action === 'string' && action ? { skill_action: action } : {}),
      reason: 'first write through one of the module\'s skills',
    },
  };
}

/** What the caller is told, attached to the skill result. */
export function moduleWakeNote(settingKey: string, skillName: string): string {
  return `The ${settingKey} module was off and has been switched on, because ${skillName} writes through it. `
    + 'A module can change the public site (e-commerce shows a cart unless store.storefront is false) — tell the operator, '
    + 'and switch it off again in Admin → Modules if that was not intended.';
}
