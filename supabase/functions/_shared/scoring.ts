/**
 * The one decision behind a score bump, extracted so a test can RUN it.
 *
 * The bug it encodes (2026-08-30): a failed read was indistinguishable from
 * "the lead has no score", so the caller wrote the rule's value over whatever
 * history existed. The rule is now explicit and testable — a score bump ADDS,
 * and an unknown current score is only ever treated as 0 when the row really
 * says so.
 *
 * Extracted rather than inlined because tonight's guardrail audit showed the
 * pattern plainly: every guardrail that imports and executes the code it
 * protects caught its mutation; every one that greps for a string did not.
 */
export function nextScore(current: number | null | undefined, delta: number): number {
  return (typeof current === 'number' ? current : 0) + delta;
}
