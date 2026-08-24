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

/**
 * How long until this verdict's grace window expires, in ms. Zero for anything
 * that is not waiting.
 *
 * The alert evaluates on two triggers: CI completing on main, and a cron
 * schedule nominally set to every 15 minutes. On 5 Aug main was red for 43 minutes and NO issue opened — the logic
 * was right every time it ran, but it was never asked at the right moment. The
 * `workflow_run` checks all landed inside the window (main went quiet after the
 * last failing push), and the cron — despite its 15-minute schedule — actually
 * delivered 72 minutes apart: 20:42 and 21:54, straddling the whole red period.
 *
 * GitHub's scheduled triggers are best-effort and throttle hard under load, so
 * a 30-minute grace window cannot be guaranteed an evaluation by cron at all.
 * The run that sees `grace` therefore waits the window out itself and
 * re-decides, instead of handing the decisive check to the least reliable
 * trigger we have.
 */
export function remainingGraceMs(verdict, graceMinutes = 30) {
  if (!verdict || verdict.state !== 'grace') return 0;
  const elapsed = typeof verdict.minutesRed === 'number' ? verdict.minutesRed : 0;
  return Math.max(0, (graceMinutes - elapsed) * 60_000);
}

/**
 * Poll interval while waiting out a grace window. Short enough that a main
 * which goes green mid-wait ends the job promptly, capped so we never sleep
 * past the moment the window expires.
 */
export function waitStepMs(verdict, graceMinutes = 30, maxStepMs = 60_000) {
  const remaining = remainingGraceMs(verdict, graceMinutes);
  if (remaining === 0) return 0;
  // +5s so the next look happens just AFTER the boundary, never a hair before.
  return Math.min(maxStepMs, remaining + 5_000);
}

/** Issue body. Rebuilt on every check so the issue always shows current state. */
/**
 * @param greenPrs Open PRs whose own CI is passing — candidate fixes.
 *
 * WHY THIS SECTION EXISTS
 * -----------------------
 * 2026-08-24: main sat red for 43 hours. This alert did its job perfectly —
 * 28 comments, each one accurate. And the fix was already open, already green,
 * already mergeable, the whole time (PR #267). Nobody connected the two, because
 * the alert only ever reported the SYMPTOM.
 *
 * An alert that names a problem repeatedly and never names an available action
 * becomes furniture. So the body now lists open PRs that are themselves green.
 * They are CANDIDATES, not a diagnosis — a green PR need not be the fix — but
 * "here are three things that would make this go away" is an action, and
 * "main is still red" on its 28th repetition is not.
 */
export function issueBody({ minutesRed, sha, url, streak, redSince, greenPrs = [] }) {
  const candidates = greenPrs.length
    ? [
        '',
        `**${greenPrs.length} open PR${greenPrs.length === 1 ? ' is' : 's are'} green right now** — one may already fix this:`,
        ...greenPrs.map((p) => `- #${p.number} — ${p.title}`),
        '',
        '<sub>Green here means that PR\'s own CI passed. It is a candidate, not a',
        'diagnosis — check that it addresses the failure above before merging.</sub>',
      ]
    : [];

  return [
    `**main has been red for ~${minutesRed} minutes.**`,
    '',
    `- Failing since: \`${redSince}\` (${streak} consecutive failing run${streak === 1 ? '' : 's'})`,
    `- Latest failing commit: \`${sha}\``,
    `- Run: ${url}`,
    ...candidates,
    '',
    'This issue closes itself as soon as a CI run on main succeeds.',
    '',
    '<sub>Opened by `.github/workflows/main-red-alert.yml`. It watches the CI',
    'result on main rather than blocking merges, so direct-to-main pushes keep',
    'working.</sub>',
  ].join('\n');
}
