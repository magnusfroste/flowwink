/**
 * The main-red alert's streak logic.
 *
 * Two failure modes matter more than the happy path: alerting on a red that
 * someone fixes a minute later (noise, and people learn to ignore the alert),
 * and staying quiet through a genuine outage because the API returned nothing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// plain .mjs helper, consumed by the workflow via github-script
import { decide, issueBody, remainingGraceMs, waitStepMs } from '../../../scripts/main-red-alert.mjs';

const NOW = Date.parse('2026-08-05T12:00:00Z');
const minutesAgo = (m: number) => new Date(NOW - m * 60000).toISOString();

const run = (conclusion: string | null, mAgo: number, sha = 'abc1234') => ({
  conclusion,
  created_at: minutesAgo(mAgo),
  head_sha: sha,
  html_url: `https://github.com/o/r/actions/runs/${mAgo}`,
});

describe('decide — green', () => {
  it('reports green when the newest conclusive run succeeded', () => {
    const d = decide([run('success', 5), run('failure', 90)], NOW);
    expect(d.state).toBe('green');
    expect(d.minutesRed).toBeNull();
  });

  it('a fix on top of a long red streak is green immediately', () => {
    const d = decide([run('success', 1), run('failure', 200), run('failure', 240)], NOW);
    expect(d.state).toBe('green');
    expect(d.streak).toBe(0);
  });
});

describe('decide — the grace window', () => {
  it('stays quiet for a failure younger than the window', () => {
    // The real 5 Aug case: failed 01:46, fixed 01:47.
    expect(decide([run('failure', 1)], NOW).state).toBe('grace');
    expect(decide([run('failure', 29)], NOW).state).toBe('grace');
  });

  it('alerts once the failure survives the window', () => {
    expect(decide([run('failure', 30)], NOW).state).toBe('red');
    expect(decide([run('failure', 31)], NOW).state).toBe('red');
  });

  it('honours a custom window', () => {
    expect(decide([run('failure', 10)], NOW, 5).state).toBe('red');
    expect(decide([run('failure', 10)], NOW, 60).state).toBe('grace');
  });
});

describe('decide — the streak clock does not reset', () => {
  it('measures from the FIRST failure, not the newest one', () => {
    // Broken at T-90; three more broken pushes since. Measuring from the newest
    // would restart the 30-minute clock on every push and never alert.
    const d = decide(
      [run('failure', 2, 'newest'), run('failure', 40), run('failure', 90, 'oldest')],
      NOW,
    );
    expect(d.state).toBe('red');
    expect(d.minutesRed).toBe(90);
    expect(d.streak).toBe(3);
    expect(d.redSince).toBe(minutesAgo(90));
  });

  it('stops the walk at the last green run', () => {
    const d = decide(
      [run('failure', 45), run('failure', 60), run('success', 70), run('failure', 500)],
      NOW,
    );
    expect(d.streak).toBe(2);
    expect(d.minutesRed).toBe(60);
  });

  it('reports the NEWEST failing sha even though it dates the streak from the oldest', () => {
    const d = decide([run('failure', 5, 'newest'), run('failure', 90, 'oldest')], NOW);
    expect(d.sha).toBe('newest');
    expect(d.redSince).toBe(minutesAgo(90));
  });
});

describe('decide — inconclusive runs are not signal', () => {
  it.each(['cancelled', 'skipped', 'neutral', 'stale', null])(
    'skips %s when finding the newest real result',
    (conclusion) => {
      const d = decide([run(conclusion as string | null, 1), run('success', 10)], NOW);
      expect(d.state).toBe('green');
    },
  );

  it('a cancelled run in the middle does not break a failure streak', () => {
    const d = decide([run('failure', 5), run('cancelled', 20), run('failure', 90)], NOW);
    expect(d.streak).toBe(2);
    expect(d.minutesRed).toBe(90);
  });
});

describe('decide — no signal is not an alert', () => {
  it('returns unknown for an empty or all-inconclusive list', () => {
    expect(decide([], NOW).state).toBe('unknown');
    expect(decide([run('cancelled', 5), run('skipped', 9)], NOW).state).toBe('unknown');
  });

  it('survives a missing or malformed list rather than throwing', () => {
    expect(decide(undefined as never, NOW).state).toBe('unknown');
    expect(decide(null as never, NOW).state).toBe('unknown');
  });

  it('does not report a red for an unparseable timestamp', () => {
    const d = decide([{ conclusion: 'failure', created_at: 'not-a-date', head_sha: 'x', html_url: 'u' }], NOW);
    expect(d.minutesRed).toBe(0);
    expect(d.state).toBe('grace');
  });
});

describe('issueBody — candidate fixes', () => {
  /**
   * 2026-08-24: main was red 43 hours. The alert commented 28 times, every
   * comment accurate, and never once mentioned that PR #267 was open, green and
   * mergeable. Reporting a symptom repeatedly is not the same as reporting an
   * action, and the difference is what made 28 correct notices ignorable.
   */
  it('names open green PRs as candidates when there are any', () => {
    const body = issueBody({
      minutesRed: 2580, sha: 'abc1234', url: 'https://example.test/run/1',
      streak: 12, redSince: '2026-08-22T13:18:00Z',
      greenPrs: [
        { number: 267, title: "fix(types): get main's blocking typecheck green again" },
        { number: 270, title: 'fix(inventory): the two holes delegation left' },
      ],
    });

    expect(body).toContain('2 open PRs are green right now');
    expect(body).toContain('#267');
    expect(body).toContain('#270');
    // Stated as a candidate, never as a diagnosis — a green PR need not be the fix.
    expect(body).toContain('candidate, not a');
  });

  it('says nothing about candidates when none are green', () => {
    const body = issueBody({
      minutesRed: 31, sha: 'a', url: 'u', streak: 1, redSince: 'x', greenPrs: [],
    });
    expect(body).not.toContain('green right now');
    expect(body).not.toContain('candidate');
  });

  it('omits the section entirely when the caller passes no greenPrs at all', () => {
    // The workflow falls back to `[]` when the PR listing throws, but a caller
    // that never sets the field must not crash or render an empty header.
    const body = issueBody({ minutesRed: 31, sha: 'a', url: 'u', streak: 1, redSince: 'x' });
    expect(body).toContain('main has been red');
    expect(body).not.toContain('green right now');
  });

  it('uses singular wording for exactly one candidate', () => {
    const body = issueBody({
      minutesRed: 31, sha: 'a', url: 'u', streak: 1, redSince: 'x',
      greenPrs: [{ number: 267, title: 'the fix' }],
    });
    expect(body).toContain('1 open PR is green right now');
  });
});

