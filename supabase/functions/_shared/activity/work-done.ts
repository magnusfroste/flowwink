/**
 * The work-done contract — how a scheduled run says whether it did anything.
 *
 * WHY. Every cron tick wrote one agent_activity row whether or not the skill
 * found work. On old liteit that was ~14 800 of 18 138 rows: reindex_consultants
 * on an instance with zero consultants, qualify_lead with zero leads,
 * process_due_social_posts with an empty queue — all of them "success", all of
 * them empty. The journal stopped being a record of what the operator did and
 * became a record of the clock ticking.
 *
 * THE CONTRACT, NOT A SNIFFER. A run is idle when its result SAYS SO, by
 * carrying a top-level `work_done` integer equal to 0. Nothing here reads
 * messages, counts array lengths or recognises skill names: that would be the
 * same enumerate-what-you-know mistake as guarding an allowlist of files
 * (see CLAUDE.md, "Guard design: discover, don't enumerate"), and a cousin of
 * Law 1's hardcoded routing. A handler that has not adopted the contract
 * returns null here — UNKNOWN, never idle — so silence keeps its row.
 *
 * WHAT COUNTS. `work_done` is the number of units the run actually changed —
 * profiles embedded, posts published, leads qualified, emails sent, violations
 * opened. Not rows scanned, not policies checked: a sweep that looked at 40
 * tickets and touched none did no work.
 */

/** The single key a handler declares. One fact, one reader. */
export const WORK_DONE_KEY = 'work_done';

/**
 * The count a result declares, or null when it declares nothing.
 * Null is the honest answer for every handler that predates the contract.
 */
export function declaredWorkDone(result: unknown): number | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  const raw = (result as Record<string, unknown>)[WORK_DONE_KEY];
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return null;
  return Math.trunc(raw);
}

/**
 * Should this run be left out of the journal?
 *
 * Three conditions, all required — the two guards matter as much as the count:
 *  - `scheduled`: only an unattended tick. A human or an agent that asked for
 *    this skill gets its receipt, even when the answer is "nothing to do".
 *  - `!failed`: a failure is always worth a row. That is the whole point of
 *    keeping one.
 *  - a DECLARED zero. Undeclared is unknown, and unknown keeps its row.
 */
export function isIdleScheduledRun(
  result: unknown,
  opts: { scheduled: boolean; failed: boolean },
): boolean {
  if (!opts.scheduled || opts.failed) return false;
  return declaredWorkDone(result) === 0;
}
