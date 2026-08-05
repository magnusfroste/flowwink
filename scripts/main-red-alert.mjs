/**
 * main-red alert — decide whether main has been broken long enough to be worth
 * a human's attention.
 *
 * Context: main went red three times in ten days and each time it was found by
 * the next gate to run, not by anyone noticing. CI already runs on every push
 * to main (Lovable pushes land under the owner's identity, so the
 * `lovable-dev[bot]` skip filter in ci.yml never fires) — the result just goes
 * unwatched.
 *
 * Required checks would close the gap too, but they also block Lovable's
 * direct-to-main flow, which is deliberate. Watching the result instead costs
 * nothing and changes no workflow.
 *
 * The grace window is the whole point. On 5 Aug a run failed at 01:46 and the
 * next commit fixed it at 01:47 — alerting on that would have been noise. Only
 * a failure that SURVIVES the window is worth an issue.
 *
 * Pure function so the streak logic is testable; the workflow supplies the runs.
 */

/** Conclusions that say nothing about main's health — skipped when walking. */
const INCONCLUSIVE = new Set(['cancelled', 'skipped', 'neutral', 'stale', null, undefined]);

const GREEN = new Set(['success']);

/**
 * @param {Array<{conclusion: string|null, created_at: string, head_sha: string, html_url: string}>} runs
 *   Completed CI runs on main, newest first.
 * @param {number} nowMs
 * @param {number} graceMinutes  How long main may stay red before we speak up.
 * @returns {{state: 'green'|'grace'|'red'|'unknown', minutesRed: number|null,
 *            sha: string|null, url: string|null, streak: number, redSince: string|null}}
 */
export function decide(runs, nowMs, graceMinutes = 30) {
  const conclusive = (runs || []).filter((r) => !INCONCLUSIVE.has(r?.conclusion));

  if (conclusive.length === 0) {
    // No signal at all — do NOT alert. An empty API response looks identical to
    // "everything is fine", and crying wolf on an outage teaches people to
    // ignore the alert.
    return { state: 'unknown', minutesRed: null, sha: null, url: null, streak: 0, redSince: null };
  }

  const latest = conclusive[0];
  if (GREEN.has(latest.conclusion)) {
    return { state: 'green', minutesRed: null, sha: latest.head_sha, url: latest.html_url, streak: 0, redSince: null };
  }

  // Walk back through consecutive failures to find when the streak began — a
  // second failing commit does not reset the clock, otherwise a rapid series of
  // broken pushes would hold the alert off forever.
  let oldest = latest;
  let streak = 0;
  for (const run of conclusive) {
    if (GREEN.has(run.conclusion)) break;
    oldest = run;
    streak++;
  }

  const redSinceMs = Date.parse(oldest.created_at);
  const minutesRed = Number.isNaN(redSinceMs) ? 0 : Math.floor((nowMs - redSinceMs) / 60000);

  return {
    state: minutesRed >= graceMinutes ? 'red' : 'grace',
    minutesRed,
    sha: latest.head_sha,
    url: latest.html_url,
    streak,
    redSince: oldest.created_at,
  };
}

/** Issue body. Rebuilt on every check so the issue always shows current state. */
export function issueBody({ minutesRed, sha, url, streak, redSince }) {
  return [
    `**main has been red for ~${minutesRed} minutes.**`,
    '',
    `- Failing since: \`${redSince}\` (${streak} consecutive failing run${streak === 1 ? '' : 's'})`,
    `- Latest failing commit: \`${sha}\``,
    `- Run: ${url}`,
    '',
    'This issue closes itself as soon as a CI run on main succeeds.',
    '',
    '<sub>Opened by `.github/workflows/main-red-alert.yml`. It watches the CI',
    'result on main rather than blocking merges, so direct-to-main pushes keep',
    'working.</sub>',
  ].join('\n');
}
