import { describe } from 'vitest';

/**
 * `describe` for suites that talk to a live Supabase instance.
 *
 * Runs when the instance is configured AND answered the startup probe (see
 * src/test/live-db-probe.ts); skips otherwise. Two skip reasons, both
 * environment facts rather than code defects:
 *   • unconfigured — no VITE_SUPABASE_URL/KEY (CI without a DB)
 *   • down — configured but the project did not answer
 *
 * Import this instead of hand-rolling `URL && KEY ? describe : describe.skip`,
 * which only covered the first case and let the second surface as `fetch
 * failed` assertion errors.
 */
export const LIVE_DB_STATE = () => process.env.FLOWWINK_LIVE_DB ?? 'unconfigured';

export const describeIfLiveDb = ((...args: Parameters<typeof describe>) => {
  if (LIVE_DB_STATE() === 'up') return describe(...args);
  return describe.skip(...args);
}) as typeof describe;

/**
 * For suites that need a SERVICE-ROLE key on top of a reachable instance —
 * they read tables whose RLS blocks anon (agent_skills, ledger internals), so
 * the publishable key is not enough.
 *
 * Exists because the first version of this helper dropped that second
 * condition: the suites had hand-rolled `URL && SERVICE_KEY ? describe :
 * describe.skip`, the rewrite replaced it with the reachability check alone,
 * and the moment the instance came back up they ran keyless and died on
 * "supabaseKey is required". Reachability and authorisation are two different
 * preconditions; a helper that collapses them turns one green build into a red
 * one for the wrong reason.
 */
export const describeIfServiceKey = ((...args: Parameters<typeof describe>) => {
  const hasKey = Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  );
  if (LIVE_DB_STATE() === 'up' && hasKey) return describe(...args);
  return describe.skip(...args);
}) as typeof describe;