describe('issueBody', () => {
  it('carries everything needed to act without opening the run', () => {
    const body = issueBody({
      minutesRed: 90,
      sha: 'deadbee',
      url: 'https://github.com/o/r/actions/runs/1',
      streak: 3,
      redSince: '2026-08-05T10:30:00Z',
    });
    expect(body).toContain('90 minutes');
    expect(body).toContain('deadbee');
    expect(body).toContain('https://github.com/o/r/actions/runs/1');
    expect(body).toContain('3 consecutive failing runs');
    expect(body).toContain('2026-08-05T10:30:00Z');
  });

  it('says "run" not "runs" for a single failure', () => {
    const body = issueBody({ minutesRed: 31, sha: 'a', url: 'u', streak: 1, redSince: 'x' });
    expect(body).toContain('1 consecutive failing run');
    expect(body).not.toContain('failing runs');
  });
});

// ─── The grace-window wait ──────────────────────────────────────────────────
// On 5 Aug main was red for 43 minutes and no issue opened. The logic was right
// every time it ran — it was never asked at the right moment. Every
// workflow_run check landed inside the window (main went quiet after the last
// failing push), and the cron, despite a 15-minute schedule, delivered 72
// minutes apart: 20:42 and 21:54, straddling the entire red period.
//
// So the run that sees `grace` waits the window out itself instead of handing
// the decisive check to GitHub's least reliable trigger.
describe('remainingGraceMs — how long until the verdict can change', () => {
  it('is the rest of the window for a verdict still in grace', () => {
    expect(remainingGraceMs({ state: 'grace', minutesRed: 25 }, 30)).toBe(5 * 60_000);
    expect(remainingGraceMs({ state: 'grace', minutesRed: 0 }, 30)).toBe(30 * 60_000);
  });

  it('is zero for any verdict that is not waiting', () => {
    for (const state of ['green', 'red', 'unknown']) {
      expect(remainingGraceMs({ state, minutesRed: 5 }, 30)).toBe(0);
    }
    expect(remainingGraceMs(null as never, 30)).toBe(0);
    expect(remainingGraceMs(undefined as never, 30)).toBe(0);
  });

  it('never goes negative when the window has already passed', () => {
    // decide() would not return 'grace' here, but the helper must not produce a
    // negative sleep if it ever did.
    expect(remainingGraceMs({ state: 'grace', minutesRed: 45 }, 30)).toBe(0);
  });

  it('treats a missing elapsed time as "just started", not as done', () => {
    // Rounding down to zero would make the loop spin instead of waiting.
    expect(remainingGraceMs({ state: 'grace', minutesRed: null }, 30)).toBe(30 * 60_000);
  });
});

