/**
 * The read surface — which skills FlowWork may execute on behalf of an
 * employee mid-conversation.
 *
 * FlowWork gives every colleague a dispatch loop over the same skill catalog
 * an external operator reaches through the MCP gateway. The difference is the
 * blast radius: an employee asking "has this customer paid?" must never
 * accidentally trigger a send, a booking or a deletion because a model chose
 * an eager tool. So the loop's execute step is gated here, fail-closed — a
 * skill passes because a rule in this file says so, never by default.
 *
 * Same pattern as the resumption guard's IDEMPOTENT_SKILLS allowlist (H11
 * Phase 2.5): the guard IS the gate. Writes are not "blocked" so much as
 * re-routed — the model is told to PROPOSE the action instead, and the human
 * clicks. When FlowWork later grows staged writes, that flow goes through
 * pending_operations like every other agent write on the platform.
 *
 * This is a PLATFORM primitive (deliberately not FlowWork-named): the same
 * predicate is the natural gate for a future read-only MCP key rung.
 */

/** Name prefixes that denote read-only skills by platform convention. */
const READ_PREFIXES = [
  'list_',
  'get_',
  'search_',
  'browse_',
  'query_',
  'count_',
  'find_',
  'check_',
  'view_',
  'preview_',
];

/**
 * Read-only skills whose names don't follow the prefix convention.
 * Explicit, so a rename shows up as a diff — not as silently lost access.
 */
const READ_EXTRAS = new Set([
  'accounting_reports',
  'ar_aging_report',
  'budget_vs_actual',
  'consolidation_report',
  'consultant_utilization_report',
  // Pure schema lookup — returns the block type list and field contracts,
  // touches no data. It is the one call that makes a block write correct on
  // the first try, and FlowWork's loop could not reach it (no read_ prefix),
  // so an employee's page request had to guess field names.
  'describe_blocks',
  'contract_renewal_check',
  'crm_followup_report',
  'cron_health_report',
  'prepare_vat_return', // read-only by contract: computes, never books
  'upcoming_renewals',
  'invoice_overdue_check',
  'vat_box_coverage',
  'year_end_readiness',
  'scrape_url',
  'search_web',
]);

/**
 * Hard denials that override everything above. A prefix match is convention;
 * these words are evidence the convention doesn't hold. Fail closed.
 */
const DENY_PATTERN = /(api_key|secret|credential|password|token|delete|remove|purge|wipe|reset|destroy)/;

export function isReadSkill(name: string): boolean {
  const n = String(name || '').toLowerCase().trim();
  if (!n) return false;
  if (DENY_PATTERN.test(n)) return false;
  if (READ_EXTRAS.has(n)) return true;
  return READ_PREFIXES.some((p) => n.startsWith(p));
}

/**
 * Actions that make a manage_* call a READ. Most modules expose one
 * manage_<entity> skill whose verb lives in arguments.action — tickets, for
 * instance, have no list_tickets at all, only manage_ticket({action:'list'}).
 * A name gate alone would lock the read surface out of half the platform.
 */
const READ_ACTIONS = new Set(['list', 'get', 'search', 'view', 'check', 'status']);

/**
 * Judge the CALL, not just the name. manage_* skills pass only when the action
 * argument is explicitly a read verb — a missing or unknown action fails
 * closed, because we refuse to bet on a handler's default branch.
 */
export function isReadCall(name: string, args?: Record<string, unknown>): boolean {
  if (isReadSkill(name)) return true;
  const n = String(name || '').toLowerCase().trim();
  if (!n.startsWith('manage_') || DENY_PATTERN.test(n)) return false;
  const action = String((args as any)?.action ?? '').toLowerCase().trim();
  return READ_ACTIONS.has(action);
}

/**
 * Three tiers, decided per CALL:
 *   'read'  — execute immediately (isReadCall)
 *   'stage' — a write: create a pending operation, human click executes
 *   'deny'  — never touched from chat (secrets, deletion-shaped, empty)
 * Fail-closed: the deny pattern wins over everything.
 */
export function classifyCall(
  name: string,
  args?: Record<string, unknown>,
): 'read' | 'stage' | 'deny' {
  const n = String(name || '').toLowerCase().trim();
  if (!n || DENY_PATTERN.test(n)) return 'deny';
  if (isReadCall(name, args)) return 'read';
  return 'stage';
}

/**
 * Is this skill allowed to APPEAR in a discovery result (search_skills)?
 *
 * The boundary: **visible = what the caller could read, or could stage.**
 * Not "visible = what executes immediately". Those are different questions and
 * conflating them cost the surface 328 of 536 skills — FlowWork's search
 * filtered on the READ predicate, so every pure write (place_order,
 * receive_purchase_order, refund_return, record_invoice_payment, ship_picking…)
 * was undiscoverable, and the model could only reach one by being told its name
 * out loud. Which worked perfectly when a human did it: "use place_order"
 * staged a correct operation on the first try (QA, 2026-08-20). The staging
 * tier exists precisely so a write can be proposed safely; hiding writes from
 * discovery threw that away and left the loop unable to find its own hands.
 *
 * The deny tier stays hidden — secrets and deletion-shaped skills are not
 * proposable, so listing them would only teach the model to ask for what it
 * can never have.
 *
 * Name-only judgement (no args yet at discovery time), which is why this asks
 * classifyCall with a read action: a manage_* skill is discoverable as its
 * readable self, and its write actions are reachable through staging.
 */
export function isDiscoverableSkill(name: string): boolean {
  return classifyCall(name, { action: 'list' }) !== 'deny';
}

/** What the model is told when it reaches for a skill outside the surface. */
export const WRITE_REFUSAL =
  'FlowWork runs a read-only tool surface. This skill would change data, so it was not executed. ' +
  'Describe the action you recommend and point the user to the right admin page — or, if they ask, ' +
  'draft the exact skill call so an admin can run it.';

/** What the model is told when a write was staged instead of executed. */
export const STAGE_NOTICE =
  'The action was NOT executed. It is staged as a pending operation awaiting the user\'s approval — an approval card is shown in the chat. ' +
  'Summarize exactly what will happen when approved. Never claim the action is done.';
