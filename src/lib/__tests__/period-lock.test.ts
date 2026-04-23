import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

/**
 * Period-lock unit tests for time_entries.
 *
 * Calls the SECURITY DEFINER RPC `run_period_lock_tests()` which seeds three
 * accounting periods (open / closed / locked), then exercises 20 scenarios
 * including timezone edge-cases and late submissions, and finally cleans up.
 *
 * Skipped automatically when VITE_SUPABASE_URL is not configured (CI without DB).
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const describeIfDb = SUPABASE_URL && SUPABASE_KEY ? describe : describe.skip;

describeIfDb('time_entries period-lock guard', () => {
  it('blocks every illegal mutation in closed/locked periods (20 scenarios)', async () => {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);
    const { data, error } = await supabase.rpc('run_period_lock_tests');

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data!.length).toBeGreaterThanOrEqual(20);

    const failures = (data as Array<{ test_name: string; passed: boolean; detail: string }>)
      .filter((r) => !r.passed)
      .map((r) => `${r.test_name}: ${r.detail}`);

    expect(failures, `Failed scenarios:\n${failures.join('\n')}`).toEqual([]);
  }, 30_000);
});
