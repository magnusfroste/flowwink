import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { describeIfServiceKey } from '@/test/live-db';

/**
 * Period-lock unit tests for time_entries.
 *
 * Calls the SECURITY DEFINER RPC `run_period_lock_tests()` which seeds three
 * accounting periods (open / closed / locked), then exercises 20 scenarios
 * including timezone edge-cases and late submissions, and finally cleans up.
 *
 * Runs as SERVICE ROLE: the harness seeds periods and mutates time entries,
 * and the anon role carries PostgREST's 8 s statement timeout — twenty
 * scenarios on a busy dev instance overran it (57014, 2026-09-06). A seeding
 * harness is not an anon surface. Skipped when no service key is configured.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;


describeIfServiceKey('time_entries period-lock guard', () => {
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
