import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// plain .mjs helper, consumed by the workflow via github-script
import { decide, issueBody } from '../../../scripts/proof-alert.mjs';

/**
 * The fleet was not synced, and somebody is told (2026-11-11).
 *
 * The sync waits for the proof, so a red proof deploys nothing — and says
 * nothing. These pin when the alert speaks: a sync that did not go through,
 * and a sync that never ran.
 */
const H = 3_600_000;
const now = Date.parse('2026-11-12T08:00:00Z');
const run = (hoursAgo: number, conclusion: string | null) => ({
  conclusion, created_at: new Date(now - hoursAgo * H).toISOString(), html_url: `https://example.test/run/${hoursAgo}`,
});

describe('proof alert', () => {
  it('a green night is quiet', () => {
    expect(decide([run(6, 'success'), run(30, 'success')], now)).toMatchObject({ state: 'ok', hoursSinceGreen: 6 });
  });

  it('a sync that did not go through is red, counted from the first red night', () => {
    const v = decide([run(6, 'failure'), run(30, 'failure'), run(54, 'success')], now);
    expect(v).toMatchObject({ state: 'red', streak: 2, hoursSinceGreen: 54, url: 'https://example.test/run/6' });
    expect(v.redSince).toBe(run(30, 'failure').created_at);
    expect(issueBody(v)).toMatch(/Nothing unproved was deployed/);
    expect(issueBody(v)).toMatch(/2 runs in a row/);
  });

  it('a cancelled run is not a verdict — the night before still stands', () => {
    expect(decide([run(2, 'cancelled'), run(6, 'success')], now).state).toBe('ok');
    expect(decide([run(2, 'cancelled'), run(6, 'failure')], now).state).toBe('red');
  });

  it('a sync that never ran is stale: silence is not a quiet night', () => {
    const v = decide([run(40, 'success')], now, 36);
    expect(v).toMatchObject({ state: 'stale', hoursSinceGreen: 40 });
    expect(issueBody(v, 36)).toMatch(/No fork sync has succeeded for 40 hours/);
    expect(decide([run(35, 'success')], now, 36).state).toBe('ok');
  });

  it('no signal is not an alarm', () => {
    expect(decide([], now).state).toBe('unknown');
    expect(decide([run(1, 'cancelled')], now).state).toBe('unknown');
  });

  it('the workflow watches the sync, speaks once, and closes itself', () => {
    const wf = readFileSync(join(__dirname, '../../../.github/workflows/proof-alert.yml'), 'utf-8');
    expect(wf).toMatch(/workflow_run:\s+workflows: \['Nightly fork sync'\]/);
    expect(wf).toMatch(/schedule:/);                                   // the run that never happened
    expect(wf).toMatch(/workflow_id: 'nightly-fork-sync\.yml'/);
    expect(wf).toMatch(/github\.repository == 'magnusfroste\/flowwink'/);
    expect(wf).toMatch(/if \(existing\) \{[\s\S]*issues\.update/);       // one issue, kept current
    expect(wf).toMatch(/state: 'closed'/);
    // The name it watches is the sync workflow's real name.
    expect(readFileSync(join(__dirname, '../../../.github/workflows/nightly-fork-sync.yml'), 'utf-8')).toMatch(/^name: Nightly fork sync$/m);
  });
});
