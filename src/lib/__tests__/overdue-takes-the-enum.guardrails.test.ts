import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "Overdue" takes the trigger type as the table holds it (2026-11-16).
 *
 * automation_is_overdue was declared with `text` and called with the enum
 * column agent_automations.trigger_type. Postgres does not cast an enum to
 * find a function: check_operations raised on every call, the pull request's
 * skill smoke filed it under "other errors" and stayed green, and the night's
 * proof went red on the view sweep — no fork was synced.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf-8');

describe('a function SQL cannot find is a bug, not a review item', () => {
  const smoke = read('scripts/local-smoke.ts');
  const BUG = new RegExp(smoke.match(/const BUG = \/(.+)\/i;/)![1], 'i');

  it('the smoke turns red on Postgres\' own "function … does not exist"', () => {
    expect(BUG.test('RPC check_operations failed: function public.automation_is_overdue(boolean, automation_trigger_type, jsonb, timestamp with time zone, timestamp with time zone) does not exist')).toBe(true);
  });

  it('…and still leaves wrong parameter NAMES to the caller (PostgREST says "Could not find the function")', () => {
    expect(BUG.test("RPC x failed: Could not find the function public.x(p_a) in the schema cache — the parameter names likely don't match the function signature.")).toBe(false);
    expect(BUG.test('title is required')).toBe(false);
  });
});

describe('automation_is_overdue answers for the enum column', () => {
  const fix = read('supabase/migrations/20261116100000_forsenat-tar-triggertypen-som-den-ar.sql');

  it('the enum form exists and answers through the text form — one rule', () => {
    expect(fix).toMatch(/p_trigger_type public\.automation_trigger_type/);
    expect(fix).toMatch(/SELECT public\.automation_is_overdue\(p_enabled, p_trigger_type::text,/);
  });

  it('its proof calls the read that broke, and is not skipped when a function is missing', () => {
    const proof = fix.slice(fix.indexOf('DO $proof$'));
    expect(proof).toMatch(/v := public\.check_operations\(\);/);
    expect(proof).toMatch(/FROM public\.agent_automations;/);
    expect(proof).not.toMatch(/WHEN undefined_function|WHEN others/);
  });
});
