/**
 * proof alert — did the fleet get a proved main last night, and if not, why?
 *
 * Since 2026-11-11 the nightly fork sync waits for the fresh-install proof
 * (nightly-fork-sync.yml: gate → proof → sync). That makes a red proof SAFE —
 * nothing unproved is deployed — and silent: six sites simply stay on
 * yesterday's main, and nobody is told. On the first evening the new order
 * existed, main could not be installed from zero at all (a migration proof
 * that only fails on a virgin instance) and it was found because a person
 * happened to be looking.
 *
 * Two things are worth a person's attention:
 *
 *   red    the latest completed sync run did not succeed. Its proof was red,
 *          main moved during the proof, or the sync itself failed. The fleet
 *          is on an older main until someone acts.
 *   stale  no sync has succeeded for longer than a day and a half. The
 *          schedule did not fire, or every run since was cancelled — the
 *          absence of a run looks exactly like a quiet night.
 *
 * Pure, so the decision is unit-tested; the workflow supplies the runs.
 */

/** Conclusions that say nothing either way — a cancelled run is not a verdict. */
const INCONCLUSIVE = new Set(['cancelled', 'skipped', 'neutral', 'stale', null, undefined]);

/**
 * @param {Array<{conclusion: string|null, created_at: string, html_url: string, head_sha?: string, event?: string}>} runs
 *   Completed runs of the nightly fork sync, newest first.
 * @param {number} nowMs
 * @param {number} staleHours  How long the fleet may go without a successful sync.
 * @returns {{state: 'ok'|'red'|'stale'|'unknown', hoursSinceGreen: number|null,
 *            url: string|null, lastGreenAt: string|null, redSince: string|null, streak: number}}
 */
export function decide(runs, nowMs, staleHours = 36) {
  const conclusive = (runs || []).filter((r) => !INCONCLUSIVE.has(r?.conclusion));
  if (conclusive.length === 0) {
    // No signal — an empty answer from the API must never read as an alarm.
    return { state: 'unknown', hoursSinceGreen: null, url: null, lastGreenAt: null, redSince: null, streak: 0 };
  }

  const lastGreen = conclusive.find((r) => r.conclusion === 'success') ?? null;
  const greenMs = lastGreen ? Date.parse(lastGreen.created_at) : NaN;
  const hoursSinceGreen = Number.isNaN(greenMs) ? null : Math.floor((nowMs - greenMs) / 3_600_000);

  const latest = conclusive[0];
  if (latest.conclusion !== 'success') {
    let oldest = latest;
    let streak = 0;
    for (const run of conclusive) {
      if (run.conclusion === 'success') break;
      oldest = run;
      streak++;
    }
    return {
      state: 'red', hoursSinceGreen, url: latest.html_url,
      lastGreenAt: lastGreen?.created_at ?? null, redSince: oldest.created_at, streak,
    };
  }

  if (hoursSinceGreen !== null && hoursSinceGreen >= staleHours) {
    return { state: 'stale', hoursSinceGreen, url: latest.html_url, lastGreenAt: latest.created_at, redSince: null, streak: 0 };
  }
  return { state: 'ok', hoursSinceGreen, url: latest.html_url, lastGreenAt: latest.created_at, redSince: null, streak: 0 };
}

/** The issue's body: what happened, what it means for the sites, what to do. */
export function issueBody(verdict, staleHours = 36) {
  const since = verdict.lastGreenAt ? `The last successful sync was ${verdict.lastGreenAt}` : 'No successful sync is on record';
  if (verdict.state === 'stale') {
    return [
      `**No fork sync has succeeded for ${verdict.hoursSinceGreen} hours** (the limit is ${staleHours}).`,
      '',
      `${since}. Nothing failed — nothing ran: the schedule did not fire, or every run since was cancelled.`,
      '',
      '**What it means:** the sites are on the main of that sync. Nothing unproved was deployed.',
      '',
      '**What to do:** Actions → *Nightly fork sync* → *Run workflow*. It proves main from zero first, then syncs.',
    ].join('\n');
  }
  return [
    `**The nightly fork sync did not go through** — ${verdict.streak} run${verdict.streak === 1 ? '' : 's'} in a row since ${verdict.redSince}.`,
    '',
    `Run: ${verdict.url}`,
    '',
    'The sync waits for the fresh-install proof. Open the run and read which job is red:',
    '- **prove main from zero** — main does not install or a process fails. That is a defect on main; fix it, then run the sync again.',
    '- **merge-upstream on every fork**, step *Is main still what was proved?* — a merge landed during the proof. Run the sync again.',
    '- **merge-upstream on every fork**, step *Sync* — a fork refused the merge (token, conflict). The run names the fork.',
    '',
    `**What it means:** the sites are still on an older main. ${since}. Nothing unproved was deployed.`,
    '',
    'This issue closes by itself when a sync succeeds.',
  ].join('\n');
}
