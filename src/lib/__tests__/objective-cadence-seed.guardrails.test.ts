import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: create_objective TEACHES the model to declare a structured cadence
 * for recurring goals — so the cadence guard in reason.ts can actually bind.
 *
 * Incident (liteit, proof week, 2026-07-23): a "publish a blog post every day"
 * objective was created with constraints {"språk":"svenska"} and NO cadence.
 * partitionByCadence only limits objectives that DECLARE constraints.cadence,
 * so this one ran on every ~3h heartbeat and published ~8 posts/day onto a live
 * customer instance (18 in three days). The goal's "varje dag" text is invisible
 * to the guard — prose describes, only structure constrains. Fix lives at
 * creation (the interface), not in the ReAct loop (Law 1): the constraints param
 * description AND the instructions must demand cadence for a recurring goal.
 */

const root = process.cwd();
const seed = readFileSync(join(root, 'src/lib/modules/flowpilot-module.ts'), 'utf8');
const block = seed.slice(seed.indexOf("name: 'create_objective'"), seed.indexOf("name: 'learn_from_data'"));

describe('create_objective cadence guidance', () => {
  it('the constraints PARAM description demands cadence for recurring goals', () => {
    // Param descriptions are seen at call time — the pre-call lever.
    expect(block).toMatch(/constraints\.cadence/);
    expect(block).toMatch(/every heartbeat/);
  });

  it('the instructions spell out the cadence shape and the failure it prevents', () => {
    expect(block).toMatch(/Cadence — REQUIRED for any recurring goal/);
    expect(block).toMatch(/"counts": "<skill_name>", "max": <n>, "per": "day" \| "week"/);
    // The concrete incident is documented so the lesson survives.
    expect(block).toMatch(/~8 posts\/day on a live customer instance/);
  });

  it('the reason.ts cadence guard still reads structured cadence only (fail-open)', () => {
    const reason = readFileSync(join(root, 'supabase/functions/_shared/pilot/reason.ts'), 'utf8');
    expect(reason).toMatch(/o\.constraints\?\.cadence/);
    expect(reason).toMatch(/Malformed config fails OPEN/);
  });
});
