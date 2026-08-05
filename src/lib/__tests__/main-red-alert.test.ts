/**
 * The main-red alert's streak logic.
 *
 * Two failure modes matter more than the happy path: alerting on a red that
 * someone fixes a minute later (noise, and people learn to ignore the alert),
 * and staying quiet through a genuine outage because the API returned nothing.
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs helper, consumed by the workflow via github-script
import { decide, issueBody } from '../../../scripts/main-red-alert.mjs';

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