describe('waitStepMs — poll cadence while waiting', () => {
  it('caps each sleep so a main that goes green mid-wait is noticed promptly', () => {
    // 25 minutes left, but we look again within the minute.
    expect(waitStepMs({ state: 'grace', minutesRed: 5 }, 30)).toBe(60_000);
  });

  it('overshoots the boundary slightly rather than waking a hair early', () => {
    // Only reachable once the remaining window is under the poll cap: 30 s left
    // → sleep 35 s, so the next look is definitely PAST the boundary. Waking a
    // hair early would burn a whole loop iteration for nothing.
    expect(waitStepMs({ state: 'grace', minutesRed: 29.5 }, 30)).toBe(35_000);
  });

  it('the cap wins while the window is still wide', () => {
    // 2 minutes left is still more than the 60 s cap, so we look again in 60 s
    // — frequent checks matter more than sleeping exactly to the boundary.
    expect(waitStepMs({ state: 'grace', minutesRed: 28 }, 30)).toBe(60_000);
    // Raise the cap and the boundary-aware value shows through.
    expect(waitStepMs({ state: 'grace', minutesRed: 28 }, 30, 10 * 60_000)).toBe(2 * 60_000 + 5_000);
  });

  it('returns zero when there is nothing to wait for, so the loop exits', () => {
    expect(waitStepMs({ state: 'green', minutesRed: null }, 30)).toBe(0);
    expect(waitStepMs({ state: 'red', minutesRed: 31 }, 30)).toBe(0);
    expect(waitStepMs({ state: 'grace', minutesRed: 30 }, 30)).toBe(0);
  });

  it('always makes progress — no zero-length sleep while still in grace', () => {
    // A step of 0 with state still 'grace' would spin the loop against the API.
    for (let elapsed = 0; elapsed < 30; elapsed++) {
      const step = waitStepMs({ state: 'grace', minutesRed: elapsed }, 30);
      expect(step, `elapsed=${elapsed} produced a ${step}ms sleep`).toBeGreaterThan(0);
    }
  });

  it('the whole wait is bounded by the window, not by the number of checks', () => {
    // Worst case: start at 0 elapsed, sleep 60s at a time. The loop can never
    // run longer than the window itself — which is what timeout-minutes: 45
    // in the workflow backstops.
    let elapsed = 0;
    let total = 0;
    for (let i = 0; i < 100 && elapsed < 30; i++) {
      total += waitStepMs({ state: 'grace', minutesRed: elapsed }, 30);
      elapsed += 1;
    }
    expect(total).toBeLessThanOrEqual(30 * 60_000 + 5_000);
  });
});

// ─── Wiring ─────────────────────────────────────────────────────────────────
// The helpers above are only worth anything if the workflow actually uses them.
// Deleting the loop would leave them as dead code and silently restore the
// 5 Aug behaviour — right logic, never asked at the right moment.
describe('the workflow waits out the grace window itself', () => {
  const workflow = readFileSync(
    join(process.cwd(), '.github/workflows/main-red-alert.yml'),
    'utf-8',
  );

  it('imports and uses the wait helper', () => {
    expect(workflow).toMatch(/waitStepMs/);
  });

  it('loops while the verdict is grace, re-fetching each time', () => {
    expect(workflow).toMatch(/while \(verdict\.state === 'grace'/);
    // Re-deciding on stale runs would spin forever; the loop must re-fetch.
    expect(workflow).toMatch(/verdict = decide\(await fetchRuns\(\)/);
  });

  it('bounds the wait — in code and with a job timeout', () => {
    // Two independent bounds: the deadline in the loop, and timeout-minutes as
    // the backstop if a larger grace_minutes is dispatched.
    expect(workflow).toMatch(/const deadline = Date\.now\(\)/);
    expect(workflow).toMatch(/Date\.now\(\) < deadline/);
    expect(workflow).toMatch(/timeout-minutes:\s*\d+/);
  });
});
