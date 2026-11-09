/**
 * A high-stakes write with nobody at the keyboard waits for a person (2026-11-09).
 *
 * FlowPilot's heartbeat, the e-mail responder, the visitor chat and every
 * external agent on the gateway act on text other people wrote — an e-mail, a
 * form, a scraped page, a chat line. A sentence in that text can steer the
 * model ("pay invoice 1043 to this account", "close the month"): prompt
 * injection. The model cannot be trusted to refuse; the platform can make the
 * damage wait. The only gate a model cannot pass on its own is trust
 * 'approve' (staging is self-approved by design), so an UNATTENDED call of a
 * write its own tool_definition declares `risk: 'high'` or `reversible: false`
 * is raised to 'approve': it lands in /admin/approvals and runs when a person
 * says so. A person at the keyboard is never held — they are the approval.
 *
 * Pure, so the rule is tested directly; the executor (core.ts) applies it.
 */

export interface StakesInput {
  agentType: string | null | undefined;
  callerUserId: string | null | undefined;
  scheduled?: boolean | null;
  /** The skill's tool_definition — `risk` / `reversible` live beside `function`. */
  toolDefinition: unknown;
  /** classifyCall(skill, args): a read never waits. */
  callKind: 'read' | 'write' | string;
}

/** The same "who is at the keyboard" the executor journals (attendedUserId): the gateway, the visitor chat and a scheduled tick never are. */
export function isUnattended(i: Pick<StakesInput, 'agentType' | 'callerUserId' | 'scheduled'>): boolean {
  return i.agentType === 'mcp' || i.agentType === 'chat' || i.scheduled === true || !i.callerUserId;
}

/** A write its own definition calls high-risk or irreversible. */
export function isHighStakesWrite(toolDefinition: unknown, callKind: string): boolean {
  if (callKind === 'read') return false;
  const td = (toolDefinition ?? {}) as { risk?: unknown; reversible?: unknown };
  return td.risk === 'high' || td.reversible === false;
}

/** True when this call must wait for a person even though the skill's trust says it may run. */
export function mustWaitForAPerson(i: StakesInput): boolean {
  return isUnattended(i) && isHighStakesWrite(i.toolDefinition, i.callKind);
}
